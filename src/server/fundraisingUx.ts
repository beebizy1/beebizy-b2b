import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { SCHOOL_GRADES, type DonationCampaign, type FundraisingBroadcastAudience, type FundraisingDashboard, type FundraisingOrganizationProfile, type FundraisingPledge, type FundraisingReports, type ItemSubmission, type PublicBidderProfile, type PublicDonationCampaign, type PublicItemIntakePayload, type PublicItemSubmissionDraft } from "../data/entities.ts";
import { auctionStateForSubmissionStatus, isFundraisingBroadcastAudience, submissionStatusPublishesCatalog, suggestedStartingBidCents } from "../data/fundraising.ts";
import { normalizeAuctionPageSettings } from "../data/auctionSettings.ts";
import { db } from "./db.ts";
import { HttpError, newId, type RequestContext } from "./auth.ts";
import { notifyAuctionDonorThankYou, sendEmail } from "./notify.ts";
import * as s from "./schema.ts";
import { databaseErrorMessage } from "./errorMessage.ts";
import { auctionPaymentMode, bidderPaymentReady } from "../data/auctionPayments.ts";

const DEFAULT_CATEGORIES = [
  "Experiences",
  "Travel & Stays",
  "Dining",
  "Entertainment",
  "Sports",
  "Kids & Family",
  "Class Projects",
  "Wine & Spirits",
  "Gift Cards",
  "Live Auction",
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function parseFundraisingBroadcastAudience(value: string): FundraisingBroadcastAudience {
  if (isFundraisingBroadcastAudience(value)) return value;
  throw new HttpError(400, "Choose a valid fundraising audience.");
}

function mapSubmission(row: typeof s.itemSubmissions.$inferSelect): ItemSubmission {
  return {
    id: row.id,
    eventId: row.eventId,
    donorId: row.donorId,
    submittedBy: row.submittedBy,
    publicToken: row.publicToken,
    payload: row.payload,
    status: row.status,
    auctionItemId: row.auctionItemId,
    requestedChanges: row.requestedChanges,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

async function deliverFundraisingBroadcast(input: {
  workspaceId: string;
  eventId: string;
  sentBy: string;
  audienceFilter: Record<string, unknown>;
  itemIds: string[];
  channels: string[];
  message: string;
  messageForRecipient?: (recipient: typeof s.auctionBidders.$inferSelect) => string;
  subject: string;
  recipients: Array<typeof s.auctionBidders.$inferSelect>;
}): Promise<{ recipients: number; sent: number; failed: number }> {
  const broadcastId = newId("broadcast");
  await db.insert(s.fundraisingBroadcasts).values({
    id: broadcastId,
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    sentBy: input.sentBy,
    audienceFilter: input.audienceFilter,
    itemIds: input.itemIds,
    channels: input.channels,
    message: input.message,
    recipientCount: 0,
  });
  if (input.recipients.length === 0) return { recipients: 0, sent: 0, failed: 0 };
  const channel = input.channels.join(",") || "in_app";
  const claims = await db.execute<{ bidder_id: string }>(sql`
    select bidder_id from claim_fundraising_broadcast_recipients(
      ${input.workspaceId}, ${input.eventId}, ${broadcastId},
      string_to_array(${input.recipients.map((recipient) => recipient.id).join(",")}, ',')::text[],
      ${channel}
    )
  `);
  const claimedIds = new Set(claims.rows.map((row) => row.bidder_id));
  const eligible = input.recipients.filter((recipient) => claimedIds.has(recipient.id));
  let sent = 0;
  let failed = 0;
  if (input.channels.includes("email")) {
    for (let start = 0; start < eligible.length; start += 10) {
      const batch = eligible.slice(start, start + 10);
      const outcomes = await Promise.all(batch.map((recipient) => sendEmail({
        to: recipient.email,
        replyTo: "hello@beebizy.com",
        idempotencyKey: `fundraising-broadcast-${broadcastId}-${recipient.id}`,
        subject: input.subject,
        text: input.messageForRecipient?.(recipient) ?? input.message,
      })));
      sent += outcomes.filter((outcome) => outcome.status === "sent").length;
      failed += outcomes.filter((outcome) => outcome.status !== "sent").length;
    }
  }
  await db.update(s.fundraisingBroadcasts).set({ recipientCount: eligible.length }).where(eq(s.fundraisingBroadcasts.id, broadcastId));
  return { recipients: eligible.length, sent, failed };
}

export async function getFundraisingOrganizationProfile(ctx: RequestContext): Promise<FundraisingOrganizationProfile> {
  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId)).limit(1);
  if (!workspace) throw new HttpError(404, "Your workspace is no longer available.");
  return {
    legalName: workspace.legalName,
    ein: workspace.ein,
    orgType: workspace.fundraisingOrgType,
    receiptPrefix: workspace.receiptPrefix,
    raffleEnabled: workspace.raffleEnabled,
    raffleRegistrationConfirmed: workspace.raffleRegistrationConfirmed,
    defaultCoverFees: workspace.defaultCoverFees,
  };
}

export async function updateFundraisingOrganizationProfile(
  ctx: RequestContext,
  input: FundraisingOrganizationProfile,
): Promise<FundraisingOrganizationProfile> {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new HttpError(403, "Only an owner or admin can change fundraising settings.");
  if (input.raffleEnabled && !input.raffleRegistrationConfirmed) {
    throw new HttpError(409, "Confirm the organization's raffle registration before enabling raffles.");
  }
  const receiptPrefix = input.receiptPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "BEE";
  await db.update(s.workspaces).set({
    legalName: input.legalName?.trim() || null,
    ein: input.ein?.trim() || null,
    fundraisingOrgType: input.orgType,
    receiptPrefix,
    raffleEnabled: input.raffleEnabled,
    raffleRegistrationConfirmed: input.raffleRegistrationConfirmed,
    defaultCoverFees: input.defaultCoverFees,
    updatedAt: new Date(),
  }).where(eq(s.workspaces.id, ctx.workspaceId));
  return getFundraisingOrganizationProfile(ctx);
}

async function ensureDefaultCategories(workspaceId: string): Promise<void> {
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(s.auctionCategories)
    .where(eq(s.auctionCategories.workspaceId, workspaceId));
  if (Number(total) > 0) return;
  await db.insert(s.auctionCategories).values(DEFAULT_CATEGORIES.map((name, index) => ({
    id: newId("acat"), workspaceId, name, sortOrder: index + 1,
  }))).onConflictDoNothing();
}

export async function listAuctionCategories(workspaceId: string): Promise<Array<{ id: string; name: string; sortOrder: number }>> {
  await ensureDefaultCategories(workspaceId);
  return db.select({ id: s.auctionCategories.id, name: s.auctionCategories.name, sortOrder: s.auctionCategories.sortOrder })
    .from(s.auctionCategories).where(eq(s.auctionCategories.workspaceId, workspaceId))
    .orderBy(asc(s.auctionCategories.sortOrder), asc(s.auctionCategories.name));
}

export async function createAuctionCategory(ctx: RequestContext, name: string) {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new HttpError(400, "Enter a category name.");
  const [{ maxOrder } = { maxOrder: 0 }] = await db.select({ maxOrder: sql<number>`coalesce(max(${s.auctionCategories.sortOrder}), 0)` })
    .from(s.auctionCategories).where(eq(s.auctionCategories.workspaceId, ctx.workspaceId));
  const [row] = await db.insert(s.auctionCategories).values({ id: newId("acat"), workspaceId: ctx.workspaceId, name: trimmed, sortOrder: Number(maxOrder) + 1 })
    .onConflictDoUpdate({ target: [s.auctionCategories.workspaceId, s.auctionCategories.name], set: { updatedAt: new Date() } }).returning();
  return { id: row!.id, name: row!.name, sortOrder: row!.sortOrder };
}

export async function publicItemIntake(auctionToken: string, priorDonorToken?: string | null): Promise<PublicItemIntakePayload | null> {
  const [row] = await db.select({ event: s.events, workspace: s.workspaces }).from(s.events)
    .innerJoin(s.workspaces, eq(s.events.workspaceId, s.workspaces.id))
    .where(eq(s.events.auctionPublicToken, auctionToken)).limit(1);
  if (!row || row.event.status === "cancelled") return null;
  const categories = await listAuctionCategories(row.workspace.id);
  let prefill: Partial<PublicItemSubmissionDraft> | undefined;
  if (priorDonorToken) {
    const [prior] = await db.select({ donor: s.auctionDonors, item: s.auctionItems }).from(s.auctionDonors)
      .leftJoin(s.auctionItems, eq(s.auctionItems.donorId, s.auctionDonors.id))
      .where(and(eq(s.auctionDonors.workspaceId, row.workspace.id), eq(s.auctionDonors.publicToken, priorDonorToken)))
      .orderBy(desc(s.auctionItems.createdAt)).limit(1);
    if (prior) {
      const anonymous = prior.donor.recognitionPreference === "Anonymous";
      prefill = {
        donorName: prior.donor.contactName || prior.donor.businessName,
        donorEmail: prior.donor.email ?? "",
        donorPhone: prior.donor.phone,
        grades: prior.donor.gradeTags,
        creditText: anonymous ? "" : prior.donor.recognitionPreference || prior.donor.businessName,
        anonymous,
        donorKind: prior.donor.donorKind === "business" ? "business" : "family",
        companyName: prior.donor.donorKind === "business" ? prior.donor.businessName : null,
        website: prior.donor.website,
        logoUrl: prior.donor.logoUrl,
        itemTitle: prior.item?.title ?? "",
        description: prior.item?.description ?? "",
        photoUrls: prior.item?.photoUrls ?? [],
        category: prior.item?.category ?? "",
        estimatedValueCents: prior.item?.estimatedValueCents ?? 0,
        fairMarketValueCents: prior.item?.fairMarketValueCents ?? 0,
        restrictions: prior.item?.restrictions,
        expirationDate: prior.item?.expiresAt?.toISOString() ?? null,
        deliveryMethod: prior.item?.deliveryMethod ?? "",
        suggestedStartingBidCents: prior.item?.startingBidCents,
        notesToSchool: null,
        isServiceOrUse: prior.item?.isServiceOrUse ?? false,
      };
    }
  }
  return {
    eventTitle: row.event.title,
    organizationName: row.workspace.legalName || row.workspace.name,
    categories: categories.map((category) => category.name),
    grades: SCHOOL_GRADES,
    prefill,
  };
}

export async function reinvitePastItemDonors(ctx: RequestContext, eventId: string): Promise<{ sent: number; failed: number }> {
  const [event] = await db.select({ title: s.events.title, token: s.events.auctionPublicToken }).from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event?.token) throw new HttpError(409, "Create the public auction link before inviting prior donors.");
  const rows = await db.select({ email: s.auctionDonors.email, name: s.auctionDonors.contactName, businessName: s.auctionDonors.businessName, publicToken: s.auctionDonors.publicToken }).from(s.auctionDonors).where(and(
    eq(s.auctionDonors.workspaceId, ctx.workspaceId), sql`${s.auctionDonors.eventId} <> ${eventId}`, sql`${s.auctionDonors.email} is not null`,
  ));
  const recipients = [...new Map(rows.map((row) => [row.email!.toLowerCase(), row])).values()];
  const intakeUrl = `${(process.env.APP_ORIGIN || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "")}/donate/event/${event.token}`;
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const personalizedUrl = `${intakeUrl}?prior=${encodeURIComponent(recipient.publicToken)}`;
    const outcome = await sendEmail({ to: recipient.email!, subject: `Donate an auction item to ${event.title}`, text: `Hi ${recipient.name || recipient.businessName},\n\nThank you for supporting a past fundraiser. We would love to invite you to donate an item to ${event.title}. Your prior donor and item details are prefilled so you can review and update them.\n\nSubmit your item: ${personalizedUrl}`, idempotencyKey: `auction-donor-reinvite-${eventId}-${createHash("sha256").update(recipient.email!.toLowerCase()).digest("hex").slice(0, 12)}` });
    if (outcome.status === "sent") sent += 1; else failed += 1;
  }
  return { sent, failed };
}

function validatePublicSubmission(input: PublicItemSubmissionDraft): void {
  if (!input.donorName.trim()) throw new HttpError(400, "Enter the donor name.");
  if (!EMAIL.test(input.donorEmail.trim())) throw new HttpError(400, "Enter a valid donor email.");
  if (input.grades.length === 0) throw new HttpError(400, "Choose at least one grade or school relationship.");
  if (!input.itemTitle.trim() || !input.description.trim() || !input.category.trim()) throw new HttpError(400, "Complete the item title, description, and category.");
  if (input.photoUrls.length < 1 || input.photoUrls.length > 5) throw new HttpError(400, "Upload between one and five item photos.");
  if (!Number.isInteger(input.estimatedValueCents) || input.estimatedValueCents < 0) throw new HttpError(400, "Enter the estimated value.");
  if (!Number.isInteger(input.fairMarketValueCents) || input.fairMarketValueCents < 0) throw new HttpError(400, "Enter the fair market value.");
  if (!input.deliveryMethod.trim()) throw new HttpError(400, "Choose a delivery method.");
}

export async function submitPublicItem(
  auctionToken: string,
  input: PublicItemSubmissionDraft,
): Promise<PublicItemIntakePayload> {
  validatePublicSubmission(input);
  const [row] = await db.select({ event: s.events, workspace: s.workspaces }).from(s.events)
    .innerJoin(s.workspaces, eq(s.events.workspaceId, s.workspaces.id))
    .where(eq(s.events.auctionPublicToken, auctionToken)).limit(1);
  if (!row || row.event.status === "cancelled") throw new HttpError(404, "This donation link is no longer active.");

  const email = input.donorEmail.trim().toLowerCase();
  const donorId = newId("adon");
  const donorName = input.donorKind === "business" && input.companyName?.trim() ? input.companyName.trim() : input.donorName.trim();
  await db.insert(s.auctionDonors).values({
    id: donorId,
    workspaceId: row.workspace.id,
    eventId: row.event.id,
    businessName: donorName,
    contactName: input.donorName.trim(),
    email,
    phone: input.donorPhone?.trim() || null,
    donorKind: input.donorKind,
    website: input.website?.trim() || null,
    logoUrl: input.logoUrl?.trim() || null,
    gradeTags: input.grades,
    publicToken: crypto.randomUUID(),
    solicitationStatus: "received",
    recognitionPreference: input.anonymous ? "Anonymous" : input.creditText.trim(),
    sortOrder: 0,
  });

  const itemId = newId("auc");
  const submissionId = newId("isub");
  const publicToken = crypto.randomUUID();
  const startingBidCents = input.suggestedStartingBidCents ?? suggestedStartingBidCents(input.estimatedValueCents);
  const [{ maxOrder } = { maxOrder: 0 }] = await db.select({ maxOrder: sql<number>`coalesce(max(${s.auctionItems.sortOrder}), 0)` })
    .from(s.auctionItems).where(eq(s.auctionItems.eventId, row.event.id));
  const payload = { ...input, donorEmail: email } as unknown as Record<string, unknown>;
  await db.batch([
    db.insert(s.auctionItems).values({
      id: itemId,
      workspaceId: row.workspace.id,
      eventId: row.event.id,
      donorId,
      donorName,
      itemSubmissionId: submissionId,
      title: input.itemTitle.trim(),
      description: input.description.trim(),
      imageUrl: input.photoUrls[0]!,
      photoUrls: input.photoUrls,
      estimatedValueCents: input.estimatedValueCents,
      fairMarketValueCents: input.fairMarketValueCents,
      startingBidCents,
      category: input.category.trim(),
      restrictions: input.restrictions?.trim() || null,
      expiresAt: input.expirationDate ? new Date(input.expirationDate) : null,
      deliveryMethod: input.deliveryMethod.trim(),
      creditText: input.anonymous ? "Anonymous" : input.creditText.trim(),
      notesToSchool: input.notesToSchool?.trim() || null,
      isServiceOrUse: input.isServiceOrUse === true,
      overFiveThousandFlag: input.fairMarketValueCents > 500_000,
      readinessStatus: "incomplete",
      status: "open",
      auctionType: "silent",
      itemType: "silent",
      sortOrder: Number(maxOrder) + 1,
    }),
    db.insert(s.itemSubmissions).values({
      id: submissionId,
      workspaceId: row.workspace.id,
      eventId: row.event.id,
      donorId,
      submittedBy: input.donorName.trim(),
      publicToken,
      payload,
      status: "submitted",
      auctionItemId: itemId,
    }),
    db.insert(s.inKindAcknowledgments).values({
      id: newId("ika"),
      workspaceId: row.workspace.id,
      eventId: row.event.id,
      itemSubmissionId: submissionId,
      donorId,
      donorName,
      donorEmail: email,
      description: input.itemTitle.trim(),
    }),
  ]);

  await notifyAuctionDonorThankYou({
    donorId: submissionId,
    to: email,
    contactName: input.donorName.trim(),
    donorName,
    eventTitle: row.event.title,
    itemTitles: [input.itemTitle.trim()],
    receivedDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  });
  const result = await publicItemIntake(auctionToken);
  return { ...result!, submission: mapSubmission((await db.select().from(s.itemSubmissions).where(eq(s.itemSubmissions.id, submissionId)).limit(1))[0]!) };
}

export async function listItemSubmissions(ctx: RequestContext, eventId: string): Promise<ItemSubmission[]> {
  const rows = await db.select().from(s.itemSubmissions).where(and(
    eq(s.itemSubmissions.workspaceId, ctx.workspaceId), eq(s.itemSubmissions.eventId, eventId),
  )).orderBy(desc(s.itemSubmissions.submittedAt));
  return rows.map(mapSubmission);
}

export async function updateItemSubmission(
  ctx: RequestContext,
  eventId: string,
  submissionId: string,
  input: { status: ItemSubmission["status"]; requestedChanges?: string | null },
): Promise<ItemSubmission> {
  const [current] = await db.select().from(s.itemSubmissions).where(and(
    eq(s.itemSubmissions.id, submissionId), eq(s.itemSubmissions.eventId, eventId), eq(s.itemSubmissions.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!current) throw new HttpError(404, "That item submission no longer exists.");
  const [event] = await db.select({ auctionPage: s.events.auctionPage }).from(s.events).where(and(
    eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  const now = new Date();
  const auctionPage = normalizeAuctionPageSettings(event.auctionPage);
  await db.batch([
    db.update(s.itemSubmissions).set({ status: input.status, requestedChanges: input.requestedChanges?.trim() || null, updatedAt: now })
      .where(eq(s.itemSubmissions.id, submissionId)),
    current.auctionItemId
      ? db.update(s.auctionItems).set({
          ...auctionStateForSubmissionStatus(input.status),
          updatedAt: now,
        }).where(eq(s.auctionItems.id, current.auctionItemId))
      : db.update(s.events).set({ updatedAt: now }).where(eq(s.events.id, eventId)),
    db.update(s.events).set({
      auctionPage: submissionStatusPublishesCatalog(input.status) ? { ...auctionPage, catalogPublished: true } : auctionPage,
      updatedAt: now,
    }).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))),
  ]);
  if (input.status === "needs_info" && input.requestedChanges?.trim()) {
    const [donor] = current.donorId
      ? await db.select().from(s.auctionDonors).where(eq(s.auctionDonors.id, current.donorId)).limit(1)
      : [];
    if (donor?.email) {
      await sendEmail({
        to: donor.email,
        replyTo: "hello@beebizy.com",
        idempotencyKey: `item-submission-changes-${submissionId}-${now.getTime()}`,
        subject: `Update requested for your ${current.payload.itemTitle ?? "auction item"}`,
        text: [
          `Hi ${donor.contactName || donor.businessName},`,
          "",
          "The event team requested an update to your auction item:",
          input.requestedChanges.trim(),
          "",
          `Open your private submission: ${(process.env.APP_ORIGIN || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "")}/donate/submission/${current.publicToken}`,
        ].join("\n"),
      });
    }
  }
  const [updated] = await db.select().from(s.itemSubmissions).where(eq(s.itemSubmissions.id, submissionId)).limit(1);
  return mapSubmission(updated!);
}

export async function mergeAuctionItems(
  ctx: RequestContext,
  eventId: string,
  itemIds: string[],
  title: string,
): Promise<{ packageItemId: string }> {
  const uniqueIds = [...new Set(itemIds)].slice(0, 20);
  if (uniqueIds.length < 2) throw new HttpError(400, "Choose at least two auction items to create a package.");
  if (!title.trim()) throw new HttpError(400, "Enter a package title.");
  const items = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.workspaceId, ctx.workspaceId), eq(s.auctionItems.eventId, eventId), inArray(s.auctionItems.id, uniqueIds),
  ));
  if (items.length !== uniqueIds.length) throw new HttpError(404, "One or more selected auction items no longer exist.");
  if (items.some((item) => item.status === "won" || item.paymentReceivedAt != null)) throw new HttpError(409, "Sold or paid items cannot be merged into a package.");
  const packageItemId = newId("auc");
  const estimatedValueCents = items.reduce((sum, item) => sum + (item.estimatedValueCents ?? 0), 0);
  const fairMarketValueCents = items.reduce((sum, item) => sum + (item.fairMarketValueCents ?? 0), 0);
  const [{ maxOrder } = { maxOrder: 0 }] = await db.select({ maxOrder: sql<number>`coalesce(max(${s.auctionItems.sortOrder}), 0)` }).from(s.auctionItems).where(eq(s.auctionItems.eventId, eventId));
  await db.batch([
    db.insert(s.auctionItems).values({
      id: packageItemId, workspaceId: ctx.workspaceId, eventId, title: title.trim(),
      description: items.map((item) => item.title).join(" + "),
      photoUrls: items.flatMap((item) => item.photoUrls).slice(0, 5),
      imageUrl: items.find((item) => item.imageUrl)?.imageUrl ?? null,
      estimatedValueCents, fairMarketValueCents, startingBidCents: suggestedStartingBidCents(estimatedValueCents),
      category: "Packages", restrictions: items.map((item) => item.restrictions).filter(Boolean).join(" · ") || null,
      creditText: [...new Set(items.map((item) => item.creditText || item.donorName).filter(Boolean))].join(" + ") || null,
      readinessStatus: "draft", isPublished: false, status: "open", auctionType: "silent", itemType: "silent", sortOrder: Number(maxOrder) + 1,
    }),
    db.update(s.auctionItems).set({ status: "closed", isPublished: false, notesToSchool: `Merged into package ${title.trim()} (${packageItemId})`, updatedAt: new Date() }).where(inArray(s.auctionItems.id, uniqueIds)),
  ]);
  return { packageItemId };
}

export async function extendAuctionItem(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  minutes: number,
  notify = true,
): Promise<{ closesAt: string; extensionMinutes: number }> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new HttpError(400, "Choose an extension from 1 to 120 minutes.");
  const [item] = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.id, itemId), eq(s.auctionItems.eventId, eventId), eq(s.auctionItems.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!item) throw new HttpError(404, "That auction item no longer exists.");
  if (item.status !== "open") throw new HttpError(409, "Only an open item can be extended.");
  const previous = item.closesAt ?? new Date();
  const next = new Date(previous.getTime() + minutes * 60_000);
  await db.batch([
    db.update(s.auctionItems).set({ closesAt: next, extensionMinutes: item.extensionMinutes + minutes, updatedAt: new Date() })
      .where(eq(s.auctionItems.id, itemId)),
    db.insert(s.auctionCloseChanges).values({
      id: newId("acc"), itemId, previousClosesAt: item.closesAt, newClosesAt: next,
      reason: "manual_extend", changedBy: ctx.userId,
    }),
  ]);
  if (notify) {
    const [event] = await db.select({ title: s.events.title, token: s.events.auctionPublicToken }).from(s.events).where(eq(s.events.id, eventId)).limit(1);
    const recipients = [...new Map([...(await broadcastRecipientRows(eventId, "bidders", [itemId])), ...(await broadcastRecipientRows(eventId, "watchers", [itemId]))].map((recipient) => [recipient.id, recipient])).values()];
    const message = `Bidding on ${item.title} was extended ${minutes} minute${minutes === 1 ? "" : "s"}. Current bid: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((item.currentBidCents ?? item.startingBidCents ?? 0) / 100)}.`;
    const auctionUrl = event?.token ? `${(process.env.APP_ORIGIN || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "")}/auction/${event.token}#item-${itemId}` : null;
    const fullMessage = `${message}${auctionUrl ? ` Bid now: ${auctionUrl}` : ""}`;
    await deliverFundraisingBroadcast({ workspaceId: ctx.workspaceId, eventId, sentBy: ctx.userId, audienceFilter: { audience: "bidders_and_watchers", reason: "extension" }, itemIds: [itemId], channels: ["email", "in_app"], message: fullMessage, messageForRecipient: (recipient) => recipient.id === item.winningBidderId ? `${fullMessage} Extended - you're still winning.` : fullMessage, subject: `Auction extended - ${item.title}`, recipients });
  }
  return { closesAt: next.toISOString(), extensionMinutes: item.extensionMinutes + minutes };
}

export async function extendAuctionItems(
  ctx: RequestContext,
  eventId: string,
  itemIds: string[],
  minutes: number,
  notify = true,
): Promise<{ extended: number }> {
  const uniqueIds = [...new Set(itemIds)].slice(0, 100);
  if (uniqueIds.length === 0) throw new HttpError(400, "Choose at least one auction item.");
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new HttpError(400, "Choose an extension from 1 to 120 minutes.");
  const extendedIds: string[] = [];
  for (const itemId of uniqueIds) {
    try {
      await extendAuctionItem(ctx, eventId, itemId, minutes, false);
      extendedIds.push(itemId);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) throw error;
    }
  }
  const extended = extendedIds.length;
  if (extended === 0) throw new HttpError(409, "None of the selected items are open for extension.");
  if (notify) {
    const items = await db.select({ id: s.auctionItems.id, title: s.auctionItems.title, winningBidderId: s.auctionItems.winningBidderId }).from(s.auctionItems).where(inArray(s.auctionItems.id, extendedIds));
    const recipients = [...new Map([...(await broadcastRecipientRows(eventId, "bidders", extendedIds)), ...(await broadcastRecipientRows(eventId, "watchers", extendedIds))].map((recipient) => [recipient.id, recipient])).values()];
    const message = `${extended} auction item${extended === 1 ? "" : "s"} extended ${minutes} minute${minutes === 1 ? "" : "s"}: ${items.map((item) => item.title).join(", ")}.`;
    await deliverFundraisingBroadcast({ workspaceId: ctx.workspaceId, eventId, sentBy: ctx.userId, audienceFilter: { audience: "bidders_and_watchers", reason: "bulk_extension" }, itemIds: extendedIds, channels: ["email", "in_app"], message, messageForRecipient: (recipient) => { const leading = items.filter((item) => item.winningBidderId === recipient.id).map((item) => item.title); return leading.length ? `${message} Extended - you're still winning on ${leading.join(", ")}.` : message; }, subject: "Auction items extended", recipients });
  }
  return { extended };
}

export async function reopenAuctionItem(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  minutes: number,
): Promise<{ closesAt: string; status: "open" }> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new HttpError(400, "Choose a reopen window from 1 to 120 minutes.");
  const [item] = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.id, itemId), eq(s.auctionItems.eventId, eventId), eq(s.auctionItems.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!item) throw new HttpError(404, "That auction item no longer exists.");
  if (item.status !== "closed") throw new HttpError(409, "Only a closed, unsold item can be reopened. Undo an awarded sale instead.");
  const next = new Date(Date.now() + minutes * 60_000);
  await db.batch([
    db.update(s.auctionItems).set({ status: "open", closesAt: next, updatedAt: new Date() }).where(eq(s.auctionItems.id, itemId)),
    db.insert(s.auctionCloseChanges).values({
      id: newId("acc"), itemId, previousClosesAt: item.closesAt, newClosesAt: next,
      reason: "reopen", changedBy: ctx.userId,
    }),
  ]);
  if (item.winningBidderId) {
    const [leader] = await db.select({ email: s.auctionBidders.email, name: s.auctionBidders.name }).from(s.auctionBidders)
      .where(eq(s.auctionBidders.id, item.winningBidderId)).limit(1);
    if (leader) await sendEmail({
      to: leader.email,
      subject: `${item.title} has reopened`,
      text: `Hi ${leader.name}, bidding on ${item.title} has reopened for ${minutes} minutes. Your existing bid remains on the item.`,
      idempotencyKey: `auction-reopen-${itemId}-${next.toISOString()}`,
    });
  }
  return { closesAt: next.toISOString(), status: "open" };
}

export async function fundraisingDashboard(ctx: RequestContext, eventId: string): Promise<FundraisingDashboard> {
  const [items, bids, bidders, pledges, ticketRows, donationRows, grades, donors, winners] = await Promise.all([
    db.select().from(s.auctionItems).where(and(eq(s.auctionItems.workspaceId, ctx.workspaceId), eq(s.auctionItems.eventId, eventId))),
    db.select().from(s.auctionBids).where(and(eq(s.auctionBids.workspaceId, ctx.workspaceId), eq(s.auctionBids.eventId, eventId))),
    db.select().from(s.auctionBidders).where(and(eq(s.auctionBidders.workspaceId, ctx.workspaceId), eq(s.auctionBidders.eventId, eventId))),
    db.select().from(s.fundraisingPledges).where(and(eq(s.fundraisingPledges.workspaceId, ctx.workspaceId), eq(s.fundraisingPledges.eventId, eventId))),
    db.select().from(s.ticketOrders).where(and(eq(s.ticketOrders.workspaceId, ctx.workspaceId), eq(s.ticketOrders.eventId, eventId), eq(s.ticketOrders.status, "paid"))),
    db.select().from(s.donations).where(and(eq(s.donations.workspaceId, ctx.workspaceId), eq(s.donations.eventId, eventId), eq(s.donations.status, "paid"))),
    db.select({ grade: s.householdGrades.grade, householdId: s.householdGrades.householdId }).from(s.householdGrades).where(eq(s.householdGrades.workspaceId, ctx.workspaceId)),
    db.select({ id: s.auctionDonors.id, gradeTags: s.auctionDonors.gradeTags }).from(s.auctionDonors).where(and(eq(s.auctionDonors.workspaceId, ctx.workspaceId), eq(s.auctionDonors.eventId, eventId))),
    db.select().from(s.auctionItemWinners).where(and(eq(s.auctionItemWinners.workspaceId, ctx.workspaceId), eq(s.auctionItemWinners.eventId, eventId), sql`${s.auctionItemWinners.reversedAt} is null`)),
  ]);
  const silentCents = items.filter((item) => item.auctionType === "silent" && item.status === "won").reduce((sum, item) => sum + (item.currentBidCents ?? 0), 0);
  const liveCents = items.filter((item) => item.auctionType === "live" && item.status === "won").reduce((sum, item) => sum + (item.currentBidCents ?? 0), 0);
  const pledgesCents = pledges.reduce((sum, pledge) => sum + pledge.amountCents, 0);
  const ticketsCents = ticketRows.reduce((sum, order) => sum + order.amountCents, 0);
  const donationsCents = donationRows.reduce((sum, donation) => sum + donation.amountCents + donation.feesCoveredCents, 0);
  const byGrade = [...new Set([...grades.map((grade) => grade.grade), ...donors.flatMap((donor) => donor.gradeTags)])].sort().map((grade) => {
    const householdIds = new Set(grades.filter((row) => row.grade === grade).map((row) => row.householdId));
    const bidderIds = new Set(bidders.filter((bidder) => bidder.householdId && householdIds.has(bidder.householdId)).map((bidder) => bidder.id));
    const bidderRaised = winners.filter((winner) => bidderIds.has(winner.bidderId)).reduce((sum, winner) => sum + winner.amountCents, 0)
      + pledges.filter((pledge) => pledge.bidderId != null && bidderIds.has(pledge.bidderId)).reduce((sum, pledge) => sum + pledge.amountCents, 0);
    const directGiving = donationRows.filter((donation) => donation.householdId && householdIds.has(donation.householdId)).reduce((sum, donation) => sum + donation.amountCents + donation.feesCoveredCents, 0);
    const donorIds = new Set(donors.filter((donor) => donor.gradeTags.includes(grade)).map((donor) => donor.id));
    return {
      grade,
      households: householdIds.size,
      itemsDonated: items.filter((item) => item.donorId && donorIds.has(item.donorId)).length,
      totalRaisedCents: bidderRaised + directGiving,
    };
  });
  return {
    totals: { silentCents, liveCents, pledgesCents, ticketsCents, donationsCents, totalCents: silentCents + liveCents + pledgesCents + ticketsCents + donationsCents },
    bidders: { registered: bidders.length, checkedIn: bidders.filter((bidder) => bidder.checkedInAt).length, remote: bidders.filter((bidder) => !bidder.checkedInAt).length },
    items: { total: items.length, noBids: items.filter((item) => !bids.some((bid) => bid.itemId === item.id)).length, sold: items.filter((item) => item.status === "won").length, sellThroughRate: items.length ? Math.round((items.filter((item) => item.status === "won").length / items.length) * 1000) / 10 : 0 },
    byGrade,
    hotItems: items.filter((item) => item.status === "open" && item.closesAt && item.closesAt.getTime() <= Date.now() + 30 * 60_000 && bids.filter((bid) => bid.itemId === item.id && bid.createdAt.getTime() >= Date.now() - 5 * 60_000).length >= 3).map((item) => ({ id: item.id, title: item.title, bidCountLastFiveMinutes: bids.filter((bid) => bid.itemId === item.id && bid.createdAt.getTime() >= Date.now() - 5 * 60_000).length, closesAt: item.closesAt?.toISOString() ?? null })),
    noBidClosingSoon: items.filter((item) => item.status === "open" && item.closesAt && item.closesAt.getTime() <= Date.now() + 30 * 60_000 && !bids.some((bid) => bid.itemId === item.id)).map((item) => ({ id: item.id, title: item.title, closesAt: item.closesAt?.toISOString() ?? null })),
  };
}

export async function publicBidderProfile(auctionToken: string, bidderToken: string): Promise<PublicBidderProfile | null> {
  const [row] = await db.select({ bidder: s.auctionBidders, auctionPayLater: s.events.auctionPayLater }).from(s.auctionBidders)
    .innerJoin(s.events, eq(s.auctionBidders.eventId, s.events.id))
    .where(and(eq(s.auctionBidders.publicToken, bidderToken), eq(s.events.auctionPublicToken, auctionToken))).limit(1);
  if (!row) return null;
  const [watches, bids, winningItems, bill, grades] = await Promise.all([
    db.select({ itemId: s.auctionWatches.itemId }).from(s.auctionWatches).where(eq(s.auctionWatches.bidderId, row.bidder.id)),
    db.select({ itemId: s.auctionBids.itemId }).from(s.auctionBids).where(eq(s.auctionBids.bidderId, row.bidder.id)),
    db.select({ itemId: s.auctionItems.id }).from(s.auctionItems).where(eq(s.auctionItems.winningBidderId, row.bidder.id)),
    db.select({ total: s.bidderBills.totalCents }).from(s.bidderBills).where(and(eq(s.bidderBills.eventId, row.bidder.eventId), eq(s.bidderBills.bidderId, row.bidder.id))).limit(1),
    row.bidder.householdId
      ? db.select({ grade: s.householdGrades.grade }).from(s.householdGrades).where(eq(s.householdGrades.householdId, row.bidder.householdId))
      : Promise.resolve([]),
  ]);
  const winning = new Set(winningItems.map((item) => item.itemId));
  const bidItems = new Set(bids.map((bid) => bid.itemId));
  return {
    id: row.bidder.id,
    eventId: row.bidder.eventId,
    name: row.bidder.name,
    email: row.bidder.email,
    phone: row.bidder.phone,
    householdId: row.bidder.householdId,
    attendeeId: row.bidder.attendeeId,
    paddleNumber: row.bidder.paddleNumber,
    hasPaymentMethod: Boolean(row.bidder.paymentMethodId),
    autoChargeOptIn: row.bidder.autoChargeOptIn,
    checkedInAt: row.bidder.checkedInAt?.toISOString() ?? null,
    phoneVerifiedAt: row.bidder.phoneVerifiedAt?.toISOString() ?? null,
    grades: grades.map((grade) => grade.grade),
    participantType: row.bidder.participantType,
    publicToken: row.bidder.publicToken,
    status: row.bidder.status === "blocked" ? "blocked" : "active",
    createdAt: row.bidder.createdAt.toISOString(),
    watchedItemIds: watches.map((watch) => watch.itemId),
    winningItemIds: [...winning],
    outbidItemIds: [...bidItems].filter((itemId) => !winning.has(itemId)),
    totalDueCents: Number(bill[0]?.total ?? 0),
  };
}

export async function toggleAuctionWatch(
  auctionToken: string,
  bidderToken: string,
  itemId: string,
  watched: boolean,
): Promise<{ watched: boolean }> {
  const [row] = await db.select({ bidderId: s.auctionBidders.id, eventId: s.auctionBidders.eventId }).from(s.auctionBidders)
    .innerJoin(s.events, eq(s.auctionBidders.eventId, s.events.id))
    .where(and(eq(s.auctionBidders.publicToken, bidderToken), eq(s.events.auctionPublicToken, auctionToken))).limit(1);
  if (!row) throw new HttpError(404, "This bidder registration is not available.");
  const [item] = await db.select({ id: s.auctionItems.id }).from(s.auctionItems).where(and(eq(s.auctionItems.id, itemId), eq(s.auctionItems.eventId, row.eventId))).limit(1);
  if (!item) throw new HttpError(404, "That auction item is not available.");
  if (watched) await db.insert(s.auctionWatches).values({ itemId, bidderId: row.bidderId }).onConflictDoNothing();
  else await db.delete(s.auctionWatches).where(and(eq(s.auctionWatches.itemId, itemId), eq(s.auctionWatches.bidderId, row.bidderId)));
  return { watched };
}

export async function createPublicPledge(
  auctionToken: string,
  bidderToken: string,
  amountCents: number,
  channel: "in_room" | "remote",
): Promise<FundraisingPledge> {
  if (!Number.isInteger(amountCents) || amountCents < 100) throw new HttpError(400, "Enter a giving amount of at least $1.");
  const [row] = await db.select({ bidder: s.auctionBidders, auctionPayLater: s.events.auctionPayLater, stripeConnectedAccountId: s.workspaces.stripeConnectedAccountId }).from(s.auctionBidders)
    .innerJoin(s.events, eq(s.auctionBidders.eventId, s.events.id))
    .innerJoin(s.workspaces, eq(s.auctionBidders.workspaceId, s.workspaces.id))
    .where(and(eq(s.auctionBidders.publicToken, bidderToken), eq(s.events.auctionPublicToken, auctionToken))).limit(1);
  if (!row) throw new HttpError(404, "This bidder registration is not available.");
  const paymentMode = auctionPaymentMode({ auctionPayLater: row.auctionPayLater, stripeConnectedAccountId: row.stripeConnectedAccountId });
  if (!bidderPaymentReady(paymentMode, Boolean(row.bidder.paymentMethodId))) {
    throw new HttpError(409, "Add a card or wallet before making a pledge.");
  }
  const id = newId("pledge");
  let pledge: typeof s.fundraisingPledges.$inferSelect | undefined;
  try {
    [pledge] = await db.insert(s.fundraisingPledges).values({
      id,
      workspaceId: row.bidder.workspaceId,
      eventId: row.bidder.eventId,
      bidderId: row.bidder.id,
      householdId: row.bidder.householdId,
      amountCents,
      appeal: "fund-a-need",
      channel,
    }).returning();
  } catch (error) {
    const message = databaseErrorMessage(error);
    if (/finalized bidder bill/i.test(message)) throw new HttpError(409, "This bidder's event bill is already finalized. Ask the organizer before adding another pledge.");
    throw error;
  }
  return {
    id: pledge!.id,
    eventId: pledge!.eventId,
    bidderId: pledge!.bidderId,
    householdId: pledge!.householdId,
    amountCents: pledge!.amountCents,
    appeal: pledge!.appeal,
    designation: pledge!.designation,
    channel: pledge!.channel === "in_room" ? "in_room" : "remote",
    anonymous: pledge!.anonymous,
    createdAt: pledge!.createdAt.toISOString(),
  };
}

function mapCampaign(row: typeof s.donationCampaigns.$inferSelect): DonationCampaign {
  return {
    id: row.id,
    eventId: row.eventId,
    publicToken: row.publicToken,
    title: row.title,
    description: row.description,
    goalCents: row.goalCents,
    suggestedAmountsCents: row.suggestedAmountsCents,
    designations: row.designations,
    defaultDesignation: row.defaultDesignation,
    monthlyEnabled: row.monthlyEnabled,
    coverFeesEnabled: row.coverFeesEnabled,
    isActive: row.isActive,
  };
}

export async function listDonationCampaigns(ctx: RequestContext, eventId?: string): Promise<DonationCampaign[]> {
  const rows = await db.select().from(s.donationCampaigns).where(and(
    eq(s.donationCampaigns.workspaceId, ctx.workspaceId),
    eventId ? eq(s.donationCampaigns.eventId, eventId) : sql`true`,
  )).orderBy(desc(s.donationCampaigns.createdAt));
  return rows.map(mapCampaign);
}

export async function createDonationCampaign(
  ctx: RequestContext,
  input: { eventId?: string | null; title: string; description?: string | null; goalCents?: number | null; suggestedAmountsCents?: number[]; designations?: string[]; defaultDesignation?: string | null },
): Promise<DonationCampaign> {
  const title = input.title.trim();
  if (!title) throw new HttpError(400, "Enter a campaign title.");
  const [row] = await db.insert(s.donationCampaigns).values({
    id: newId("campaign"), workspaceId: ctx.workspaceId, eventId: input.eventId || null,
    publicToken: crypto.randomUUID(), title, description: input.description?.trim() || null,
    goalCents: input.goalCents ?? null,
    suggestedAmountsCents: input.suggestedAmountsCents?.filter((amount) => Number.isInteger(amount) && amount > 0).slice(0, 10) ?? [5_000, 10_000, 25_000, 50_000, 100_000],
    designations: input.designations?.map((value) => value.trim()).filter(Boolean).slice(0, 20) ?? [],
    defaultDesignation: input.defaultDesignation?.trim() || null,
  }).returning();
  return mapCampaign(row!);
}

export async function publicDonationCampaign(token: string): Promise<PublicDonationCampaign | null> {
  const [row] = await db.select({ campaign: s.donationCampaigns, workspace: s.workspaces }).from(s.donationCampaigns)
    .innerJoin(s.workspaces, eq(s.donationCampaigns.workspaceId, s.workspaces.id))
    .where(eq(s.donationCampaigns.publicToken, token)).limit(1);
  if (!row || !row.campaign.isActive) return null;
  const [{ raised, donors } = { raised: 0, donors: 0 }] = await db.select({
    raised: sql<number>`coalesce(sum(${s.donations.amountCents} + ${s.donations.feesCoveredCents}), 0)`,
    donors: sql<number>`count(distinct ${s.donations.donorEmail})::integer`,
  }).from(s.donations).where(and(eq(s.donations.campaignId, row.campaign.id), eq(s.donations.status, "paid")));
  return { ...mapCampaign(row.campaign), organizationName: row.workspace.legalName || row.workspace.name, raisedCents: Number(raised), donorCount: Number(donors) };
}

type YearEndStatementSummary = {
  workspaceId: string;
  householdId: string | null;
  taxYear: number;
  payerName: string;
  payerEmail: string;
  amountCents: number;
  deductibleCents: number;
  receiptCount: number;
};

function summarizeYearEndReceipts(
  receipts: Array<typeof s.fundraisingReceipts.$inferSelect>,
  householdRows: Array<typeof s.households.$inferSelect>,
): YearEndStatementSummary[] {
  const householdsById = new Map(householdRows.map((household) => [household.id, household]));
  const supersededReceiptIds = new Set(receipts.map((receipt) => receipt.supersedesReceiptId).filter((id): id is string => Boolean(id)));
  const summaries = new Map<string, YearEndStatementSummary>();
  for (const receipt of receipts) {
    if (supersededReceiptIds.has(receipt.id)) continue;
    const household = receipt.householdId ? householdsById.get(receipt.householdId) : null;
    const payerEmail = (household?.primaryEmail || receipt.payerEmail)?.trim().toLowerCase();
    if (!payerEmail) continue;
    const taxYear = receipt.issuedAt.getUTCFullYear();
    const identity = household ? `household:${household.id}` : `email:${payerEmail}`;
    const key = `${receipt.workspaceId}:${taxYear}:${identity}`;
    const current = summaries.get(key) ?? {
      workspaceId: receipt.workspaceId,
      householdId: household?.id ?? null,
      taxYear,
      payerName: household?.displayName || receipt.payerName,
      payerEmail,
      amountCents: 0,
      deductibleCents: 0,
      receiptCount: 0,
    };
    current.amountCents += receipt.amountCents;
    current.deductibleCents += receipt.deductibleCents;
    current.receiptCount += 1;
    summaries.set(key, current);
  }
  return [...summaries.values()];
}

export async function fundraisingReports(ctx: RequestContext, eventId: string): Promise<FundraisingReports> {
  const [bidders, bidRows, itemRows, winners, pledges, bills, registrations, donors, acknowledgments, grades] = await Promise.all([
    db.select().from(s.auctionBidders).where(and(eq(s.auctionBidders.workspaceId, ctx.workspaceId), eq(s.auctionBidders.eventId, eventId))),
    db.select({ bid: s.auctionBids, bidder: s.auctionBidders, item: s.auctionItems }).from(s.auctionBids)
      .innerJoin(s.auctionBidders, eq(s.auctionBids.bidderId, s.auctionBidders.id))
      .innerJoin(s.auctionItems, eq(s.auctionBids.itemId, s.auctionItems.id))
      .where(and(eq(s.auctionBids.workspaceId, ctx.workspaceId), eq(s.auctionBids.eventId, eventId))),
    db.select().from(s.auctionItems).where(and(eq(s.auctionItems.workspaceId, ctx.workspaceId), eq(s.auctionItems.eventId, eventId))),
    db.select().from(s.auctionItemWinners).where(and(eq(s.auctionItemWinners.workspaceId, ctx.workspaceId), eq(s.auctionItemWinners.eventId, eventId), sql`${s.auctionItemWinners.reversedAt} is null`)),
    db.select().from(s.fundraisingPledges).where(and(eq(s.fundraisingPledges.workspaceId, ctx.workspaceId), eq(s.fundraisingPledges.eventId, eventId))),
    db.select().from(s.bidderBills).where(and(eq(s.bidderBills.workspaceId, ctx.workspaceId), eq(s.bidderBills.eventId, eventId))),
    db.select({ registration: s.registrations, guest: s.guests }).from(s.registrations).innerJoin(s.guests, eq(s.registrations.guestId, s.guests.id)).where(and(eq(s.registrations.workspaceId, ctx.workspaceId), eq(s.registrations.eventId, eventId))),
    db.select().from(s.auctionDonors).where(and(eq(s.auctionDonors.workspaceId, ctx.workspaceId), eq(s.auctionDonors.eventId, eventId))),
    db.select().from(s.inKindAcknowledgments).where(and(eq(s.inKindAcknowledgments.workspaceId, ctx.workspaceId), eq(s.inKindAcknowledgments.eventId, eventId))),
    db.select().from(s.householdGrades).where(eq(s.householdGrades.workspaceId, ctx.workspaceId)),
  ]);
  const bidderReport = bidders.map((bidder) => {
    const bidderBids = bidRows.filter((row) => row.bid.bidderId === bidder.id);
    const bidderWins = winners.filter((winner) => winner.bidderId === bidder.id);
    const bidderPledges = pledges.filter((pledge) => pledge.bidderId === bidder.id);
    const bill = bills.find((candidate) => candidate.bidderId === bidder.id);
    const bidderGrades = bidder.householdId ? grades.filter((grade) => grade.householdId === bidder.householdId).map((grade) => grade.grade).join(", ") : "";
    return { name: bidder.name, email: bidder.email, paddle: bidder.paddleNumber, grade: bidderGrades, location: bidder.checkedInAt ? "In room" : "Remote", itemsBidOn: new Set(bidderBids.map((row) => row.bid.itemId)).size, itemsWon: bidderWins.length, highestBidCents: bidderBids.reduce((max, row) => Math.max(max, row.bid.amountCents), 0), totalWonCents: bidderWins.reduce((sum, winner) => sum + winner.amountCents, 0), fundANeedCents: bidderPledges.reduce((sum, pledge) => sum + pledge.amountCents, 0), totalGivenCents: bill?.totalCents ?? 0, paidStatus: bill?.status ?? "not billed" };
  });
  const bidderGrade = (bidder: typeof s.auctionBidders.$inferSelect) => bidder.householdId ? grades.filter((grade) => grade.householdId === bidder.householdId).map((grade) => grade.grade).join(", ") : "";
  const bidderLocation = (bidder: typeof s.auctionBidders.$inferSelect) => bidder.checkedInAt ? "In room" : "Remote";
  const uniqueValues = (values: Array<string | null | undefined>) => [...new Set(values.flatMap((value) => value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []))].join(", ");
  const bids = bidRows.map(({ bid, bidder, item }) => ({ item: item.title, bidder: bidder.name, paddle: bidder.paddleNumber, grade: bidderGrade(bidder), location: bidderLocation(bidder), amountCents: bid.amountCents, maxBidCents: bid.maximumAmountCents, time: bid.createdAt.toISOString(), channel: bid.channel, outcome: item.winningBidderId === bidder.id ? "Winning" : "Outbid" }));
  const items = itemRows.map((item) => {
    const itemBids = bidRows.filter((row) => row.bid.itemId === item.id);
    const itemWinners = winners.filter((winner) => winner.itemId === item.id);
    const donor = donors.find((candidate) => candidate.id === item.donorId);
    const winningBidders = itemWinners.map((winner) => bidders.find((bidder) => bidder.id === winner.bidderId)).filter(Boolean);
    return { item: item.title, category: item.category, donor: donor?.businessName ?? item.donorName, grade: uniqueValues(winningBidders.map((bidder) => bidderGrade(bidder!))), location: uniqueValues(winningBidders.map((bidder) => bidderLocation(bidder!))), estimatedValueCents: item.estimatedValueCents, fairMarketValueCents: item.fairMarketValueCents, startingBidCents: item.startingBidCents, winningBidCents: item.currentBidCents, percentOfValue: item.fairMarketValueCents ? Math.round(((item.currentBidCents ?? 0) / item.fairMarketValueCents) * 1000) / 10 : null, bidCount: itemBids.length, winners: itemWinners.length, winnerNames: winningBidders.map((bidder) => bidder!.name).join(", "), winnerPaddles: winningBidders.map((bidder) => bidder!.paddleNumber).filter(Boolean).join(", "), paid: Boolean(item.paymentReceivedAt), fulfillment: item.fulfillmentStatus };
  });
  const attendance = registrations.map(({ registration, guest }) => {
    const bidder = bidders.find((candidate) => candidate.attendeeId === guest.id || candidate.email === guest.contact);
    const bill = bidder ? bills.find((candidate) => candidate.bidderId === bidder.id) : null;
    return { name: guest.name, ticketTypeId: registration.ticketTypeId, grade: bidder ? bidderGrade(bidder) : "", location: bidder ? bidderLocation(bidder) : registration.checkedInAt ? "In room" : "", checkedInAt: registration.checkedInAt?.toISOString() ?? null, bidRemotely: bidder ? !bidder.checkedInAt : false, totalGivenCents: bill?.totalCents ?? 0 };
  });
  const dashboard = await fundraisingDashboard(ctx, eventId);
  const payments = bills.map((bill) => {
    const bidder = bidders.find((candidate) => candidate.id === bill.bidderId);
    return { bidder: bidder?.name ?? bill.bidderId, grade: bidder ? bidderGrade(bidder) : "", location: bidder ? bidderLocation(bidder) : "", billTotalCents: bill.totalCents, status: bill.status, paymentMethod: bill.paymentMethod, feesCoveredCents: bill.feesCoveredCents, paidAt: bill.paidAt?.toISOString() ?? null, payoutDate: bill.payoutAvailableAt?.toISOString() ?? null };
  });
  const acknowledgmentRows = donors.map((donor) => ({ donor: donor.businessName, contact: donor.contactName, email: donor.email, grade: donor.gradeTags.join(", "), location: "", items: itemRows.filter((item) => item.donorId === donor.id).length, acknowledgmentSent: acknowledgments.some((acknowledgment) => acknowledgment.donorId === donor.id && acknowledgment.sentAt != null), thankYouStatus: donor.thankYouStatus }));
  const [portfolioEvents, portfolioItems, portfolioBidders, portfolioBills, portfolioPledges, portfolioHouseholds, portfolioReceipts, statementDeliveries] = await Promise.all([
    db.select().from(s.events).where(eq(s.events.workspaceId, ctx.workspaceId)).orderBy(desc(s.events.startsAt)),
    db.select().from(s.auctionItems).where(eq(s.auctionItems.workspaceId, ctx.workspaceId)),
    db.select().from(s.auctionBidders).where(eq(s.auctionBidders.workspaceId, ctx.workspaceId)),
    db.select().from(s.bidderBills).where(eq(s.bidderBills.workspaceId, ctx.workspaceId)),
    db.select().from(s.fundraisingPledges).where(eq(s.fundraisingPledges.workspaceId, ctx.workspaceId)),
    db.select().from(s.households).where(eq(s.households.workspaceId, ctx.workspaceId)),
    db.select().from(s.fundraisingReceipts).where(eq(s.fundraisingReceipts.workspaceId, ctx.workspaceId)),
    db.select().from(s.yearEndStatementDeliveries).where(eq(s.yearEndStatementDeliveries.workspaceId, ctx.workspaceId)),
  ]);
  const historical = portfolioEvents.map((portfolioEvent) => {
    const eventItems = portfolioItems.filter((item) => item.eventId === portfolioEvent.id);
    const eventBidders = portfolioBidders.filter((bidder) => bidder.eventId === portfolioEvent.id);
    const eventBills = portfolioBills.filter((bill) => bill.eventId === portfolioEvent.id && bill.status === "paid");
    const totalRaisedCents = eventBills.reduce((sum, bill) => sum + bill.totalCents, 0);
    return {
      event: portfolioEvent.title,
      year: new Date(portfolioEvent.startsAt).getUTCFullYear(),
      totalRaisedCents,
      bidderCount: eventBidders.length,
      averageGiftCents: eventBills.length ? Math.round(totalRaisedCents / eventBills.length) : 0,
      grade: uniqueValues(eventBidders.map(bidderGrade)),
      location: uniqueValues(eventBidders.map(bidderLocation)),
      remoteSharePercent: eventBidders.length ? Math.round((eventBidders.filter((bidder) => !bidder.checkedInAt).length / eventBidders.length) * 1000) / 10 : 0,
      sellThroughPercent: eventItems.length ? Math.round((eventItems.filter((item) => item.status === "won").length / eventItems.length) * 1000) / 10 : 0,
    };
  }).filter((row) => row.bidderCount > 0 || row.totalRaisedCents > 0);
  const familyHistory = portfolioHouseholds.map((household) => {
    const householdBidders = portfolioBidders.filter((bidder) => bidder.householdId === household.id);
    const bidderIds = new Set(householdBidders.map((bidder) => bidder.id));
    const householdBills = portfolioBills.filter((bill) => bidderIds.has(bill.bidderId));
    const householdPledges = portfolioPledges.filter((pledge) => pledge.bidderId != null && bidderIds.has(pledge.bidderId));
    return {
      household: household.displayName,
      email: household.primaryEmail,
      grade: uniqueValues(grades.filter((grade) => grade.householdId === household.id).map((grade) => grade.grade)),
      location: uniqueValues(householdBidders.map(bidderLocation)),
      events: new Set(householdBidders.map((bidder) => bidder.eventId)).size,
      auctionAndBillTotalCents: householdBills.reduce((sum, bill) => sum + bill.totalCents, 0),
      fundANeedCents: householdPledges.reduce((sum, pledge) => sum + pledge.amountCents, 0),
      lastActiveAt: householdBidders.reduce((latest, bidder) => bidder.createdAt > latest ? bidder.createdAt : latest, household.createdAt).toISOString(),
    };
  }).filter((row) => row.events > 0);
  const itemIntelligence = [...new Set(portfolioItems.map((item) => item.category || "Uncategorized"))].sort().map((category) => {
    const categoryItems = portfolioItems.filter((item) => (item.category || "Uncategorized") === category);
    const soldItems = categoryItems.filter((item) => item.status === "won");
    const totalRaisedCents = soldItems.reduce((sum, item) => sum + (item.currentBidCents ?? 0), 0);
    const totalFmvCents = soldItems.reduce((sum, item) => sum + (item.fairMarketValueCents ?? 0), 0);
    const categoryWinnerIds = new Set(winners.filter((winner) => soldItems.some((item) => item.id === winner.itemId)).map((winner) => winner.bidderId));
    const categoryBidders = portfolioBidders.filter((bidder) => categoryWinnerIds.has(bidder.id));
    return { category, grade: uniqueValues(categoryBidders.map(bidderGrade)), location: uniqueValues(categoryBidders.map(bidderLocation)), items: categoryItems.length, sold: soldItems.length, sellThroughPercent: categoryItems.length ? Math.round((soldItems.length / categoryItems.length) * 1000) / 10 : 0, totalRaisedCents, percentOfFmv: totalFmvCents ? Math.round((totalRaisedCents / totalFmvCents) * 1000) / 10 : null };
  });
  const yearEndStatements = summarizeYearEndReceipts(portfolioReceipts, portfolioHouseholds).map((statement) => ({
    household: statement.householdId ? portfolioHouseholds.find((household) => household.id === statement.householdId)?.displayName ?? statement.payerName : statement.payerName,
    ...statement,
    grade: statement.householdId ? uniqueValues(grades.filter((grade) => grade.householdId === statement.householdId).map((grade) => grade.grade)) : "",
    location: statement.householdId ? uniqueValues(portfolioBidders.filter((bidder) => bidder.householdId === statement.householdId).map(bidderLocation)) : "",
    deliveryStatus: statementDeliveries.find((delivery) => delivery.taxYear === statement.taxYear && (statement.householdId ? delivery.householdId === statement.householdId : delivery.householdId == null && delivery.payerEmail === statement.payerEmail))?.status ?? "not sent",
  })).sort((left, right) => right.taxYear - left.taxYear || left.payerName.localeCompare(right.payerName));
  const gradeReport = dashboard.byGrade.map((row) => {
    const householdIds = new Set(grades.filter((grade) => grade.grade === row.grade).map((grade) => grade.householdId));
    return { ...row, location: uniqueValues(bidders.filter((bidder) => bidder.householdId != null && householdIds.has(bidder.householdId)).map(bidderLocation)) };
  });
  return { bidders: bidderReport, bids, items, attendance, grades: gradeReport, payments, acknowledgments: acknowledgmentRows, historical, familyHistory, itemIntelligence, yearEndStatements };
}

export async function sendYearEndStatements(taxYear: number, workspaceId?: string): Promise<{ sent: number; failed: number }> {
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > new Date().getUTCFullYear()) throw new HttpError(400, "Choose a valid statement year.");
  const receiptRows = await db.select({ receipt: s.fundraisingReceipts, workspace: s.workspaces }).from(s.fundraisingReceipts)
    .innerJoin(s.workspaces, eq(s.fundraisingReceipts.workspaceId, s.workspaces.id))
    .where(and(workspaceId ? eq(s.fundraisingReceipts.workspaceId, workspaceId) : sql`true`, sql`extract(year from ${s.fundraisingReceipts.issuedAt}) = ${taxYear}`));
  const householdRows = await db.select().from(s.households).where(workspaceId ? eq(s.households.workspaceId, workspaceId) : sql`true`);
  const groups = summarizeYearEndReceipts(receiptRows.map((row) => row.receipt), householdRows).filter((statement) => statement.taxYear === taxYear);
  const workspacesById = new Map(receiptRows.map((row) => [row.workspace.id, row.workspace]));
  let sent = 0;
  let failed = 0;
  for (const statement of groups) {
    const workspace = workspacesById.get(statement.workspaceId);
    if (!workspace) continue;
    const [existing] = await db.select({ id: s.yearEndStatementDeliveries.id, status: s.yearEndStatementDeliveries.status })
      .from(s.yearEndStatementDeliveries)
      .where(and(
        eq(s.yearEndStatementDeliveries.workspaceId, statement.workspaceId),
        statement.householdId ? eq(s.yearEndStatementDeliveries.householdId, statement.householdId) : and(sql`${s.yearEndStatementDeliveries.householdId} is null`, eq(s.yearEndStatementDeliveries.payerEmail, statement.payerEmail)),
        eq(s.yearEndStatementDeliveries.taxYear, taxYear),
      )).limit(1);
    let deliveryId: string | null = null;
    if (existing?.status === "failed") {
      const [retryClaim] = await db.update(s.yearEndStatementDeliveries).set({
        payerName: statement.payerName,
        payerEmail: statement.payerEmail,
        amountCents: statement.amountCents,
        deductibleCents: statement.deductibleCents,
        receiptCount: statement.receiptCount,
        status: "pending",
        sentAt: null,
        updatedAt: new Date(),
      }).where(and(eq(s.yearEndStatementDeliveries.id, existing.id), eq(s.yearEndStatementDeliveries.status, "failed")))
        .returning({ id: s.yearEndStatementDeliveries.id });
      deliveryId = retryClaim?.id ?? null;
    } else if (!existing) {
      const id = newId("yes");
      const [claim] = await db.insert(s.yearEndStatementDeliveries).values({ id, workspaceId: statement.workspaceId, householdId: statement.householdId, payerEmail: statement.payerEmail, payerName: statement.payerName, taxYear, amountCents: statement.amountCents, deductibleCents: statement.deductibleCents, receiptCount: statement.receiptCount })
        .onConflictDoNothing().returning({ id: s.yearEndStatementDeliveries.id });
      deliveryId = claim?.id ?? null;
    }
    if (!deliveryId) continue;
    const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
    const outcome = await sendEmail({ to: statement.payerEmail, subject: `${taxYear} giving statement - ${workspace.legalName || workspace.name}`, text: [`Hi ${statement.payerName},`, "", `${workspace.legalName || workspace.name} recorded ${statement.receiptCount} receipt${statement.receiptCount === 1 ? "" : "s"} for ${taxYear}.`, `Total paid: ${money(statement.amountCents)}`, `Total shown as tax-deductible: ${money(statement.deductibleCents)}`, workspace.ein ? `EIN: ${workspace.ein}` : "", "Keep this statement and the individual receipts for your tax records."].filter(Boolean).join("\n"), idempotencyKey: `year-end-statement-${statement.workspaceId}-${taxYear}-${statement.householdId ?? createHash("sha256").update(statement.payerEmail).digest("hex").slice(0, 12)}` });
    await db.update(s.yearEndStatementDeliveries).set({ status: outcome.status === "sent" ? "sent" : "failed", sentAt: outcome.status === "sent" ? new Date() : null, updatedAt: new Date() }).where(eq(s.yearEndStatementDeliveries.id, deliveryId));
    if (outcome.status === "sent") sent += 1; else failed += 1;
  }
  return { sent, failed };
}

export async function sendDueYearEndStatements(now = new Date()): Promise<{ sent: number; failed: number }> {
  if (now.getUTCMonth() !== 0) return { sent: 0, failed: 0 };
  return sendYearEndStatements(now.getUTCFullYear() - 1);
}

async function broadcastRecipientRows(eventId: string, audience: FundraisingBroadcastAudience, itemIds: string[]) {
  const bidders = await db.select().from(s.auctionBidders).where(and(eq(s.auctionBidders.eventId, eventId), eq(s.auctionBidders.status, "active")));
  if (audience === "remote") return bidders.filter((bidder) => !bidder.checkedInAt);
  if (audience === "in_room") return bidders.filter((bidder) => Boolean(bidder.checkedInAt));
  if (audience.startsWith("grade:")) {
    const grade = audience.slice("grade:".length);
    const householdRows = await db.select({ householdId: s.householdGrades.householdId }).from(s.householdGrades).where(eq(s.householdGrades.grade, grade));
    const householdIds = new Set(householdRows.map((row) => row.householdId));
    return bidders.filter((bidder) => bidder.householdId != null && householdIds.has(bidder.householdId));
  }
  if (["bidders", "outbid", "watchers"].includes(audience) && itemIds.length > 0) {
    const [bidRows, watchRows, items] = await Promise.all([
      db.select({ bidderId: s.auctionBids.bidderId }).from(s.auctionBids).where(inArray(s.auctionBids.itemId, itemIds)),
      db.select({ bidderId: s.auctionWatches.bidderId }).from(s.auctionWatches).where(inArray(s.auctionWatches.itemId, itemIds)),
      db.select({ winningBidderId: s.auctionItems.winningBidderId }).from(s.auctionItems).where(inArray(s.auctionItems.id, itemIds)),
    ]);
    const ids = audience === "watchers"
      ? new Set(watchRows.map((row) => row.bidderId))
      : new Set(bidRows.map((row) => row.bidderId));
    if (audience === "outbid") for (const item of items) if (item.winningBidderId) ids.delete(item.winningBidderId);
    return bidders.filter((bidder) => ids.has(bidder.id));
  }
  return bidders;
}

export async function previewFundraisingBroadcast(
  ctx: RequestContext,
  eventId: string,
  input: { audience: FundraisingBroadcastAudience; itemIds: string[] },
): Promise<{ recipients: number }> {
  const [event] = await db.select({ id: s.events.id }).from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  return { recipients: (await broadcastRecipientRows(eventId, input.audience, input.itemIds)).length };
}

export async function sendFundraisingBroadcast(
  ctx: RequestContext,
  eventId: string,
  input: { audience: FundraisingBroadcastAudience; itemIds: string[]; channels: string[]; message: string },
): Promise<{ recipients: number; sent: number; failed: number }> {
  if (!input.message.trim()) throw new HttpError(400, "Enter a broadcast message.");
  if (input.channels.includes("sms")) {
    throw new HttpError(503, "SMS is not connected yet. Connect the approved SMS provider before enabling text delivery.");
  }
  const recipients = await broadcastRecipientRows(eventId, input.audience, input.itemIds);
  const [event] = await db.select().from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  return deliverFundraisingBroadcast({ workspaceId: ctx.workspaceId, eventId, sentBy: ctx.userId, audienceFilter: { audience: input.audience }, itemIds: input.itemIds, channels: input.channels, message: input.message.trim(), subject: `Auction update - ${event.title}`, recipients });
}

export async function sendDueClosingAlerts(auctionToken: string): Promise<void> {
  const [event] = await db.select().from(s.events).where(eq(s.events.auctionPublicToken, auctionToken)).limit(1);
  if (!event) return;
  const settings = normalizeAuctionPageSettings(event.auctionPage);
  if (!settings.automaticClosingAlertsEnabled || settings.closingAlertMinutes.length === 0) return;
  const largestThreshold = Math.max(...settings.closingAlertMinutes);
  const items = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.eventId, event.id),
    eq(s.auctionItems.status, "open"),
    sql`${s.auctionItems.closesAt} is not null and ${s.auctionItems.closesAt} > now() and ${s.auctionItems.closesAt} <= now() + (${largestThreshold} * interval '1 minute')`,
  ));
  for (const item of items) {
    const minutes = Math.max(1, Math.ceil((item.closesAt!.getTime() - Date.now()) / 60_000));
    const threshold = [...settings.closingAlertMinutes].sort((left, right) => left - right).find((candidate) => minutes <= candidate);
    if (!threshold) continue;
    const message = `${threshold} min left: ${item.title}, current bid ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((item.currentBidCents ?? item.startingBidCents ?? 0) / 100)}. Bid now: ${(process.env.APP_ORIGIN || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "")}/auction/${auctionToken}`;
    const [existing] = await db.select({ id: s.fundraisingBroadcasts.id }).from(s.fundraisingBroadcasts).where(and(
      eq(s.fundraisingBroadcasts.eventId, event.id), eq(s.fundraisingBroadcasts.message, message),
    )).limit(1);
    if (existing) continue;
    const bidders = await broadcastRecipientRows(event.id, "bidders", [item.id]);
    const watchers = await broadcastRecipientRows(event.id, "watchers", [item.id]);
    const recipients = [...new Map([...bidders, ...watchers].map((bidder) => [bidder.id, bidder])).values()];
    await deliverFundraisingBroadcast({ workspaceId: event.workspaceId, eventId: event.id, sentBy: "automatic-closing-alert", audienceFilter: { audience: "bidders_and_watchers", threshold }, itemIds: [item.id], channels: ["email", "in_app"], message, messageForRecipient: (recipient) => `${message} ${recipient.id === item.winningBidderId ? "You're winning." : "You're outbid or watching - bid now to lead."}`, subject: `${threshold} minutes left - ${item.title}`, recipients });
  }
}

export async function sendAllDueClosingAlerts(): Promise<number> {
  const eventRows = await db.select({ token: s.events.auctionPublicToken }).from(s.events).where(and(
    sql`${s.events.auctionPublicToken} is not null`, sql`${s.events.status} <> 'cancelled'`,
  ));
  for (const event of eventRows) if (event.token) await sendDueClosingAlerts(event.token);
  return eventRows.length;
}

export async function recordLiveAuctionSale(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  paddleNumbers: number[],
  amountCents: number,
): Promise<{ winners: number }> {
  const paddles = [...new Set(paddleNumbers.filter((value) => Number.isInteger(value) && value > 0))];
  if (paddles.length === 0) throw new HttpError(400, "Enter at least one winning paddle number.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpError(400, "Enter the winning amount.");
  const [item] = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.id, itemId), eq(s.auctionItems.eventId, eventId), eq(s.auctionItems.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!item) throw new HttpError(404, "That live auction item no longer exists.");
  const bidders = await db.select().from(s.auctionBidders).where(and(
    eq(s.auctionBidders.eventId, eventId), inArray(s.auctionBidders.paddleNumber, paddles),
  ));
  if (bidders.length !== paddles.length) {
    const found = new Set(bidders.map((bidder) => bidder.paddleNumber));
    throw new HttpError(409, `Unknown paddle number: ${paddles.filter((paddle) => !found.has(paddle)).join(", ")}.`);
  }
  if (paddles.length > item.quantityAvailable) throw new HttpError(409, `This lot has only ${item.quantityAvailable} available.`);
  try {
    const result = await db.execute<{ winners: number }>(sql`
      select record_live_auction_sale_atomic(${ctx.workspaceId}, ${eventId}, ${itemId}, string_to_array(${paddles.join(",")}, ',')::integer[], ${amountCents}, ${ctx.userId}) as winners
    `);
    return { winners: Number(result.rows[0]?.winners ?? 0) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already been settled|outside this lot quantity|not active|only a live auction item/i.test(message)) throw new HttpError(409, message.replace(/^.*error:\s*/i, ""));
    throw error;
  }
}

export async function undoLiveAuctionSale(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
): Promise<{ reopened: true }> {
  const [item] = await db.select().from(s.auctionItems).where(and(
    eq(s.auctionItems.id, itemId), eq(s.auctionItems.eventId, eventId), eq(s.auctionItems.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!item) throw new HttpError(404, "That live auction item no longer exists.");
  const paid = await db.select({ id: s.auctionOrders.id }).from(s.auctionOrders).where(and(
    eq(s.auctionOrders.itemId, itemId), eq(s.auctionOrders.status, "paid"),
  )).limit(1);
  if (paid.length > 0) throw new HttpError(409, "Refund the paid winner before undoing this sale.");
  const now = new Date();
  await db.batch([
    db.update(s.auctionItems).set({ status: "open", winningBidderId: null, winnerName: null, paymentLink: null, updatedAt: now })
      .where(eq(s.auctionItems.id, itemId)),
    db.update(s.auctionItemWinners).set({ reversedAt: now }).where(and(eq(s.auctionItemWinners.itemId, itemId), sql`${s.auctionItemWinners.reversedAt} is null`)),
    db.update(s.auctionOrders).set({ status: "failed", updatedAt: now }).where(and(eq(s.auctionOrders.itemId, itemId), eq(s.auctionOrders.status, "pending"))),
  ]);
  return { reopened: true };
}

export async function buyNowAuctionItem(
  auctionToken: string,
  bidderToken: string,
  itemId: string,
): Promise<{ won: true; amountCents: number }> {
  try {
    const result = await db.execute<{ amount_cents: number }>(sql`
      select purchase_auction_item_buy_now(${auctionToken}, ${bidderToken}, ${itemId}) as amount_cents
    `);
    return { won: true, amountCents: Number(result.rows[0]?.amount_cents ?? 0) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no longer available|add a card or wallet/i.test(message)) throw new HttpError(409, message.replace(/^.*error:\s*/i, ""));
    throw error;
  }
}
