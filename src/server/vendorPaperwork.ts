import { and, eq, lt } from "drizzle-orm";
import type {
  PublicVendorPaperwork,
  VendorPaperworkDraft,
  VendorPaperworkReview,
} from "../data/entities.ts";
import { PRIVATE_BETA_ORIGIN } from "../lib/privateBetaHost.ts";
import { HttpError, newId, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import * as map from "./mappers.ts";
import { notifyVendorPaperworkRequest } from "./notify.ts";
import * as s from "./schema.ts";

function appOrigin(): string {
  return process.env.APP_ORIGIN ?? PRIVATE_BETA_ORIGIN;
}

async function bookingRow(ctx: RequestContext, eventId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: s.eventVendors, vendor: s.vendors, event: s.events, workspace: s.workspaces })
    .from(s.eventVendors)
    .innerJoin(s.vendors, eq(s.eventVendors.vendorId, s.vendors.id))
    .innerJoin(s.events, eq(s.eventVendors.eventId, s.events.id))
    .innerJoin(s.workspaces, eq(s.eventVendors.workspaceId, s.workspaces.id))
    .where(and(
      eq(s.eventVendors.id, bookingId),
      eq(s.eventVendors.eventId, eventId),
      eq(s.eventVendors.workspaceId, ctx.workspaceId),
    ))
    .limit(1);
  if (!row) throw new HttpError(404, "That vendor booking no longer exists.");
  return row;
}

async function recordHistory(
  ctx: RequestContext,
  eventId: string,
  bookingId: string,
  summary: string,
  after: Record<string, unknown>,
): Promise<void> {
  await db.insert(s.eventHistory).values({
    id: newId("history"),
    workspaceId: ctx.workspaceId,
    eventId,
    actorId: ctx.userId,
    resource: "vendor-paperwork",
    resourceId: bookingId,
    action: "updated",
    summary,
    before: null,
    after,
  });
}

export async function saveVendorPaperworkDraft(
  ctx: RequestContext,
  eventId: string,
  bookingId: string,
  draft: VendorPaperworkDraft,
  clientRevision: number,
) {
  const current = await bookingRow(ctx, eventId, bookingId);
  const contractStatus = draft.contractRequired
    ? current.booking.signedContractUrl ? current.booking.contractStatus : "waiting"
    : "not-required";
  const coiStatus = draft.coiRequired
    ? current.booking.coiFileUrl ? current.booking.coiStatus : "waiting"
    : "not-required";
  await db
    .update(s.eventVendors)
    .set({
      paperworkRevision: clientRevision,
      contractRequired: draft.contractRequired,
      contractStatus,
      contractSigningUrl: draft.contractSigningUrl?.trim() || null,
      coiRequired: draft.coiRequired,
      coiStatus,
      minimumCoverageCents: draft.minimumCoverageCents ?? null,
      additionalInsured: draft.additionalInsured?.trim() || null,
      paperworkInstructions: draft.instructions?.trim() || null,
      paperworkReminderIntervalDays: draft.reminderIntervalDays ?? 3,
      updatedAt: new Date(),
    })
    .where(and(
      eq(s.eventVendors.id, bookingId),
      eq(s.eventVendors.eventId, eventId),
      eq(s.eventVendors.workspaceId, ctx.workspaceId),
      lt(s.eventVendors.paperworkRevision, clientRevision),
    ));
  const latest = await bookingRow(ctx, eventId, bookingId);
  return map.toEventVendor(latest.booking, latest.vendor);
}

export async function saveVendorContractFile(
  ctx: RequestContext,
  eventId: string,
  bookingId: string,
  file: { url: string; name: string },
) {
  const current = await bookingRow(ctx, eventId, bookingId);
  await db.update(s.eventVendors).set({
    contractFileUrl: file.url,
    contractFileName: file.name,
    updatedAt: new Date(),
  }).where(eq(s.eventVendors.id, current.booking.id));
  await recordHistory(ctx, eventId, bookingId, `Uploaded contract for ${current.vendor.name}`, {
    vendorId: current.vendor.id,
    vendorName: current.vendor.name,
    fileName: file.name,
  });
  const latest = await bookingRow(ctx, eventId, bookingId);
  return map.toEventVendor(latest.booking, latest.vendor);
}

export async function sendVendorPaperworkRequest(ctx: RequestContext, eventId: string, bookingId: string) {
  const current = await bookingRow(ctx, eventId, bookingId);
  if (!current.booking.contractRequired && !current.booking.coiRequired) {
    throw new HttpError(400, "Choose a contract, a certificate of insurance, or both.");
  }
  if (current.booking.contractRequired && !current.booking.contractFileUrl && !current.booking.contractSigningUrl) {
    throw new HttpError(400, "Upload the contract or add an e-signature link before sending the request.");
  }
  if (!current.vendor.contactEmail) throw new HttpError(400, "Add the vendor's email before sending.");
  const token = current.booking.paperworkPublicToken ?? crypto.randomUUID();
  const requestedAt = new Date();
  const outcome = await notifyVendorPaperworkRequest({
    requestId: `${bookingId}-${requestedAt.getTime()}`,
    to: current.vendor.contactEmail,
    vendorName: current.vendor.name,
    organizerName: current.workspace.legalName || current.workspace.name,
    replyTo: ctx.email,
    eventTitle: current.event.title,
    needsContract: current.booking.contractRequired,
    needsCoi: current.booking.coiRequired,
    url: `${appOrigin()}/vendor-paperwork/${token}`,
  });
  const deliveryError = outcome.status === "sent" ? null : outcome.reason;
  await db.update(s.eventVendors).set({
    paperworkPublicToken: token,
    paperworkRequestedAt: requestedAt,
    paperworkDeliveredAt: deliveryError ? null : requestedAt,
    paperworkDeliveryError: deliveryError,
    paperworkNextReminderAt: current.booking.paperworkReminderIntervalDays > 0
      ? new Date(requestedAt.getTime() + (deliveryError ? 1 : current.booking.paperworkReminderIntervalDays) * 86_400_000)
      : null,
    updatedAt: requestedAt,
  }).where(eq(s.eventVendors.id, bookingId));
  await recordHistory(ctx, eventId, bookingId, `Paperwork request ${deliveryError ? "failed" : "sent"} for ${current.vendor.name}`, {
    vendorId: current.vendor.id,
    vendorName: current.vendor.name,
    email: current.vendor.contactEmail,
    status: deliveryError ? "failed" : "sent",
    reason: deliveryError,
  });
  const latest = await bookingRow(ctx, eventId, bookingId);
  return map.toEventVendor(latest.booking, latest.vendor);
}

export async function reviewVendorPaperwork(
  ctx: RequestContext,
  eventId: string,
  bookingId: string,
  review: VendorPaperworkReview,
) {
  const current = await bookingRow(ctx, eventId, bookingId);
  if (review.contractStatus && !current.booking.signedContractUrl) {
    throw new HttpError(409, "The vendor has not uploaded a signed contract yet.");
  }
  if (review.coiStatus && !current.booking.coiFileUrl) {
    throw new HttpError(409, "The vendor has not uploaded a certificate of insurance yet.");
  }
  const reviewedAt = new Date();
  const contractComplete = !current.booking.contractRequired ||
    (review.contractStatus ?? current.booking.contractStatus) === "approved";
  const coiComplete = !current.booking.coiRequired ||
    (review.coiStatus ?? current.booking.coiStatus) === "approved";
  await db.update(s.eventVendors).set({
    ...(review.contractStatus ? { contractStatus: review.contractStatus } : {}),
    ...(review.coiStatus ? { coiStatus: review.coiStatus } : {}),
    paperworkReviewedAt: reviewedAt,
    paperworkReviewedBy: ctx.email ?? ctx.userId,
    ...(contractComplete && coiComplete ? { paperworkNextReminderAt: null } : {}),
    updatedAt: reviewedAt,
  }).where(eq(s.eventVendors.id, bookingId));
  await recordHistory(ctx, eventId, bookingId, `Reviewed paperwork for ${current.vendor.name}`, {
    vendorId: current.vendor.id,
    vendorName: current.vendor.name,
    ...review,
  });
  const latest = await bookingRow(ctx, eventId, bookingId);
  return map.toEventVendor(latest.booking, latest.vendor);
}

export async function publicVendorPaperwork(token: string): Promise<PublicVendorPaperwork | null> {
  const [row] = await db
    .select({ booking: s.eventVendors, vendor: s.vendors, event: s.events, workspace: s.workspaces })
    .from(s.eventVendors)
    .innerJoin(s.vendors, eq(s.eventVendors.vendorId, s.vendors.id))
    .innerJoin(s.events, eq(s.eventVendors.eventId, s.events.id))
    .innerJoin(s.workspaces, eq(s.eventVendors.workspaceId, s.workspaces.id))
    .where(eq(s.eventVendors.paperworkPublicToken, token))
    .limit(1);
  if (!row || row.event.status === "cancelled" || row.event.status === "completed") return null;
  return {
    eventTitle: row.event.title,
    eventDate: row.event.startsAt.toISOString(),
    eventLocation: row.event.venue,
    vendorName: row.vendor.name,
    organizerName: row.workspace.legalName || row.workspace.name,
    paperwork: map.toEventVendor(row.booking, row.vendor).paperwork,
  };
}

export async function savePublicVendorPaperworkUpload(
  token: string,
  kind: "contract" | "coi",
  file: { url: string; name: string },
  details: { expiresAt?: Date | null; coverageCents?: number | null },
): Promise<PublicVendorPaperwork> {
  const payload = await publicVendorPaperwork(token);
  if (!payload) throw new HttpError(404, "This paperwork link is no longer active.");
  const [booking] = await db.select().from(s.eventVendors).where(eq(s.eventVendors.paperworkPublicToken, token)).limit(1);
  if (!booking) throw new HttpError(404, "This paperwork link is no longer active.");
  const uploadedAt = new Date();
  if (kind === "contract") {
    if (!booking.contractRequired) throw new HttpError(409, "A signed contract is not requested for this event.");
    await db.update(s.eventVendors).set({
      signedContractUrl: file.url,
      signedContractName: file.name,
      signedContractUploadedAt: uploadedAt,
      contractStatus: "received",
      updatedAt: uploadedAt,
    }).where(eq(s.eventVendors.id, booking.id));
  } else {
    if (!booking.coiRequired) throw new HttpError(409, "A certificate of insurance is not requested for this event.");
    const expired = details.expiresAt ? details.expiresAt.getTime() < new Date(payload.eventDate).getTime() : false;
    const underinsured = booking.minimumCoverageCents !== null &&
      (details.coverageCents ?? 0) < booking.minimumCoverageCents;
    await db.update(s.eventVendors).set({
      coiFileUrl: file.url,
      coiFileName: file.name,
      coiUploadedAt: uploadedAt,
      coiExpiresAt: details.expiresAt ?? null,
      coiCoverageCents: details.coverageCents ?? null,
      coiStatus: expired || underinsured ? "needs-changes" : "received",
      coiAnalysisStatus: "not-run",
      coiAnalysis: null,
      coiAnalysisError: null,
      coiAnalyzedAt: null,
      coiAnalysisModel: null,
      updatedAt: uploadedAt,
    }).where(eq(s.eventVendors.id, booking.id));
  }
  const [latest] = await db.select().from(s.eventVendors).where(eq(s.eventVendors.id, booking.id)).limit(1);
  const allReceived = latest &&
    (!latest.contractRequired || Boolean(latest.signedContractUrl)) &&
    (!latest.coiRequired || Boolean(latest.coiFileUrl));
  if (allReceived) {
    await db.update(s.eventVendors).set({ paperworkNextReminderAt: null }).where(eq(s.eventVendors.id, booking.id));
  }
  return (await publicVendorPaperwork(token))!;
}
