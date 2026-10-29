import Stripe from "stripe";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { platformFeeCents } from "../data/commerce.ts";
import { bidIncrementCents, coveredFeesCents, deductibleAmountCents } from "../data/fundraising.ts";
import { normalizeAuctionPageSettings } from "../data/auctionSettings.ts";
import { workspaceUsesStripeConnect } from "../data/workspaceAccess.ts";
import { SCHOOL_GRADES, type AuctionOrder, type DonationCheckoutResult, type FundraisingReceipt, type FundraisingReceiptLineItem, type PublicBidderBill, type PublicTicketOrderStatus, type StripeConnectStatus, type TicketCheckoutResult, type TicketOrder } from "../data/entities.ts";
import { db } from "./db.ts";
import { HttpError, newId, type RequestContext } from "./auth.ts";
import { notifyAuctionPaymentConfirmation, notifyAuctionWinner, notifyBidderBill, notifyCombinedFundraisingReceipt, notifyExperienceCertificate, notifyTicketOrderConfirmation, sendEmail } from "./notify.ts";
import { allocateAuctionBidder } from "./auctionBidderAllocation.ts";
import { databaseErrorMessage } from "./errorMessage.ts";
import {
  auctionBidders,
  auctionBids,
  auctionItems,
  auctionItemWinners,
  auctionOrders,
  bidderBills,
  donationCampaigns,
  donations,
  events,
  fundraisingPledges,
  fundraisingReceipts,
  checklistItems,
  guests,
  households,
  householdGrades,
  registrations,
  ticketInvitations,
  ticketOrderGuests,
  ticketOrders,
  ticketTypes,
  workspaces,
} from "./schema.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_MINUTES = 30;

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Stripe payments are not configured yet.");
  if (key.startsWith("sk_live_") && process.env.STRIPE_LIVE_PAYMENTS_ENABLED !== "true") {
    throw new HttpError(503, "Live Stripe payments are locked until launch is approved.");
  }
  return new Stripe(key);
}

function appOrigin(request: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_ORIGIN?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

export function stripeConnectReturnUrls(origin: string, requestedReturnTo: unknown): { refreshUrl: string; returnUrl: string } {
  const safePath = typeof requestedReturnTo === "string" && /^\/app\/events\/[A-Za-z0-9_-]+\/share$/.test(requestedReturnTo)
    ? requestedReturnTo
    : "/app/tickets";
  const refreshUrl = new URL(safePath, origin);
  const returnUrl = new URL(safePath, origin);
  refreshUrl.searchParams.set("stripe", "refresh");
  returnUrl.searchParams.set("stripe", "return");
  return { refreshUrl: refreshUrl.toString(), returnUrl: returnUrl.toString() };
}

function requireOwner(ctx: RequestContext): void {
  if (ctx.role !== "owner") throw new HttpError(403, "Only the workspace owner can connect the payment account.");
}

export function requireStripeConnectAvailable(workspace: { stripeConnectExempt?: boolean }): void {
  if (!workspaceUsesStripeConnect(workspace)) {
    throw new HttpError(403, "Stripe connection is not available for this workspace.");
  }
}

function accountStatus(account: Stripe.Account | null): StripeConnectStatus {
  return {
    accountId: account?.id ?? null,
    detailsSubmitted: account?.details_submitted ?? false,
    chargesEnabled: account?.charges_enabled ?? false,
    payoutsEnabled: account?.payouts_enabled ?? false,
    ready: Boolean(account?.details_submitted && account.charges_enabled && account.payouts_enabled),
  };
}

async function workspaceRow(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new HttpError(404, "Your workspace is no longer available.");
  return workspace;
}

async function syncConnectedAccount(workspaceId: string, account: Stripe.Account): Promise<void> {
  await db
    .update(workspaces)
    .set({
      stripeConnectedDetailsSubmitted: account.details_submitted,
      stripeConnectedChargesEnabled: account.charges_enabled,
      stripeConnectedPayoutsEnabled: account.payouts_enabled,
      stripeConnectedAt: account.details_submitted ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.stripeConnectedAccountId, account.id)));
}

export async function syncStripeConnectedAccount(account: Stripe.Account): Promise<void> {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.stripeConnectedAccountId, account.id))
    .limit(1);
  if (workspace) await syncConnectedAccount(workspace.id, account);
}

export async function getStripeConnectStatus(ctx: RequestContext): Promise<StripeConnectStatus> {
  const workspace = await workspaceRow(ctx.workspaceId);
  if (!workspaceUsesStripeConnect(workspace)) return accountStatus(null);
  if (!workspace.stripeConnectedAccountId) return accountStatus(null);
  try {
    const account = await stripeClient().accounts.retrieve(workspace.stripeConnectedAccountId);
    await syncConnectedAccount(workspace.id, account);
    return accountStatus(account);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      throw new HttpError(409, "The connected Stripe account is no longer available. Contact Beebizy support.");
    }
    throw error;
  }
}

export async function createStripeConnectOnboarding(
  ctx: RequestContext,
  request: Request,
  returnTo?: unknown,
): Promise<StripeConnectStatus> {
  requireOwner(ctx);
  const workspace = await workspaceRow(ctx.workspaceId);
  requireStripeConnectAvailable(workspace);
  const stripe = stripeClient();
  let accountId = workspace.stripeConnectedAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create(
      {
        type: "standard",
        email: ctx.email ?? undefined,
        business_profile: {
          name: workspace.name,
          product_description: "Event tickets, auction items, and fundraising payments",
        },
        metadata: { workspaceId: workspace.id, product: "beebizy-commerce" },
      },
      { idempotencyKey: `beebizy_connect_${workspace.id}` },
    );
    accountId = account.id;
    await db
      .update(workspaces)
      .set({ stripeConnectedAccountId: account.id, updatedAt: new Date() })
      .where(and(eq(workspaces.id, workspace.id), sql`${workspaces.stripeConnectedAccountId} is null`));
    const latest = await workspaceRow(workspace.id);
    accountId = latest.stripeConnectedAccountId ?? account.id;
  }

  const origin = appOrigin(request);
  const returnUrls = stripeConnectReturnUrls(origin, returnTo);
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due", future_requirements: "include" },
    refresh_url: returnUrls.refreshUrl,
    return_url: returnUrls.returnUrl,
  });
  const account = await stripe.accounts.retrieve(accountId);
  await syncConnectedAccount(workspace.id, account);
  return { ...accountStatus(account), onboardingUrl: link.url };
}

export interface PublicTicketCheckoutInput {
  ticketTypeId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  gradeTags: string[];
  quantity: number;
  guestNames: string[];
  donationAddOnCents: number;
  benefitsDeclined: boolean;
  autoChargeOptIn: boolean;
}

export function ticketCheckoutSessionParams(input: {
  orderId: string;
  eventTitle: string;
  ticketName: string;
  ticketTypeId: string;
  shareToken: string;
  buyerEmail: string;
  quantity: number;
  unitAmountCents: number;
  applicationFeeCents: number;
  donationAddOnCents: number;
  currency: string;
  origin: string;
  expiresAt: Date;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    kind: "ticket-order",
    orderId: input.orderId,
    ticketTypeId: input.ticketTypeId,
    shareToken: input.shareToken,
  };
  return {
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: input.orderId,
    customer_email: input.buyerEmail,
    line_items: [
      {
        quantity: input.quantity,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.unitAmountCents,
          product_data: { name: input.ticketName, description: input.eventTitle },
        },
      },
      ...(input.donationAddOnCents > 0 ? [{
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.donationAddOnCents,
          product_data: { name: "Additional donation", description: input.eventTitle },
        },
      }] : []),
    ],
    metadata,
    payment_intent_data: {
      application_fee_amount: input.applicationFeeCents,
      setup_future_usage: "off_session",
      metadata,
    },
    customer_creation: "always",
    billing_address_collection: "auto",
    expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
    success_url: `${input.origin}/e/${encodeURIComponent(input.shareToken)}/tickets?checkout=success&order=${encodeURIComponent(input.orderId)}`,
    cancel_url: `${input.origin}/e/${encodeURIComponent(input.shareToken)}/tickets?checkout=cancelled`,
  };
}

function checkoutError(error: unknown): never {
  const message = databaseErrorMessage(error);
  if (
    message.includes("not on sale") ||
    message.includes("not enough tickets") ||
    message.includes("at capacity") ||
    message.includes("at most") ||
    message.includes("total changed")
  ) {
    throw new HttpError(409, message.replace(/^.*error:\s*/i, ""));
  }
  throw error;
}

async function reserveOrder(input: {
  orderId: string;
  ticketTypeId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  amountCents: number;
  applicationFeeCents: number;
  connectedAccountId: string | null;
  expiresAt: Date;
}): Promise<void> {
  try {
    await db.execute(sql`select reserve_ticket_order(
      ${input.orderId}, ${input.ticketTypeId}, ${input.buyerName}, ${input.buyerEmail},
      ${input.quantity}, ${input.amountCents}, ${input.applicationFeeCents},
      ${input.connectedAccountId}, ${input.expiresAt}
    )`);
  } catch (error) {
    checkoutError(error);
  }
}

async function storeOrderGuests(input: {
  orderId: string;
  workspaceId: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  guestNames: string[];
}): Promise<void> {
  await db.insert(ticketOrderGuests).values(input.guestNames.map((fullName, index) => ({
    id: newId("tog"),
    orderId: input.orderId,
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    fullName,
    email: index === 0 && fullName.localeCompare(input.buyerName, undefined, { sensitivity: "accent" }) === 0
      ? input.buyerEmail
      : null,
  })));
}

async function ensureOrderRegistrations(orderId: string): Promise<void> {
  const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, orderId)).limit(1);
  if (!order || order.status !== "paid") return;
  const orderedGuests = await db
    .select()
    .from(ticketOrderGuests)
    .where(eq(ticketOrderGuests.orderId, order.id))
    .orderBy(asc(ticketOrderGuests.createdAt));

  for (const [index, orderGuest] of orderedGuests.entries()) {
    const guestId = newId("att");
    if (orderGuest.email) {
      await db.insert(guests).values({
        id: guestId,
        workspaceId: order.workspaceId,
        name: orderGuest.fullName,
        contact: orderGuest.email,
        notes: "Created from a ticket order.",
      }).onConflictDoNothing({ target: [guests.workspaceId, guests.contact] });
    } else {
      await db.insert(guests).values({
        id: guestId,
        workspaceId: order.workspaceId,
        name: orderGuest.fullName,
        contact: null,
        notes: "Created from a ticket order.",
      });
    }
    const [guest] = orderGuest.email
      ? await db.select({ id: guests.id }).from(guests).where(and(
          eq(guests.workspaceId, order.workspaceId),
          eq(guests.contact, orderGuest.email),
        )).limit(1)
      : [{ id: guestId }];
    if (!guest) throw new Error(`Ticket order ${order.id} could not create guest ${index + 1}.`);
    await db.insert(registrations).values({
      id: newId("reg"),
      workspaceId: order.workspaceId,
      eventId: order.eventId,
      guestId: guest.id,
      status: "confirmed",
      segment: "Ticket holder",
      ticketTypeId: order.ticketTypeId,
      ticketOrderId: order.id,
      quantity: orderedGuests.length === 1 ? order.quantity : 1,
    }).onConflictDoNothing({ target: [registrations.eventId, registrations.guestId] });
  }
}

async function ensureTicketBuyerAuctionAccess(input: {
  orderId: string;
  stripeCustomerId?: string | null;
  paymentMethodId?: string | null;
}): Promise<void> {
  const [row] = await db.select({ order: ticketOrders, event: events }).from(ticketOrders)
    .innerJoin(events, eq(ticketOrders.eventId, events.id))
    .where(eq(ticketOrders.id, input.orderId)).limit(1);
  if (!row?.event.auctionPublicToken || row.order.status !== "paid") return;

  const email = row.order.buyerEmail.trim().toLowerCase();
  const householdId = newId("hh");
  const [createdHousehold] = await db.insert(households).values({
    id: householdId,
    workspaceId: row.order.workspaceId,
    displayName: row.order.buyerName,
    primaryEmail: email,
    phone: row.order.buyerPhone,
    creditName: row.order.buyerName,
    stripeCustomerId: input.stripeCustomerId ?? null,
  }).onConflictDoNothing({ target: [households.workspaceId, households.primaryEmail] }).returning({ id: households.id });
  const [household] = await db.select({ id: households.id }).from(households).where(and(
    eq(households.workspaceId, row.order.workspaceId), eq(households.primaryEmail, email),
  )).limit(1);
  if (!household) throw new Error(`Ticket order ${input.orderId} could not create a household.`);

  if (createdHousehold && row.order.gradeTags.length > 0) {
    const schoolYear = String(new Date(row.event.startsAt).getUTCFullYear());
    await db.insert(householdGrades).values(row.order.gradeTags.map((grade) => ({
      id: newId("hhg"), householdId: household.id, workspaceId: row.order.workspaceId, grade, schoolYear,
    }))).onConflictDoNothing();
  }
  const [attendee] = await db.select({ id: guests.id }).from(guests).where(and(
    eq(guests.workspaceId, row.order.workspaceId), eq(guests.contact, email),
  )).limit(1);
  const [existingBidder] = await db.select({ id: auctionBidders.id }).from(auctionBidders).where(and(
    eq(auctionBidders.eventId, row.event.id), eq(auctionBidders.email, email),
  )).limit(1);
  if (existingBidder) return;
  const allocation = await allocateAuctionBidder({
    workspaceId: row.order.workspaceId,
    eventId: row.event.id,
    name: row.order.buyerName,
    email,
    phone: row.order.buyerPhone,
    householdId: household.id,
    attendeeId: attendee?.id ?? null,
    paymentMethodId: input.paymentMethodId ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
    autoChargeOptIn: row.order.autoChargeOptIn,
    checkedInAt: null,
    participantType: "gala",
    publicToken: crypto.randomUUID(),
    updateExisting: false,
  });
  await sendEmail({
    to: email,
    subject: `Your auction paddle for ${row.event.title}`,
    text: `Hi ${row.order.buyerName}, your paddle number is ${allocation.paddleNumber}. Open your private bidder link: ${(process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "")}/auction/${row.event.auctionPublicToken}?bidder=${allocation.publicToken}`,
    idempotencyKey: `ticket-auction-access-${input.orderId}`,
  });
}

async function issueTicketReceipt(orderId: string): Promise<void> {
  const receiptId = `receipt_ticket_${orderId}`;
  const [existing] = await db.select({ id: fundraisingReceipts.id }).from(fundraisingReceipts).where(eq(fundraisingReceipts.id, receiptId)).limit(1);
  if (existing) return;
  const [row] = await db.select({ order: ticketOrders, ticket: ticketTypes, event: events, workspace: workspaces }).from(ticketOrders)
    .innerJoin(ticketTypes, eq(ticketOrders.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(ticketOrders.eventId, events.id))
    .innerJoin(workspaces, eq(ticketOrders.workspaceId, workspaces.id))
    .where(eq(ticketOrders.id, orderId)).limit(1);
  if (!row || !row.workspace.legalName || !row.workspace.ein || !row.workspace.fundraisingOrgType) {
    console.warn("TICKET_RECEIPT_PROFILE_INCOMPLETE", orderId);
    return;
  }
  const ticketAmountCents = row.ticket.priceCents * row.order.quantity;
  const ticketFmvCents = (row.ticket.fairMarketValueCents ?? 0) * row.order.quantity;
  const lines: FundraisingReceiptLineItem[] = [{
    kind: "ticket",
    description: `${row.ticket.name} × ${row.order.quantity}${row.ticket.benefitsDescription ? ` - ${row.ticket.benefitsDescription}` : ""}`,
    amountCents: ticketAmountCents,
    fairMarketValueCents: row.order.benefitsDeclined ? 0 : ticketFmvCents,
    deductibleCents: deductibleAmountCents({ kind: "ticket", amountCents: ticketAmountCents, fairMarketValueCents: ticketFmvCents, benefitsDeclined: row.order.benefitsDeclined }),
  }];
  if (row.order.donationAddOnCents > 0) lines.push({
    kind: "donation",
    description: "Additional donation",
    amountCents: row.order.donationAddOnCents,
    fairMarketValueCents: 0,
    deductibleCents: row.order.donationAddOnCents,
  });
  const [sequence] = await db.update(workspaces).set({ receiptSequence: sql`${workspaces.receiptSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, row.workspace.id)).returning({ value: workspaces.receiptSequence });
  const receiptNumber = `${row.workspace.receiptPrefix}-${new Date().getUTCFullYear()}-${String(sequence!.value).padStart(6, "0")}`;
  const publicToken = crypto.randomUUID();
  const amountCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const fmvCents = lines.reduce((sum, line) => sum + line.fairMarketValueCents, 0);
  const deductibleCents = lines.reduce((sum, line) => sum + line.deductibleCents, 0);
  await db.insert(fundraisingReceipts).values({
    id: receiptId,
    workspaceId: row.workspace.id,
    eventId: row.event.id,
    type: "quid_pro_quo",
    receiptNumber,
    publicToken,
    payerName: row.order.buyerName,
    payerEmail: row.order.buyerEmail,
    amountCents,
    fairMarketValueCents: fmvCents,
    deductibleCents,
    lineItems: lines as unknown as Array<Record<string, unknown>>,
  }).onConflictDoNothing({ target: fundraisingReceipts.id });
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  await notifyCombinedFundraisingReceipt({
    receiptId,
    to: row.order.buyerEmail,
    payerName: row.order.buyerName,
    organizationName: row.workspace.legalName,
    eventTitle: row.event.title,
    receiptNumber,
    amountCents,
    deductibleCents,
    receiptUrl: `${origin}/receipt/${publicToken}`,
    corrected: false,
  });
}

async function issueCorrectedReceipt(originalReceiptId: string): Promise<void> {
  const [row] = await db.select({ receipt: fundraisingReceipts, workspace: workspaces, event: events }).from(fundraisingReceipts)
    .innerJoin(workspaces, eq(fundraisingReceipts.workspaceId, workspaces.id))
    .leftJoin(events, eq(fundraisingReceipts.eventId, events.id))
    .where(eq(fundraisingReceipts.id, originalReceiptId)).limit(1);
  if (!row || !row.workspace.legalName) return;
  const [already] = await db.select({ id: fundraisingReceipts.id }).from(fundraisingReceipts)
    .where(eq(fundraisingReceipts.supersedesReceiptId, originalReceiptId)).limit(1);
  if (already) return;
  const [sequence] = await db.update(workspaces).set({ receiptSequence: sql`${workspaces.receiptSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, row.workspace.id)).returning({ value: workspaces.receiptSequence });
  const id = newId("receipt");
  const publicToken = crypto.randomUUID();
  const receiptNumber = `${row.workspace.receiptPrefix}-${new Date().getUTCFullYear()}-${String(sequence!.value).padStart(6, "0")}`;
  await db.insert(fundraisingReceipts).values({
    id,
    workspaceId: row.receipt.workspaceId,
    eventId: row.receipt.eventId,
    householdId: row.receipt.householdId,
    type: row.receipt.type,
    receiptNumber,
    publicToken,
    payerName: row.receipt.payerName,
    payerEmail: row.receipt.payerEmail,
    amountCents: 0,
    fairMarketValueCents: 0,
    deductibleCents: 0,
    lineItems: (row.receipt.lineItems as Array<Record<string, unknown>>).map((line) => ({ ...line, amountCents: 0, fairMarketValueCents: 0, deductibleCents: 0, corrected: true })),
    supersedesReceiptId: originalReceiptId,
  });
  if (row.receipt.payerEmail) {
    const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
    await notifyCombinedFundraisingReceipt({
      receiptId: id,
      to: row.receipt.payerEmail,
      payerName: row.receipt.payerName,
      organizationName: row.workspace.legalName,
      eventTitle: row.event?.title || "Fundraising transaction",
      receiptNumber,
      amountCents: 0,
      deductibleCents: 0,
      receiptUrl: `${origin}/receipt/${publicToken}`,
      corrected: true,
    });
  }
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
}

export function requireCheckoutMatch(input: {
  session: Stripe.Checkout.Session;
  eventAccount: string | null | undefined;
  connectedAccountId: string | null;
  storedSessionId: string | null;
  amountCents?: number;
  currency?: string;
}): void {
  if (!input.connectedAccountId || input.eventAccount !== input.connectedAccountId) {
    throw new HttpError(400, "The Stripe event does not belong to this organization's payment account.");
  }
  if (!input.storedSessionId || input.session.id !== input.storedSessionId) {
    throw new HttpError(400, "The Stripe Checkout session does not match this transaction.");
  }
  if (input.amountCents !== undefined && input.session.amount_total !== input.amountCents) {
    throw new HttpError(400, "The Stripe Checkout total does not match this transaction.");
  }
  if (input.currency && input.session.currency?.toUpperCase() !== input.currency.toUpperCase()) {
    throw new HttpError(400, "The Stripe Checkout currency does not match this transaction.");
  }
}

export async function failBidderBillSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const billId = session.metadata?.billId;
  if (!billId) return;
  const [bill] = await db.select().from(bidderBills).where(eq(bidderBills.id, billId)).limit(1);
  if (!bill) return;
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: bill.stripeConnectedAccountId, storedSessionId: bill.stripeSessionId });
  await db.update(bidderBills).set({ status: "failed", updatedAt: new Date() }).where(and(eq(bidderBills.id, billId), eq(bidderBills.status, "pending"), eq(bidderBills.stripeSessionId, session.id)));
}

export async function failDonationCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const donationId = session.metadata?.donationId;
  if (!donationId) return;
  const [row] = await db.select({ donation: donations, accountId: workspaces.stripeConnectedAccountId }).from(donations)
    .innerJoin(workspaces, eq(donations.workspaceId, workspaces.id)).where(eq(donations.id, donationId)).limit(1);
  if (!row) return;
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: row.accountId, storedSessionId: row.donation.stripeSessionId });
  await db.update(donations).set({ status: "failed", updatedAt: new Date() }).where(and(eq(donations.id, donationId), eq(donations.status, "pending"), eq(donations.stripeSessionId, session.id)));
}

export async function completeTicketOrder(input: {
  orderId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  paymentMethodId?: string | null;
}): Promise<void> {
  const paidAt = new Date();
  const result = await db.execute<{ changed: number }>(sql`
    with pending_order as (
      select * from ${ticketOrders}
      where ${ticketOrders.id} = ${input.orderId} and ${ticketOrders.status} = 'pending'
      for update
    ), sold as (
      update ${ticketTypes} as ticket
      set quantity_sold = ticket.quantity_sold + pending_order.quantity, updated_at = ${paidAt}
      from pending_order
      where ticket.id = pending_order.ticket_type_id
        and (ticket.quantity_total = 0 or ticket.quantity_sold + pending_order.quantity <= ticket.quantity_total)
      returning ticket.id
    ), paid as (
      update ${ticketOrders} as orders
      set status = 'paid', paid_at = ${paidAt}, updated_at = ${paidAt},
          stripe_session_id = coalesce(${input.stripeSessionId ?? null}, orders.stripe_session_id),
          stripe_payment_intent_id = coalesce(${input.stripePaymentIntentId ?? null}, orders.stripe_payment_intent_id)
      from sold
      where orders.id = ${input.orderId}
      returning orders.id
    )
    select count(*)::integer as changed from paid
  `);
  const changed = Number(result.rows[0]?.changed ?? 0) > 0;
  await ensureOrderRegistrations(input.orderId);
  await ensureTicketBuyerAuctionAccess(input);
  if (!changed) return;

  const [details] = await db
    .select({ order: ticketOrders, event: events, ticket: ticketTypes, workspaceTimeZone: workspaces.timeZone })
    .from(ticketOrders)
    .innerJoin(events, eq(ticketOrders.eventId, events.id))
    .innerJoin(ticketTypes, eq(ticketOrders.ticketTypeId, ticketTypes.id))
    .innerJoin(workspaces, eq(ticketOrders.workspaceId, workspaces.id))
    .where(eq(ticketOrders.id, input.orderId))
    .limit(1);
  if (!details) return;
  await db
    .update(ticketInvitations)
    .set({ status: "registered", registeredAt: paidAt, updatedAt: paidAt })
    .where(and(
      eq(ticketInvitations.eventId, details.order.eventId),
      eq(ticketInvitations.recipientEmail, details.order.buyerEmail),
    ));
  await notifyTicketOrderConfirmation({
    orderId: details.order.id,
    to: details.order.buyerEmail,
    buyerName: details.order.buyerName,
    eventTitle: details.event.title,
    ticketName: details.ticket.name,
    quantity: details.order.quantity,
    amountCents: details.order.amountCents,
    applicationFeeCents: details.order.applicationFeeCents,
    startsAt: details.event.startsAt.toISOString(),
    timeZone: details.event.timeZone ?? details.workspaceTimeZone,
  });
  await issueTicketReceipt(input.orderId);
}

export async function completeTicketCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || session.payment_status === "unpaid") return;
  const orderIdValue = orderId;
  const [order] = await db.select({ connectedAccountId: ticketOrders.stripeConnectedAccountId, sessionId: ticketOrders.stripeSessionId, amountCents: ticketOrders.amountCents, currency: ticketOrders.currency }).from(ticketOrders)
    .where(eq(ticketOrders.id, orderIdValue)).limit(1);
  if (!order) throw new HttpError(400, "The ticket order in this Stripe event does not exist.");
  requireCheckoutMatch({ session, eventAccount: eventAccount ?? order.connectedAccountId, connectedAccountId: order.connectedAccountId, storedSessionId: order.sessionId, amountCents: order.amountCents, currency: order.currency });
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  let paymentMethodId: string | null = null;
  const intentId = paymentIntentId(session);
  if (intentId && order?.connectedAccountId) {
    try {
      const intent = await stripeClient().paymentIntents.retrieve(intentId, {}, { stripeAccount: order.connectedAccountId });
      paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id ?? null;
    } catch (error) {
      console.warn("TICKET_WALLET_PAYMENT_METHOD_NOT_SAVED", orderId, error instanceof Error ? error.message : String(error));
    }
  }
  await completeTicketOrder({
    orderId,
    stripeSessionId: session.id,
    stripePaymentIntentId: intentId,
    stripeCustomerId: customerId,
    paymentMethodId,
  });
}

export async function failTicketCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
  const [order] = await db.select({ connectedAccountId: ticketOrders.stripeConnectedAccountId, sessionId: ticketOrders.stripeSessionId }).from(ticketOrders).where(eq(ticketOrders.id, orderId)).limit(1);
  if (!order) return;
  requireCheckoutMatch({ session, eventAccount: eventAccount ?? order.connectedAccountId, connectedAccountId: order.connectedAccountId, storedSessionId: order.sessionId });
  await db
    .update(ticketOrders)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.status, "pending")));
}

async function reconcileExpiredTicketOrders(eventId: string): Promise<void> {
  const expired = await db.select().from(ticketOrders).where(and(
    eq(ticketOrders.eventId, eventId),
    eq(ticketOrders.status, "pending"),
    sql`${ticketOrders.checkoutExpiresAt} <= now()`,
  )).limit(20);
  for (const order of expired) {
    if (!order.stripeSessionId || !order.stripeConnectedAccountId) {
      await db.update(ticketOrders).set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, "pending")));
      continue;
    }
    const stripe = stripeClient();
    const options = { stripeAccount: order.stripeConnectedAccountId };
    let session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {}, options);
    if (session.payment_status === "paid") {
      await completeTicketCheckoutSession(session, order.stripeConnectedAccountId);
      continue;
    }
    if (session.status === "open") session = await stripe.checkout.sessions.expire(session.id, {}, options);
    if (session.status === "expired") await failTicketCheckoutSession(session, order.stripeConnectedAccountId);
  }
}

export async function createPublicTicketCheckout(
  shareToken: string,
  input: PublicTicketCheckoutInput,
  request: Request,
): Promise<TicketCheckoutResult> {
  const buyerName = input.buyerName.trim();
  const buyerEmail = input.buyerEmail.trim().toLowerCase();
  const buyerPhone = input.buyerPhone.trim();
  if (!buyerName) throw new HttpError(400, "Enter the buyer's full name.");
  if (!EMAIL.test(buyerEmail)) throw new HttpError(400, "Enter a valid email address.");
  if (buyerPhone.replace(/\D/g, "").length < 10) throw new HttpError(400, "Enter a valid mobile phone number.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new HttpError(400, "Choose at least one ticket.");
  if (!Number.isInteger(input.donationAddOnCents) || input.donationAddOnCents < 0) throw new HttpError(400, "Enter a valid donation add-on.");

  const [row] = await db
    .select({ ticket: ticketTypes, event: events, workspace: workspaces })
    .from(ticketTypes)
    .innerJoin(events, eq(ticketTypes.eventId, events.id))
    .innerJoin(workspaces, eq(ticketTypes.workspaceId, workspaces.id))
    .where(and(eq(ticketTypes.id, input.ticketTypeId), eq(events.shareToken, shareToken)))
    .limit(1);
  if (!row || ["cancelled", "completed"].includes(row.event.status)) {
    throw new HttpError(404, "This ticket link is no longer active.");
  }
  await reconcileExpiredTicketOrders(row.event.id);
  if (!row.ticket.isActive) throw new HttpError(409, `${row.ticket.name} is not on sale.`);
  if (row.ticket.priceCents > 0 && row.ticket.fairMarketValueCents == null) {
    throw new HttpError(409, "The organizer must set the fair market value before this paid ticket can be sold.");
  }
  if (row.ticket.priceCents > 0 && row.ticket.fairMarketValueCents === 0 && !row.ticket.fmvZeroConfirmed) {
    throw new HttpError(409, "The organizer must confirm that this paid ticket provides no goods or services before using a $0 fair market value.");
  }
  if (input.quantity > row.ticket.maxPerOrder) {
    throw new HttpError(409, `You can purchase at most ${row.ticket.maxPerOrder} at a time.`);
  }

  const suppliedNames = input.guestNames.map((name) => name.trim()).filter(Boolean);
  const guestNames = row.ticket.collectGuestNames ? suppliedNames : [buyerName];
  if (row.ticket.collectGuestNames && guestNames.length !== input.quantity) {
    throw new HttpError(400, `Enter a full name for all ${input.quantity} ticket holders.`);
  }
  if (guestNames.some((name) => name.length > 160)) throw new HttpError(400, "Guest names must be 160 characters or fewer.");

  const ticketAmountCents = row.ticket.priceCents * input.quantity;
  const amountCents = ticketAmountCents + input.donationAddOnCents;
  const applicationFeeCents = platformFeeCents(amountCents);
  const orderId = newId("tord");
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
  const connectedAccountId = amountCents > 0 ? row.workspace.stripeConnectedAccountId : null;
  let paymentStripe: Stripe | null = null;
  if (amountCents > 0 && !connectedAccountId) {
    throw new HttpError(409, "The organizer has not connected ticket payouts yet. Ask them to finish payment setup.");
  }
  if (amountCents > 0) {
    paymentStripe = stripeClient();
    const account = await paymentStripe.accounts.retrieve(connectedAccountId!);
    await syncConnectedAccount(row.workspace.id, account);
    if (!account.details_submitted || !account.charges_enabled || !account.payouts_enabled) {
      throw new HttpError(409, "The organizer's payout setup is not complete yet.");
    }
  }

  await reserveOrder({
    orderId,
    ticketTypeId: row.ticket.id,
    buyerName,
    buyerEmail,
    quantity: input.quantity,
    amountCents: ticketAmountCents,
    applicationFeeCents: Math.min(applicationFeeCents, ticketAmountCents),
    connectedAccountId,
    expiresAt,
  });
  try {
    await db.update(ticketOrders).set({
      amountCents,
      applicationFeeCents,
      donationAddOnCents: input.donationAddOnCents,
      benefitsDeclined: input.benefitsDeclined,
      autoChargeOptIn: input.autoChargeOptIn,
      buyerPhone,
      gradeTags: input.gradeTags,
      updatedAt: new Date(),
    }).where(eq(ticketOrders.id, orderId));
    await storeOrderGuests({
      orderId,
      workspaceId: row.workspace.id,
      eventId: row.event.id,
      buyerName,
      buyerEmail,
      guestNames,
    });
    if (amountCents === 0) {
      await completeTicketOrder({ orderId });
      return { orderId, kind: "free-confirmed", checkoutUrl: null, applicationFeeCents };
    }

    const stripe = paymentStripe!;
    const params = ticketCheckoutSessionParams({
      orderId,
      eventTitle: row.event.title,
      ticketName: row.ticket.name,
      ticketTypeId: row.ticket.id,
      shareToken,
      buyerEmail,
      quantity: input.quantity,
      unitAmountCents: row.ticket.priceCents,
      applicationFeeCents,
      donationAddOnCents: input.donationAddOnCents,
      currency: row.workspace.currency,
      origin: appOrigin(request),
      expiresAt,
    });
    const session = await stripe.checkout.sessions.create(params, {
      stripeAccount: connectedAccountId!,
      idempotencyKey: `beebizy_ticket_checkout_${orderId}`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await db
      .update(ticketOrders)
      .set({ stripeSessionId: session.id, updatedAt: new Date() })
      .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.status, "pending")));
    return { orderId, kind: "stripe-checkout", checkoutUrl: session.url, applicationFeeCents };
  } catch (error) {
    await db
      .update(ticketOrders)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.status, "pending")));
    throw error;
  }
}

export async function listTicketOrders(ctx: RequestContext, eventId: string): Promise<TicketOrder[]> {
  const orders = await db
    .select()
    .from(ticketOrders)
    .where(and(eq(ticketOrders.workspaceId, ctx.workspaceId), eq(ticketOrders.eventId, eventId)))
    .orderBy(sql`${ticketOrders.createdAt} desc`);
  if (orders.length === 0) return [];
  const orderGuests = await db
    .select()
    .from(ticketOrderGuests)
    .where(inArray(ticketOrderGuests.orderId, orders.map((order) => order.id)))
    .orderBy(asc(ticketOrderGuests.createdAt));
  return orders.map((order) => ({
    id: order.id,
    eventId: order.eventId,
    ticketTypeId: order.ticketTypeId,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone,
    gradeTags: order.gradeTags as TicketOrder["gradeTags"],
    quantity: order.quantity,
    amountCents: order.amountCents,
    applicationFeeCents: order.applicationFeeCents,
    donationAddOnCents: order.donationAddOnCents,
    benefitsDeclined: order.benefitsDeclined,
    autoChargeOptIn: order.autoChargeOptIn,
    status: order.status,
    guests: orderGuests.filter((guest) => guest.orderId === order.id).map((guest) => ({
      id: guest.id,
      orderId: guest.orderId,
      fullName: guest.fullName,
      email: guest.email,
    })),
    paidAt: order.paidAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  }));
}

export async function getPublicTicketOrderStatus(
  shareToken: string,
  orderId: string,
): Promise<PublicTicketOrderStatus | null> {
  const [row] = await db.select({ order: ticketOrders }).from(ticketOrders)
    .innerJoin(events, eq(ticketOrders.eventId, events.id))
    .where(and(eq(ticketOrders.id, orderId), eq(events.shareToken, shareToken)))
    .limit(1);
  if (!row) return null;
  const [{ registrationsCreated } = { registrationsCreated: 0 }] = await db.select({
    registrationsCreated: sql<number>`count(*)::integer`,
  }).from(registrations).where(eq(registrations.ticketOrderId, orderId));
  const [local, domain = ""] = row.order.buyerEmail.split("@");
  const buyerEmailMasked = `${local ? `${local.slice(0, 2)}***` : "***"}@${domain}`;
  const [auctionAccess] = await db.select({ auctionToken: events.auctionPublicToken, bidderToken: auctionBidders.publicToken }).from(events)
    .innerJoin(auctionBidders, and(eq(auctionBidders.eventId, events.id), eq(auctionBidders.email, row.order.buyerEmail)))
    .where(eq(events.id, row.order.eventId)).limit(1);
  return {
    orderId: row.order.id,
    status: row.order.status,
    quantity: row.order.quantity,
    amountCents: row.order.amountCents,
    buyerEmailMasked,
    registrationConfirmed: row.order.status === "paid" && Number(registrationsCreated) > 0,
    auctionAccessUrl: auctionAccess?.auctionToken ? `/auction/${auctionAccess.auctionToken}?bidder=${auctionAccess.bidderToken}` : null,
  };
}

export async function refundTicketOrder(ctx: RequestContext, eventId: string, orderId: string): Promise<TicketOrder> {
  if (!(["owner", "admin"] as const).includes(ctx.role as "owner" | "admin")) {
    throw new HttpError(403, "Only an owner or admin can refund a ticket order.");
  }
  const [order] = await db
    .select()
    .from(ticketOrders)
    .where(and(
      eq(ticketOrders.id, orderId),
      eq(ticketOrders.eventId, eventId),
      eq(ticketOrders.workspaceId, ctx.workspaceId),
    ))
    .limit(1);
  if (!order) throw new HttpError(404, "That ticket order no longer exists.");
  if (order.status === "refunded") return (await listTicketOrders(ctx, eventId)).find((item) => item.id === orderId)!;
  if (order.status === "refunding" && (!order.updatedAt || order.updatedAt > new Date(Date.now() - 5 * 60_000))) {
    throw new HttpError(409, "This refund is already processing.");
  }
  if (order.status !== "paid" && order.status !== "refunding") {
    throw new HttpError(409, "Only a paid ticket order can be refunded.");
  }
  if (order.status === "paid") {
    const [claimed] = await db.update(ticketOrders).set({ status: "refunding", updatedAt: new Date() })
      .where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, "paid"))).returning({ id: ticketOrders.id });
    if (!claimed) throw new HttpError(409, "This refund is already processing.");
  }

  let refundId: string | null = null;
  try {
    if (order.amountCents > 0) {
      if (!order.stripePaymentIntentId || !order.stripeConnectedAccountId) {
        throw new HttpError(409, "This paid order is missing its Stripe payment reference. Contact Beebizy support.");
      }
      const refund = await stripeClient().refunds.create(
        { payment_intent: order.stripePaymentIntentId, refund_application_fee: true },
        { stripeAccount: order.stripeConnectedAccountId, idempotencyKey: `beebizy_ticket_refund_${order.id}` },
      );
      refundId = refund.id;
    }
  } catch (error) {
    await db.update(ticketOrders).set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, "refunding")));
    throw error;
  }

  const refundedAt = new Date();
  await db.execute(sql`
    with finalized as (
      update ${ticketOrders}
      set status = 'refunded', refunded_at = ${refundedAt}, stripe_refund_id = ${refundId}, updated_at = ${refundedAt}
      where id = ${order.id} and status = 'refunding'
      returning ticket_type_id, quantity
    )
    , released_inventory as (
      update ${ticketTypes} as ticket
      set quantity_sold = greatest(0, ticket.quantity_sold - finalized.quantity), updated_at = ${refundedAt}
      from finalized
      where ticket.id = finalized.ticket_type_id
      returning ticket.id
    ), cancelled_registrations as (
      update ${registrations}
      set status = 'cancelled', updated_at = ${refundedAt}
      where ticket_order_id = ${order.id} and exists (select 1 from finalized)
      returning id
    )
    select (select count(*) from released_inventory)::integer as released,
           (select count(*) from cancelled_registrations)::integer as cancelled
  `);
  await issueCorrectedReceipt(`receipt_ticket_${order.id}`);
  return (await listTicketOrders(ctx, eventId)).find((item) => item.id === orderId)!;
}

export async function closeAuctionItem(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  _request: Request,
): Promise<{ status: "closed-no-bids" | "winner-notified"; paymentUrl: string | null }> {
  if (!(["owner", "admin"] as const).includes(ctx.role as "owner" | "admin")) {
    throw new HttpError(403, "Only an owner or admin can close an auction item.");
  }
  const [row] = await db.select({
    item: auctionItems,
    event: events,
    bidder: auctionBidders,
    workspace: workspaces,
  }).from(auctionItems)
    .innerJoin(events, eq(auctionItems.eventId, events.id))
    .innerJoin(workspaces, eq(auctionItems.workspaceId, workspaces.id))
    .leftJoin(auctionBidders, eq(auctionItems.winningBidderId, auctionBidders.id))
    .where(and(
      eq(auctionItems.id, itemId),
      eq(auctionItems.eventId, eventId),
      eq(auctionItems.workspaceId, ctx.workspaceId),
    )).limit(1);
  if (!row) throw new HttpError(404, "That auction item no longer exists.");
  if (!row.bidder || row.item.currentBidCents == null) {
    await db.update(auctionItems).set({ status: "closed", updatedAt: new Date() }).where(eq(auctionItems.id, itemId));
    return { status: "closed-no-bids", paymentUrl: null };
  }
  if (row.item.reserveCents != null && row.item.currentBidCents < row.item.reserveCents) {
    await db.update(auctionItems).set({ status: "closed", winnerName: null, winningBidderId: null, updatedAt: new Date() }).where(eq(auctionItems.id, itemId));
    return { status: "closed-no-bids", paymentUrl: null };
  }
  if (row.item.quantityAvailable > 1) {
    const ranked = await db.select({
      bidder: auctionBidders,
      maximumAmountCents: sql<number>`max(${auctionBids.maximumAmountCents})`,
      firstBidAt: sql<Date>`min(${auctionBids.createdAt})`,
    }).from(auctionBids)
      .innerJoin(auctionBidders, eq(auctionBids.bidderId, auctionBidders.id))
      .where(eq(auctionBids.itemId, itemId))
      .groupBy(auctionBidders.id)
      .orderBy(desc(sql`max(${auctionBids.maximumAmountCents})`), asc(sql`min(${auctionBids.createdAt})`))
      .limit(row.item.quantityAvailable + 1);
    const eligible = ranked.filter((candidate) => row.item.reserveCents == null || Number(candidate.maximumAmountCents) >= row.item.reserveCents);
    const winners = eligible.slice(0, row.item.quantityAvailable);
    if (winners.length === 0) {
      await db.update(auctionItems).set({ status: "closed", updatedAt: new Date() }).where(eq(auctionItems.id, itemId));
      return { status: "closed-no-bids", paymentUrl: null };
    }
    const runnerUp = eligible[row.item.quantityAvailable];
    const starting = row.item.startingBidCents ?? 0;
    const increment = row.item.incrementRule === "fixed"
      ? row.item.bidIncrementCents ?? 100
      : bidIncrementCents(runnerUp ? Number(runnerUp.maximumAmountCents) : starting);
    const clearingPrice = Math.max(starting, row.item.reserveCents ?? 0, runnerUp ? Number(runnerUp.maximumAmountCents) + increment : starting);
    const pricedWinners = winners.map((winner) => ({ ...winner, amountCents: Math.min(Number(winner.maximumAmountCents), clearingPrice) }));
    const now = new Date();
    await db.batch([
      db.update(auctionItems).set({
        status: "won",
        winnerName: pricedWinners.map((winner) => winner.bidder.name).join(", "),
        winningBidderId: pricedWinners[0]!.bidder.id,
        currentBidCents: pricedWinners[0]!.amountCents,
        updatedAt: now,
      }).where(eq(auctionItems.id, itemId)),
      db.insert(auctionItemWinners).values(pricedWinners.map((winner) => ({
        id: newId("winner"), workspaceId: ctx.workspaceId, eventId, itemId,
        bidderId: winner.bidder.id, amountCents: winner.amountCents, awardedBy: ctx.userId,
      }))).onConflictDoNothing(),
      db.insert(auctionOrders).values(pricedWinners.map((winner) => ({
        id: newId("aord"), workspaceId: ctx.workspaceId, eventId, itemId,
        bidderId: winner.bidder.id, amountCents: winner.amountCents,
        applicationFeeCents: platformFeeCents(winner.amountCents), currency: row.workspace.currency,
        status: "pending" as const, stripeConnectedAccountId: row.workspace.stripeConnectedAccountId,
      }))).onConflictDoNothing(),
    ]);
    await Promise.all(pricedWinners.map((winner) => notifyAuctionWinner({
      orderId: `${itemId}-${winner.bidder.id}`,
      to: winner.bidder.email,
      bidderName: winner.bidder.name,
      eventTitle: row.event.title,
      itemTitle: row.item.title,
      amountCents: winner.amountCents,
      paymentUrl: null,
    })));
    return { status: "winner-notified", paymentUrl: null };
  }
  if (!row.event.auctionPublicToken) throw new HttpError(409, "Create the public auction link before closing items.");
  const amountCents = row.item.currentBidCents;
  const applicationFeeCents = platformFeeCents(amountCents);
  const proposedOrderId = newId("aord");
  await db.insert(auctionOrders).values({
    id: proposedOrderId,
    workspaceId: ctx.workspaceId,
    eventId,
    itemId,
    bidderId: row.bidder.id,
    amountCents,
    applicationFeeCents,
    currency: row.workspace.currency,
    status: "pending",
    stripeConnectedAccountId: row.workspace.stripeConnectedAccountId,
  }).onConflictDoNothing({ target: [auctionOrders.itemId, auctionOrders.bidderId] });
  const [order] = await db.select().from(auctionOrders).where(and(
    eq(auctionOrders.itemId, itemId),
    eq(auctionOrders.bidderId, row.bidder.id),
  )).limit(1);
  if (!order) throw new Error("The auction winner order could not be created.");
  if (order.status === "paid") {
    return { status: "winner-notified", paymentUrl: row.item.paymentLink };
  }

  await db.batch([
    db.update(auctionItems).set({
      status: "won", winnerName: row.bidder.name, paymentLink: null, updatedAt: new Date(),
    }).where(eq(auctionItems.id, itemId)),
    db.insert(auctionItemWinners).values({
      id: newId("winner"), workspaceId: ctx.workspaceId, eventId, itemId,
      bidderId: row.bidder.id, amountCents, awardedBy: ctx.userId,
    }).onConflictDoNothing({ target: [auctionItemWinners.itemId, auctionItemWinners.bidderId] }),
  ]);
  await notifyAuctionWinner({
    orderId: order.id,
    to: row.bidder.email,
    bidderName: row.bidder.name,
    eventTitle: row.event.title,
    itemTitle: row.item.title,
    amountCents,
    paymentUrl: null,
  });
  return { status: "winner-notified", paymentUrl: null };
}

export async function offerAuctionSecondChance(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  request: Request,
): Promise<{ status: "winner-notified"; paymentUrl: string | null }> {
  const [row] = await db.select({ item: auctionItems, event: events }).from(auctionItems)
    .innerJoin(events, eq(auctionItems.eventId, events.id))
    .where(and(
      eq(auctionItems.id, itemId),
      eq(auctionItems.eventId, eventId),
      eq(auctionItems.workspaceId, ctx.workspaceId),
    )).limit(1);
  if (!row) throw new HttpError(404, "That auction item no longer exists.");
  if (!normalizeAuctionPageSettings(row.event.auctionPage).secondChanceEnabled) {
    throw new HttpError(409, "Turn on second-chance offers in auction settings first.");
  }
  if (!row.item.winningBidderId) throw new HttpError(409, "This item does not have a current winner.");
  const [previousOrder] = await db.select().from(auctionOrders).where(and(
    eq(auctionOrders.itemId, itemId),
    eq(auctionOrders.bidderId, row.item.winningBidderId),
  )).limit(1);
  if (previousOrder?.status === "paid" || previousOrder?.status === "refunding") {
    throw new HttpError(409, "Refund the current winner before making a second-chance offer.");
  }
  if (previousOrder?.status === "pending" && previousOrder.stripeSessionId) {
    if (!previousOrder.stripeConnectedAccountId) {
      throw new HttpError(409, "The original winner's payment session is missing its connected account reference.");
    }
    const stripe = stripeClient();
    const options = { stripeAccount: previousOrder.stripeConnectedAccountId };
    let session = await stripe.checkout.sessions.retrieve(previousOrder.stripeSessionId, {}, options);
    if (session.payment_status === "paid") {
      await completeAuctionCheckoutSession(session);
      throw new HttpError(409, "The current winner already paid. Refund them before making a second-chance offer.");
    }
    if (session.status === "open") {
      try {
        session = await stripe.checkout.sessions.expire(session.id, {}, options);
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
        session = await stripe.checkout.sessions.retrieve(previousOrder.stripeSessionId, {}, options);
        if (session.payment_status === "paid") await completeAuctionCheckoutSession(session);
        throw new HttpError(409, "The original payment link changed while the second-chance offer was prepared. Refresh and try again.");
      }
    }
    if (session.status !== "expired") {
      throw new HttpError(409, "The original winner's payment link could not be closed.");
    }
  }
  const [runnerUp] = await db.select({
    bidderId: auctionBidders.id,
    maximum: sql<number>`max(${auctionBids.maximumAmountCents})`,
    firstBidAt: sql<Date>`min(${auctionBids.createdAt})`,
  }).from(auctionBidders)
    .innerJoin(auctionBids, eq(auctionBids.bidderId, auctionBidders.id))
    .where(and(
      eq(auctionBids.itemId, itemId),
      sql`${auctionBidders.id} <> ${row.item.winningBidderId}`,
    ))
    .groupBy(auctionBidders.id)
    .orderBy(desc(sql`max(${auctionBids.maximumAmountCents})`), asc(sql`min(${auctionBids.createdAt})`))
    .limit(1);
  if (!runnerUp) throw new HttpError(409, "There is no runner-up bidder for this item.");
  await db.batch([
    db.update(auctionOrders).set({ status: "failed", updatedAt: new Date() }).where(and(
      eq(auctionOrders.id, previousOrder?.id ?? "missing"),
      eq(auctionOrders.status, "pending"),
    )),
    db.update(auctionItems).set({
      winningBidderId: runnerUp.bidderId,
      currentBidCents: Number(runnerUp.maximum),
      winnerName: null,
      paymentLink: null,
      status: "open",
      updatedAt: new Date(),
    }).where(eq(auctionItems.id, itemId)),
  ]);
  return closeAuctionItem(ctx, eventId, itemId, request) as Promise<{ status: "winner-notified"; paymentUrl: string | null }>;
}

export async function settleDueAuctionItems(auctionToken: string, request: Request): Promise<void> {
  const [event] = await db.select({ id: events.id, workspaceId: events.workspaceId }).from(events)
    .where(eq(events.auctionPublicToken, auctionToken)).limit(1);
  if (!event) return;
  const dueItems = await db.select({ id: auctionItems.id }).from(auctionItems).where(and(
    eq(auctionItems.eventId, event.id),
    eq(auctionItems.status, "open"),
    sql`${auctionItems.closesAt} is not null and ${auctionItems.closesAt} <= now()`,
  )).limit(50);
  const systemContext: RequestContext = {
    userId: "auction-deadline",
    email: null,
    workspaceId: event.workspaceId,
    role: "owner",
  };
  for (const item of dueItems) {
    try {
      await closeAuctionItem(systemContext, event.id, item.id, request);
    } catch (error) {
      console.error("AUCTION_DEADLINE_SETTLEMENT_FAILED", event.id, item.id, error);
    }
  }
}

export async function createBidderWalletSetup(
  auctionToken: string,
  bidderToken: string,
  request: Request,
): Promise<{ url: string }> {
  const [row] = await db.select({ bidder: auctionBidders, event: events, workspace: workspaces }).from(auctionBidders)
    .innerJoin(events, eq(auctionBidders.eventId, events.id))
    .innerJoin(workspaces, eq(auctionBidders.workspaceId, workspaces.id))
    .where(and(eq(auctionBidders.publicToken, bidderToken), eq(events.auctionPublicToken, auctionToken))).limit(1);
  if (!row) throw new HttpError(404, "This bidder registration is not available.");
  if (!row.workspace.stripeConnectedAccountId) throw new HttpError(409, "The organizer has not connected auction payments yet.");
  const stripe = stripeClient();
  const options = { stripeAccount: row.workspace.stripeConnectedAccountId };
  let customerId = row.bidder.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: row.bidder.name,
      email: row.bidder.email,
      phone: row.bidder.phone ?? undefined,
      metadata: { bidderId: row.bidder.id, eventId: row.event.id },
    }, { ...options, idempotencyKey: `beebizy_bidder_customer_${row.bidder.id}` });
    customerId = customer.id;
    await db.update(auctionBidders).set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(auctionBidders.id, row.bidder.id));
  }
  const metadata = { kind: "bidder-wallet", bidderId: row.bidder.id, eventId: row.event.id };
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    metadata,
    setup_intent_data: { metadata },
    success_url: `${appOrigin(request)}/auction/${encodeURIComponent(auctionToken)}?wallet=success`,
    cancel_url: `${appOrigin(request)}/auction/${encodeURIComponent(auctionToken)}?wallet=cancelled`,
  }, { ...options, idempotencyKey: `beebizy_bidder_wallet_${row.bidder.id}_${Date.now()}` });
  if (!session.url) throw new Error("Stripe did not return a wallet setup URL.");
  return { url: session.url };
}

export async function completeBidderWalletSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const bidderId = session.metadata?.bidderId;
  if (!bidderId || !session.setup_intent) return;
  const [row] = await db.select({ bidder: auctionBidders, accountId: workspaces.stripeConnectedAccountId }).from(auctionBidders)
    .innerJoin(workspaces, eq(auctionBidders.workspaceId, workspaces.id))
    .where(eq(auctionBidders.id, bidderId)).limit(1);
  if (!row?.accountId) return;
  const sessionCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (eventAccount !== row.accountId || !row.bidder.stripeCustomerId || sessionCustomerId !== row.bidder.stripeCustomerId) {
    throw new HttpError(400, "The wallet setup event does not match this bidder or organization.");
  }
  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent.id;
  const intent = await stripeClient().setupIntents.retrieve(setupIntentId, {}, { stripeAccount: row.accountId });
  const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!paymentMethodId) return;
  await db.update(auctionBidders).set({ paymentMethodId, updatedAt: new Date() }).where(eq(auctionBidders.id, bidderId));
}

async function billLineItems(eventId: string, bidderId: string): Promise<FundraisingReceiptLineItem[]> {
  const [awards, pledges] = await Promise.all([
    db.select({ order: auctionOrders, item: auctionItems }).from(auctionOrders)
      .innerJoin(auctionItems, eq(auctionOrders.itemId, auctionItems.id))
      .where(and(eq(auctionOrders.eventId, eventId), eq(auctionOrders.bidderId, bidderId), inArray(auctionOrders.status, ["pending", "paid", "refunding"]))),
    db.select().from(fundraisingPledges).where(and(eq(fundraisingPledges.eventId, eventId), eq(fundraisingPledges.bidderId, bidderId))),
  ]);
  return [
    ...awards.map(({ order, item }) => ({
      kind: "auction" as const,
      description: item.title,
      amountCents: order.amountCents,
      fairMarketValueCents: item.fairMarketValueCents ?? 0,
      deductibleCents: deductibleAmountCents({ kind: "auction", amountCents: order.amountCents, fairMarketValueCents: item.fairMarketValueCents }),
    })),
    ...pledges.map((pledge) => ({
      kind: "fund_a_need" as const,
      description: pledge.appeal === "fund-a-need" ? "Fund-a-Need gift" : pledge.appeal,
      amountCents: pledge.amountCents,
      fairMarketValueCents: 0,
      deductibleCents: pledge.amountCents,
    })),
  ];
}

async function mapPublicBill(row: typeof bidderBills.$inferSelect): Promise<PublicBidderBill> {
  const [bidder, event, workspace, receipt] = await Promise.all([
    db.select().from(auctionBidders).where(eq(auctionBidders.id, row.bidderId)).limit(1),
    db.select().from(events).where(eq(events.id, row.eventId)).limit(1),
    db.select().from(workspaces).where(eq(workspaces.id, row.workspaceId)).limit(1),
    row.receiptId
      ? db.select({ publicToken: fundraisingReceipts.publicToken }).from(fundraisingReceipts).where(eq(fundraisingReceipts.id, row.receiptId)).limit(1)
      : Promise.resolve([]),
  ]);
  const bidderRow = bidder[0];
  const eventRow = event[0];
  const workspaceRow = workspace[0];
  if (!bidderRow || !eventRow || !workspaceRow) throw new Error(`Bill ${row.id} is missing its bidder, event, or workspace.`);
  return {
    id: row.id,
    eventId: row.eventId,
    bidderId: row.bidderId,
    bidderName: bidderRow.name,
    bidderEmail: bidderRow.email,
    publicToken: row.publicToken,
    itemsTotalCents: row.itemsTotalCents,
    pledgesTotalCents: row.pledgesTotalCents,
    feesCoveredCents: row.feesCoveredCents,
    totalCents: row.totalCents,
    applicationFeeCents: row.applicationFeeCents,
    status: row.status,
    paymentMethod: row.paymentMethod,
    payoutAvailableAt: row.payoutAvailableAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    eventTitle: eventRow.title,
    lineItems: await billLineItems(row.eventId, row.bidderId),
    coverFeesAvailable: true,
    receiptToken: receipt[0]?.publicToken ?? null,
  };
}

export async function buildBidderBills(
  ctx: RequestContext,
  eventId: string,
): Promise<{ created: number; bills: PublicBidderBill[] }> {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new HttpError(403, "Only an owner or admin can build bidder bills.");
  const [{ openLots } = { openLots: 0 }] = await db.select({ openLots: sql<number>`count(*)::integer` }).from(auctionItems).where(and(
    eq(auctionItems.workspaceId, ctx.workspaceId),
    eq(auctionItems.eventId, eventId),
    eq(auctionItems.status, "open"),
    sql`(${auctionItems.isPublished} = true or ${auctionItems.currentBidCents} is not null or ${auctionItems.auctionType} = 'live')`,
  ));
  if (Number(openLots) > 0) throw new HttpError(409, `Close or pass all ${openLots} active auction lot${Number(openLots) === 1 ? "" : "s"} before building final bidder bills.`);
  const bidders = await db.select().from(auctionBidders).where(and(eq(auctionBidders.workspaceId, ctx.workspaceId), eq(auctionBidders.eventId, eventId)));
  let created = 0;
  for (const bidder of bidders) {
    const lines = await billLineItems(eventId, bidder.id);
    if (lines.length === 0) continue;
    const itemsTotalCents = lines.filter((line) => line.kind === "auction").reduce((sum, line) => sum + line.amountCents, 0);
    const pledgesTotalCents = lines.filter((line) => line.kind === "fund_a_need").reduce((sum, line) => sum + line.amountCents, 0);
    const base = itemsTotalCents + pledgesTotalCents;
    const [existing] = await db.select().from(bidderBills).where(and(eq(bidderBills.eventId, eventId), eq(bidderBills.bidderId, bidder.id))).limit(1);
    if (!existing) created += 1;
    await db.insert(bidderBills).values({
      id: existing?.id ?? newId("bill"),
      workspaceId: ctx.workspaceId,
      eventId,
      bidderId: bidder.id,
      publicToken: existing?.publicToken ?? crypto.randomUUID(),
      itemsTotalCents,
      pledgesTotalCents,
      totalCents: base,
      applicationFeeCents: platformFeeCents(base),
      status: existing && ["pending", "paid", "refunding", "refunded"].includes(existing.status) ? existing.status : "draft",
    }).onConflictDoUpdate({
      target: [bidderBills.eventId, bidderBills.bidderId],
      set: existing && ["pending", "paid", "refunding", "refunded"].includes(existing.status) ? { updatedAt: new Date() } : {
        itemsTotalCents, pledgesTotalCents, totalCents: base,
        applicationFeeCents: platformFeeCents(base), updatedAt: new Date(),
      },
    });
  }
  const rows = await db.select().from(bidderBills).where(and(eq(bidderBills.workspaceId, ctx.workspaceId), eq(bidderBills.eventId, eventId))).orderBy(asc(bidderBills.createdAt));
  return { created, bills: await Promise.all(rows.map(mapPublicBill)) };
}

export async function sendBidderBills(ctx: RequestContext, eventId: string): Promise<{ sent: number; autoCharged: number; failed: number }> {
  const { bills } = await buildBidderBills(ctx, eventId);
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1);
  if (!workspace?.stripeConnectedAccountId) throw new HttpError(409, "Connect Stripe before sending bidder bills.");
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  let sent = 0;
  let autoCharged = 0;
  let failed = 0;
  for (const bill of bills.filter((item) => ["draft", "failed"].includes(item.status))) {
    const [bidder] = await db.select().from(auctionBidders).where(eq(auctionBidders.id, bill.bidderId)).limit(1);
    if (!bidder) continue;
    if (bidder.autoChargeOptIn && bidder.paymentMethodId && bidder.stripeCustomerId) {
      try {
        const intent = await stripeClient().paymentIntents.create({
          amount: bill.totalCents,
          currency: workspace.currency.toLowerCase(),
          customer: bidder.stripeCustomerId,
          payment_method: bidder.paymentMethodId,
          off_session: true,
          confirm: true,
          application_fee_amount: bill.applicationFeeCents,
          metadata: { kind: "bidder-bill", billId: bill.id },
        }, { stripeAccount: workspace.stripeConnectedAccountId, idempotencyKey: `beebizy_bill_auto_${bill.id}` });
        if (intent.status === "succeeded") {
          await db.update(bidderBills).set({ stripeConnectedAccountId: workspace.stripeConnectedAccountId, updatedAt: new Date() }).where(eq(bidderBills.id, bill.id));
          await completeBidderBillPayment(bill.id, intent.id);
          autoCharged += 1;
          continue;
        }
      } catch (error) {
        console.warn("BIDDER_AUTO_CHARGE_FAILED", bill.id, error instanceof Error ? error.message : String(error));
      }
    }
    const outcome = await notifyBidderBill({
      billId: bill.id,
      to: bill.bidderEmail,
      bidderName: bill.bidderName,
      eventTitle: bill.eventTitle,
      totalCents: bill.totalCents,
      billUrl: `${origin}/bill/${bill.publicToken}`,
    });
    if (outcome.status === "sent") {
      sent += 1;
      await db.update(bidderBills).set({ status: "pending", sentAt: sql`coalesce(${bidderBills.sentAt}, now())`, updatedAt: new Date() }).where(and(eq(bidderBills.id, bill.id), eq(bidderBills.status, "draft")));
    }
    else failed += 1;
  }
  return { sent, autoCharged, failed };
}

export async function sendDueBidderBillReminders(): Promise<{ sent: number; failed: number }> {
  const rows = await db.select({ bill: bidderBills, bidder: auctionBidders, event: events }).from(bidderBills)
    .innerJoin(auctionBidders, eq(bidderBills.bidderId, auctionBidders.id))
    .innerJoin(events, eq(bidderBills.eventId, events.id))
    .where(and(eq(bidderBills.status, "pending"), sql`${bidderBills.sentAt} is not null and ${bidderBills.sentAt} <= now() - interval '24 hours'`));
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;
  for (const { bill, bidder, event } of rows) {
    const due72 = bill.sentAt != null && bill.sentAt.getTime() <= Date.now() - 72 * 60 * 60_000;
    if ((due72 && bill.reminder72SentAt) || (!due72 && bill.reminder24SentAt)) continue;
    const outcome = await notifyBidderBill({
      billId: `${bill.id}-reminder-${due72 ? "72" : "24"}`,
      to: bidder.email,
      bidderName: bidder.name,
      eventTitle: event.title,
      totalCents: bill.totalCents,
      billUrl: `${origin}/bill/${bill.publicToken}`,
    });
    if (outcome.status === "sent") {
      sent += 1;
      await db.update(bidderBills).set(due72 ? { reminder72SentAt: new Date(), updatedAt: new Date() } : { reminder24SentAt: new Date(), updatedAt: new Date() }).where(eq(bidderBills.id, bill.id));
    } else failed += 1;
  }
  return { sent, failed };
}

export async function publicBidderBill(token: string): Promise<PublicBidderBill | null> {
  const [bill] = await db.select().from(bidderBills).where(eq(bidderBills.publicToken, token)).limit(1);
  return bill ? mapPublicBill(bill) : null;
}

export async function createBidderBillCheckout(
  token: string,
  coverFees: boolean,
  request: Request,
): Promise<{ url: string }> {
  const [row] = await db.select({ bill: bidderBills, bidder: auctionBidders, event: events, workspace: workspaces }).from(bidderBills)
    .innerJoin(auctionBidders, eq(bidderBills.bidderId, auctionBidders.id))
    .innerJoin(events, eq(bidderBills.eventId, events.id))
    .innerJoin(workspaces, eq(bidderBills.workspaceId, workspaces.id))
    .where(eq(bidderBills.publicToken, token)).limit(1);
  if (!row) throw new HttpError(404, "This bidder bill is not available.");
  if (row.bill.status === "paid") throw new HttpError(409, "This bill is already paid.");
  if (row.bill.status === "refunding" || row.bill.status === "refunded") throw new HttpError(409, "This bill has been refunded and cannot be paid again.");
  if (!row.workspace.stripeConnectedAccountId) throw new HttpError(409, "The organization has not connected payments.");
  const stripe = stripeClient();
  const options = { stripeAccount: row.workspace.stripeConnectedAccountId };
  if (row.bill.stripeSessionId && row.bill.status === "pending") {
    const existingSession = await stripe.checkout.sessions.retrieve(row.bill.stripeSessionId, {}, options);
    if (existingSession.payment_status === "paid") {
      await completeBidderBillSession(existingSession, row.workspace.stripeConnectedAccountId);
      throw new HttpError(409, "This bill is already paid.");
    }
    if (existingSession.status === "open" && existingSession.url) return { url: existingSession.url };
    if (existingSession.status === "expired") {
      await db.update(bidderBills).set({ status: "failed", updatedAt: new Date() }).where(and(
        eq(bidderBills.id, row.bill.id), eq(bidderBills.status, "pending"), eq(bidderBills.stripeSessionId, existingSession.id),
      ));
    }
  }
  const base = row.bill.itemsTotalCents + row.bill.pledgesTotalCents;
  const feesCoveredCents = coverFees ? coveredFeesCents(base) : 0;
  const totalCents = base + feesCoveredCents;
  const [claim] = await db.update(bidderBills).set({
    feesCoveredCents,
    totalCents,
    applicationFeeCents: platformFeeCents(totalCents),
    status: "pending",
    stripeSessionId: null,
    stripeConnectedAccountId: row.workspace.stripeConnectedAccountId,
    checkoutGeneration: sql`${bidderBills.checkoutGeneration} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(bidderBills.id, row.bill.id),
    sql`(${bidderBills.status} in ('draft','failed') or (${bidderBills.status} = 'pending' and ${bidderBills.stripeSessionId} is null and ${bidderBills.updatedAt} < now() - interval '5 minutes'))`,
  )).returning({ generation: bidderBills.checkoutGeneration });
  if (!claim) throw new HttpError(409, "A secure payment session is already being prepared. Wait a moment and try again.");
  const metadata = { kind: "bidder-bill", billId: row.bill.id, generation: String(claim.generation) };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: row.bidder.stripeCustomerId ?? undefined,
    customer_email: row.bidder.stripeCustomerId ? undefined : row.bidder.email,
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: { currency: row.workspace.currency.toLowerCase(), unit_amount: totalCents, product_data: { name: `${row.event.title} combined bill`, description: "Auction items and Fund-a-Need gifts" } } }],
    metadata,
    payment_intent_data: { application_fee_amount: platformFeeCents(totalCents), setup_future_usage: "off_session", metadata },
    success_url: `${appOrigin(request)}/bill/${encodeURIComponent(token)}?payment=success`,
    cancel_url: `${appOrigin(request)}/bill/${encodeURIComponent(token)}?payment=cancelled`,
    }, { ...options, idempotencyKey: `beebizy_bill_checkout_${row.bill.id}_${claim.generation}` });
  } catch (error) {
    await db.update(bidderBills).set({ status: "failed", updatedAt: new Date() }).where(and(eq(bidderBills.id, row.bill.id), eq(bidderBills.checkoutGeneration, claim.generation), sql`${bidderBills.stripeSessionId} is null`));
    throw error;
  }
  if (!session.url) throw new Error("Stripe did not return a bidder bill checkout URL.");
  const [stored] = await db.update(bidderBills).set({
    stripeSessionId: session.id,
    updatedAt: new Date(),
  }).where(and(eq(bidderBills.id, row.bill.id), eq(bidderBills.checkoutGeneration, claim.generation), eq(bidderBills.status, "pending"), sql`${bidderBills.stripeSessionId} is null`)).returning({ id: bidderBills.id });
  if (!stored) {
    await stripe.checkout.sessions.expire(session.id, {}, options).catch(() => undefined);
    throw new HttpError(409, "The bill changed while payment was being prepared. Refresh and try again.");
  }
  return { url: session.url };
}

async function issueBillReceipt(billId: string): Promise<FundraisingReceipt> {
  const [row] = await db.select({ bill: bidderBills, bidder: auctionBidders, event: events, workspace: workspaces }).from(bidderBills)
    .innerJoin(auctionBidders, eq(bidderBills.bidderId, auctionBidders.id))
    .innerJoin(events, eq(bidderBills.eventId, events.id))
    .innerJoin(workspaces, eq(bidderBills.workspaceId, workspaces.id))
    .where(eq(bidderBills.id, billId)).limit(1);
  if (!row) throw new Error(`Bill ${billId} is missing.`);
  if (row.bill.receiptId) {
    const [existing] = await db.select().from(fundraisingReceipts).where(eq(fundraisingReceipts.id, row.bill.receiptId)).limit(1);
    if (existing) return {
      id: existing.id, eventId: existing.eventId, householdId: existing.householdId, type: existing.type,
      receiptNumber: existing.receiptNumber, payerName: existing.payerName, payerEmail: existing.payerEmail,
      amountCents: existing.amountCents, fairMarketValueCents: existing.fairMarketValueCents, deductibleCents: existing.deductibleCents,
      lineItems: existing.lineItems as unknown as FundraisingReceiptLineItem[], supersedesReceiptId: existing.supersedesReceiptId,
      issuedAt: existing.issuedAt.toISOString(), pdfUrl: existing.pdfUrl,
    };
  }
  if (!row.workspace.legalName || !row.workspace.ein || !row.workspace.fundraisingOrgType) {
    throw new HttpError(409, "Complete the fundraising organization profile before issuing receipts.");
  }
  const lines = await billLineItems(row.bill.eventId, row.bill.bidderId);
  const amountCents = lines.reduce((sum, line) => sum + line.amountCents, 0) + row.bill.feesCoveredCents;
  const fmvCents = lines.reduce((sum, line) => sum + line.fairMarketValueCents, 0);
  const deductibleCents = lines.reduce((sum, line) => sum + line.deductibleCents, 0) + row.bill.feesCoveredCents;
  const [sequence] = await db.update(workspaces).set({ receiptSequence: sql`${workspaces.receiptSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, row.workspace.id)).returning({ value: workspaces.receiptSequence });
  const receiptNumber = `${row.workspace.receiptPrefix}-${new Date().getUTCFullYear()}-${String(sequence!.value).padStart(6, "0")}`;
  const id = `receipt_bill_${billId}`;
  const publicToken = crypto.randomUUID();
  const [insertedReceipt] = await db.insert(fundraisingReceipts).values({
    id,
    workspaceId: row.workspace.id,
    eventId: row.event.id,
    householdId: row.bidder.householdId,
    type: lines.some((line) => line.fairMarketValueCents > 0) ? "quid_pro_quo" : "contribution",
    receiptNumber,
    publicToken,
    payerName: row.bidder.name,
    payerEmail: row.bidder.email,
    amountCents,
    fairMarketValueCents: fmvCents,
    deductibleCents,
    lineItems: lines as unknown as Array<Record<string, unknown>>,
  }).onConflictDoNothing({ target: fundraisingReceipts.id }).returning();
  const [receipt] = insertedReceipt ? [insertedReceipt] : await db.select().from(fundraisingReceipts).where(eq(fundraisingReceipts.id, id)).limit(1);
  if (!receipt) throw new Error(`Receipt ${id} could not be created.`);
  await db.update(bidderBills).set({ receiptId: id, updatedAt: new Date() }).where(eq(bidderBills.id, billId));
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  await notifyCombinedFundraisingReceipt({
    receiptId: id,
    to: row.bidder.email,
    payerName: row.bidder.name,
    organizationName: row.workspace.legalName,
    eventTitle: row.event.title,
    receiptNumber,
    amountCents,
    deductibleCents,
    receiptUrl: `${origin}/receipt/${publicToken}`,
    corrected: false,
  });
  return {
    id: receipt!.id,
    eventId: receipt!.eventId,
    householdId: receipt!.householdId,
    type: receipt!.type,
    receiptNumber: receipt!.receiptNumber,
    payerName: receipt!.payerName,
    payerEmail: receipt!.payerEmail,
    amountCents: receipt!.amountCents,
    fairMarketValueCents: receipt!.fairMarketValueCents,
    deductibleCents: receipt!.deductibleCents,
    lineItems: receipt!.lineItems as unknown as FundraisingReceiptLineItem[],
    supersedesReceiptId: receipt!.supersedesReceiptId,
    issuedAt: receipt!.issuedAt.toISOString(),
    pdfUrl: receipt!.pdfUrl,
  };
}

export async function completeBidderBillPayment(billId: string, paymentIntentId: string): Promise<void> {
  const paidAt = new Date();
  const [transitioned] = await db.update(bidderBills).set({ status: "paid", stripePaymentIntentId: paymentIntentId, paidAt, updatedAt: paidAt })
    .where(and(eq(bidderBills.id, billId), sql`${bidderBills.status} in ('draft','pending','failed')`)).returning();
  const [bill] = transitioned ? [transitioned] : await db.select().from(bidderBills).where(and(eq(bidderBills.id, billId), eq(bidderBills.status, "paid"))).limit(1);
  if (!bill) return;
  if (transitioned) {
    if (bill.stripeConnectedAccountId) {
      try {
        const intent = await stripeClient().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: bill.stripeConnectedAccountId });
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
        const transaction = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
        const walletType = charge?.payment_method_details?.card?.wallet?.type;
        const methodType = walletType ?? charge?.payment_method_details?.type ?? intent.payment_method_types[0] ?? "card";
        const paymentMethod = methodType === "apple_pay" ? "Apple Pay" : methodType === "google_pay" ? "Google Pay" : methodType === "card" ? "Card" : methodType.replaceAll("_", " ");
        await db.update(bidderBills).set({ paymentMethod, payoutAvailableAt: transaction?.available_on ? new Date(transaction.available_on * 1000) : null, updatedAt: new Date() }).where(eq(bidderBills.id, bill.id));
      } catch (error) {
        console.warn("BIDDER_BILL_RECONCILIATION_DETAILS_UNAVAILABLE", bill.id, error instanceof Error ? error.message : String(error));
      }
    }
    const orders = await db.select({ order: auctionOrders, item: auctionItems, bidder: auctionBidders, event: events, workspace: workspaces }).from(auctionOrders)
      .innerJoin(auctionItems, eq(auctionOrders.itemId, auctionItems.id))
      .innerJoin(auctionBidders, eq(auctionOrders.bidderId, auctionBidders.id))
      .innerJoin(events, eq(auctionOrders.eventId, events.id))
      .innerJoin(workspaces, eq(auctionOrders.workspaceId, workspaces.id))
      .where(and(eq(auctionOrders.eventId, bill.eventId), eq(auctionOrders.bidderId, bill.bidderId)));
    await db.batch([
      db.update(auctionOrders).set({ status: "paid", paidAt, stripePaymentIntentId: paymentIntentId, updatedAt: paidAt })
        .where(and(eq(auctionOrders.eventId, bill.eventId), eq(auctionOrders.bidderId, bill.bidderId), eq(auctionOrders.status, "pending"))),
      orders.length > 0
        ? db.update(auctionItems).set({ paymentReceivedAt: paidAt, paymentMethod: "Stripe", fulfillmentStatus: "ready", updatedAt: paidAt })
          .where(inArray(auctionItems.id, orders.map(({ order }) => order.itemId)))
        : db.update(events).set({ updatedAt: paidAt }).where(eq(events.id, bill.eventId)),
    ]);
    const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
    for (const { order, item, bidder, event, workspace } of orders.filter(({ order, item }) => ["pending", "paid"].includes(order.status) && item.deliveryMethod === "Certificate emailed")) {
      const certificateToken = order.certificateToken ?? crypto.randomUUID();
      if (!order.certificateToken) await db.update(auctionOrders).set({ certificateToken, updatedAt: new Date() }).where(and(eq(auctionOrders.id, order.id), sql`${auctionOrders.certificateToken} is null`));
      await notifyExperienceCertificate({ orderId: order.id, to: bidder.email, winnerName: bidder.name, eventTitle: event.title, itemTitle: item.title, organizationName: workspace.legalName || workspace.name, deliveryDetails: item.deliveryDetails, restrictions: item.restrictions, expiresAt: item.expiresAt?.toISOString() ?? null, certificateUrl: `${origin}/certificate/${certificateToken}` });
    }
  }
  await issueBillReceipt(billId);
}

export async function completeBidderBillSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const billId = session.metadata?.billId;
  const intentId = paymentIntentId(session);
  if (!billId || !intentId || session.payment_status === "unpaid") return;
  const [bill] = await db.select().from(bidderBills).where(eq(bidderBills.id, billId)).limit(1);
  if (!bill) throw new HttpError(400, "The bidder bill in this Stripe event does not exist.");
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: bill.stripeConnectedAccountId, storedSessionId: bill.stripeSessionId, amountCents: bill.totalCents });
  await completeBidderBillPayment(billId, intentId);
}

export async function refundBidderBill(ctx: RequestContext, eventId: string, billId: string): Promise<PublicBidderBill> {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new HttpError(403, "Only an owner or admin can refund a bidder bill.");
  const [row] = await db.select({ bill: bidderBills, bidder: auctionBidders, workspace: workspaces }).from(bidderBills)
    .innerJoin(auctionBidders, eq(bidderBills.bidderId, auctionBidders.id))
    .innerJoin(workspaces, eq(bidderBills.workspaceId, workspaces.id))
    .where(and(eq(bidderBills.id, billId), eq(bidderBills.eventId, eventId), eq(bidderBills.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) throw new HttpError(404, "That bidder bill no longer exists.");
  if (row.bill.status === "refunded") return mapPublicBill(row.bill);
  if (row.bill.status !== "paid" && row.bill.status !== "refunding") throw new HttpError(409, "Only a paid bidder bill can be refunded.");
  const accountId = row.bill.stripeConnectedAccountId ?? row.workspace.stripeConnectedAccountId;
  if (!row.bill.stripePaymentIntentId || !accountId) throw new HttpError(409, "This bill is missing its Stripe payment reference. Contact Beebizy support.");
  if (row.bill.status === "paid") {
    const [claimed] = await db.update(bidderBills).set({ status: "refunding", updatedAt: new Date() })
      .where(and(eq(bidderBills.id, billId), eq(bidderBills.status, "paid"))).returning({ id: bidderBills.id });
    if (!claimed) throw new HttpError(409, "This refund is already processing.");
  }
  let refund: Stripe.Refund;
  try {
    refund = await stripeClient().refunds.create(
      { payment_intent: row.bill.stripePaymentIntentId, refund_application_fee: true },
      { stripeAccount: accountId, idempotencyKey: `beebizy_bidder_bill_refund_${billId}` },
    );
  } catch (error) {
    await db.update(bidderBills).set({ status: "paid", updatedAt: new Date() }).where(and(eq(bidderBills.id, billId), eq(bidderBills.status, "refunding")));
    throw error;
  }
  const refundedAt = new Date();
  const paidOrders = await db.select({ id: auctionOrders.id, itemId: auctionOrders.itemId }).from(auctionOrders).where(and(
    eq(auctionOrders.eventId, eventId), eq(auctionOrders.bidderId, row.bill.bidderId), eq(auctionOrders.status, "paid"),
  ));
  await db.batch([
    db.update(bidderBills).set({ status: "refunded", refundedAt, stripeRefundId: refund.id, updatedAt: refundedAt }).where(eq(bidderBills.id, billId)),
    db.update(auctionOrders).set({ status: "refunded", refundedAt, stripeRefundId: refund.id, updatedAt: refundedAt }).where(and(eq(auctionOrders.eventId, eventId), eq(auctionOrders.bidderId, row.bill.bidderId), eq(auctionOrders.status, "paid"))),
    paidOrders.length > 0
      ? db.update(auctionItems).set({ paymentReceivedAt: null, fulfillmentStatus: "pending", updatedAt: refundedAt }).where(inArray(auctionItems.id, paidOrders.map((order) => order.itemId)))
      : db.update(events).set({ updatedAt: refundedAt }).where(eq(events.id, eventId)),
  ]);
  if (row.bill.receiptId) await issueCorrectedReceipt(row.bill.receiptId);
  const [updated] = await db.select().from(bidderBills).where(eq(bidderBills.id, billId)).limit(1);
  return mapPublicBill(updated!);
}

export async function publicFundraisingReceipt(token: string): Promise<{ receipt: FundraisingReceipt; organization: { legalName: string; ein: string; orgType: string }; eventTitle: string | null } | null> {
  const [row] = await db.select({ receipt: fundraisingReceipts, workspace: workspaces, eventTitle: events.title }).from(fundraisingReceipts)
    .innerJoin(workspaces, eq(fundraisingReceipts.workspaceId, workspaces.id))
    .leftJoin(events, eq(fundraisingReceipts.eventId, events.id))
    .where(eq(fundraisingReceipts.publicToken, token)).limit(1);
  if (!row || !row.workspace.legalName || !row.workspace.ein || !row.workspace.fundraisingOrgType) return null;
  return {
    receipt: {
      id: row.receipt.id,
      eventId: row.receipt.eventId,
      householdId: row.receipt.householdId,
      type: row.receipt.type,
      receiptNumber: row.receipt.receiptNumber,
      payerName: row.receipt.payerName,
      payerEmail: row.receipt.payerEmail,
      amountCents: row.receipt.amountCents,
      fairMarketValueCents: row.receipt.fairMarketValueCents,
      deductibleCents: row.receipt.deductibleCents,
      lineItems: row.receipt.lineItems as unknown as FundraisingReceiptLineItem[],
      supersedesReceiptId: row.receipt.supersedesReceiptId,
      issuedAt: row.receipt.issuedAt.toISOString(),
      pdfUrl: row.receipt.pdfUrl,
    },
    organization: { legalName: row.workspace.legalName, ein: row.workspace.ein, orgType: row.workspace.fundraisingOrgType },
    eventTitle: row.eventTitle,
  };
}

export async function createDonationCheckout(
  campaignToken: string,
  input: {
    donorName: string;
    donorEmail: string;
    amountCents: number;
    frequency: "one-time" | "monthly";
    designation?: string | null;
    tributeType?: "honor" | "memory" | null;
    tributeName?: string | null;
    tributeNotifyEmail?: string | null;
    anonymous?: boolean;
    employer?: string | null;
    coverFees?: boolean;
    grades?: string[];
  },
  request: Request,
): Promise<DonationCheckoutResult> {
  if (!input.donorName.trim() || !EMAIL.test(input.donorEmail.trim())) throw new HttpError(400, "Enter the donor name and a valid email.");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) throw new HttpError(400, "Enter a donation of at least $1.");
  const [row] = await db.select({ campaign: donationCampaigns, workspace: workspaces }).from(donationCampaigns)
    .innerJoin(workspaces, eq(donationCampaigns.workspaceId, workspaces.id))
    .where(eq(donationCampaigns.publicToken, campaignToken)).limit(1);
  if (!row || !row.campaign.isActive) throw new HttpError(404, "This donation campaign is not active.");
  if (input.frequency === "monthly" && !row.campaign.monthlyEnabled) throw new HttpError(409, "Monthly giving is not enabled for this campaign.");
  if (!row.workspace.stripeConnectedAccountId) throw new HttpError(409, "The organization has not connected donation payments.");
  const feesCoveredCents = input.coverFees && row.campaign.coverFeesEnabled ? coveredFeesCents(input.amountCents) : 0;
  const totalCents = input.amountCents + feesCoveredCents;
  const donorEmail = input.donorEmail.trim().toLowerCase();
  const validGrades = [...new Set((input.grades ?? []).filter((grade) => (SCHOOL_GRADES as readonly string[]).includes(grade)))].slice(0, 5);
  const donationId = newId("donation");
  await db.insert(donations).values({
    id: donationId,
    workspaceId: row.workspace.id,
    campaignId: row.campaign.id,
    eventId: row.campaign.eventId,
    householdId: null,
    donorName: input.donorName.trim(),
    donorEmail,
    amountCents: input.amountCents,
    frequency: input.frequency,
    designation: input.designation?.trim() || row.campaign.defaultDesignation,
    tributeType: input.tributeType || null,
    tributeName: input.tributeName?.trim() || null,
    tributeNotifyEmail: input.tributeNotifyEmail?.trim().toLowerCase() || null,
    anonymous: input.anonymous === true,
    employer: input.employer?.trim() || null,
    gradeTags: validGrades,
    feesCoveredCents,
  });
  const metadata = { kind: "donation", donationId };
  const recurring = input.frequency === "monthly";
  const session = await stripeClient().checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    customer_email: input.donorEmail.trim().toLowerCase(),
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: {
      currency: row.workspace.currency.toLowerCase(),
      unit_amount: totalCents,
      recurring: recurring ? { interval: "month" } : undefined,
      product_data: { name: row.campaign.title, description: input.designation?.trim() || "Charitable contribution" },
    } }],
    metadata,
    payment_intent_data: recurring ? undefined : { application_fee_amount: platformFeeCents(totalCents), metadata },
    subscription_data: recurring ? { application_fee_percent: 2, metadata } : undefined,
    success_url: `${appOrigin(request)}/give/${encodeURIComponent(campaignToken)}?donation=success&id=${encodeURIComponent(donationId)}`,
    cancel_url: `${appOrigin(request)}/give/${encodeURIComponent(campaignToken)}?donation=cancelled`,
  }, { stripeAccount: row.workspace.stripeConnectedAccountId, idempotencyKey: `beebizy_donation_checkout_${donationId}` });
  if (!session.url) throw new Error("Stripe did not return a donation checkout URL.");
  await db.update(donations).set({ stripeSessionId: session.id, updatedAt: new Date() }).where(eq(donations.id, donationId));
  return { donationId, checkoutUrl: session.url };
}

async function ensureDonationHousehold(donationId: string): Promise<void> {
  const [donation] = await db.select().from(donations).where(eq(donations.id, donationId)).limit(1);
  if (!donation || donation.householdId) return;
  const [created] = await db.insert(households).values({
    id: newId("hh"), workspaceId: donation.workspaceId, displayName: donation.donorName,
    primaryEmail: donation.donorEmail, creditName: donation.anonymous ? "Anonymous" : donation.donorName,
    isAnonymous: donation.anonymous,
  }).onConflictDoNothing({ target: [households.workspaceId, households.primaryEmail] }).returning({ id: households.id });
  if (!created) return;
  await db.update(donations).set({ householdId: created.id, updatedAt: new Date() }).where(and(eq(donations.id, donationId), sql`${donations.householdId} is null`));
  if (donation.gradeTags.length > 0) {
    const schoolYear = String(new Date().getUTCFullYear());
    await db.insert(householdGrades).values(donation.gradeTags.map((grade) => ({ id: newId("hhg"), householdId: created.id, workspaceId: donation.workspaceId, grade, schoolYear }))).onConflictDoNothing();
  }
}

async function issueDonationReceipt(donationId: string): Promise<void> {
  const [row] = await db.select({ donation: donations, campaign: donationCampaigns, workspace: workspaces, event: events }).from(donations)
    .innerJoin(donationCampaigns, eq(donations.campaignId, donationCampaigns.id))
    .innerJoin(workspaces, eq(donations.workspaceId, workspaces.id))
    .leftJoin(events, eq(donations.eventId, events.id))
    .where(eq(donations.id, donationId)).limit(1);
  if (!row || !row.workspace.legalName || !row.workspace.ein || !row.workspace.fundraisingOrgType) {
    console.warn("DONATION_RECEIPT_PROFILE_INCOMPLETE", donationId);
    return;
  }
  const amountCents = row.donation.amountCents + row.donation.feesCoveredCents;
  const lineItems: FundraisingReceiptLineItem[] = [{ kind: "donation", description: row.donation.designation || row.campaign.title, amountCents, fairMarketValueCents: 0, deductibleCents: amountCents }];
  const [sequence] = await db.update(workspaces).set({ receiptSequence: sql`${workspaces.receiptSequence} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, row.workspace.id)).returning({ value: workspaces.receiptSequence });
  const receiptNumber = `${row.workspace.receiptPrefix}-${new Date().getUTCFullYear()}-${String(sequence!.value).padStart(6, "0")}`;
  const receiptId = newId("receipt");
  const publicToken = crypto.randomUUID();
  await db.insert(fundraisingReceipts).values({
    id: receiptId,
    workspaceId: row.workspace.id,
    eventId: row.donation.eventId,
    householdId: row.donation.householdId,
    type: "contribution",
    receiptNumber,
    publicToken,
    payerName: row.donation.donorName,
    payerEmail: row.donation.donorEmail,
    amountCents,
    fairMarketValueCents: 0,
    deductibleCents: amountCents,
    lineItems: lineItems as unknown as Array<Record<string, unknown>>,
  });
  await db.update(donations).set({ receiptId, updatedAt: new Date() }).where(eq(donations.id, donationId));
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  await notifyCombinedFundraisingReceipt({
    receiptId,
    to: row.donation.donorEmail,
    payerName: row.donation.donorName,
    organizationName: row.workspace.legalName,
    eventTitle: row.event?.title || row.campaign.title,
    receiptNumber,
    amountCents,
    deductibleCents: amountCents,
    receiptUrl: `${origin}/receipt/${publicToken}`,
    corrected: false,
  });
  if (row.donation.employer) {
    await db.insert(checklistItems).values({
      id: newId("cl"), workspaceId: row.workspace.id, eventId: row.donation.eventId || row.campaign.eventId!,
      title: `Follow up on employer match: ${row.donation.employer}`,
      description: `${row.donation.donorName} indicated an employer match for ${row.campaign.title}.`,
      category: "Fundraising", sortOrder: 999,
    }).catch((error) => console.warn("EMPLOYER_MATCH_TASK_NOT_CREATED", donationId, error));
  }
}

export async function publicDonationStatus(campaignToken: string, donationId: string): Promise<{ donationId: string; status: "pending" | "paid" | "refunding" | "refunded" | "failed"; receiptToken: string | null } | null> {
  const [row] = await db.select({ donation: donations, receiptToken: fundraisingReceipts.publicToken }).from(donations)
    .innerJoin(donationCampaigns, eq(donations.campaignId, donationCampaigns.id))
    .leftJoin(fundraisingReceipts, eq(donations.receiptId, fundraisingReceipts.id))
    .where(and(eq(donationCampaigns.publicToken, campaignToken), eq(donations.id, donationId))).limit(1);
  return row ? { donationId: row.donation.id, status: row.donation.status, receiptToken: row.receiptToken } : null;
}

export async function publicExperienceCertificate(token: string): Promise<import("../data/entities.ts").PublicExperienceCertificate | null> {
  const [row] = await db.select({ order: auctionOrders, item: auctionItems, bidder: auctionBidders, event: events, workspace: workspaces }).from(auctionOrders)
    .innerJoin(auctionItems, eq(auctionOrders.itemId, auctionItems.id))
    .innerJoin(auctionBidders, eq(auctionOrders.bidderId, auctionBidders.id))
    .innerJoin(events, eq(auctionOrders.eventId, events.id))
    .innerJoin(workspaces, eq(auctionOrders.workspaceId, workspaces.id))
    .where(and(eq(auctionOrders.certificateToken, token), eq(auctionOrders.status, "paid"))).limit(1);
  return row ? { itemTitle: row.item.title, winnerName: row.bidder.name, eventTitle: row.event.title, organizationName: row.workspace.legalName || row.workspace.name, restrictions: row.item.restrictions, expiresAt: row.item.expiresAt?.toISOString() ?? null, deliveryDetails: row.item.deliveryDetails } : null;
}

export async function completeDonationCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const donationId = session.metadata?.donationId;
  if (!donationId || session.payment_status === "unpaid") return;
  const [payment] = await db.select({ donation: donations, accountId: workspaces.stripeConnectedAccountId, currency: workspaces.currency }).from(donations)
    .innerJoin(workspaces, eq(donations.workspaceId, workspaces.id)).where(eq(donations.id, donationId)).limit(1);
  if (!payment) throw new HttpError(400, "The donation in this Stripe event does not exist.");
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: payment.accountId, storedSessionId: payment.donation.stripeSessionId, amountCents: payment.donation.amountCents + payment.donation.feesCoveredCents, currency: payment.currency });
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const [updated] = await db.update(donations).set({
    status: "paid",
    stripeSubscriptionId: subscriptionId,
    paidAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(donations.id, donationId), eq(donations.status, "pending"))).returning({ id: donations.id });
  if (updated) {
    await ensureDonationHousehold(donationId);
    await issueDonationReceipt(donationId);
  }
}

export async function completeRecurringDonationInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  connectedAccountId: string,
): Promise<void> {
  if (invoice.billing_reason === "subscription_create" || invoice.status !== "paid") return;
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: connectedAccountId });
  const originalDonationId = subscription.metadata?.donationId;
  if (!originalDonationId) return;
  const [originalRow] = await db.select({ donation: donations, accountId: workspaces.stripeConnectedAccountId }).from(donations)
    .innerJoin(workspaces, eq(donations.workspaceId, workspaces.id)).where(eq(donations.id, originalDonationId)).limit(1);
  if (!originalRow || originalRow.accountId !== connectedAccountId || originalRow.donation.stripeSubscriptionId !== subscriptionId || originalRow.donation.frequency !== "monthly") {
    throw new HttpError(400, "The recurring donation event does not match this organization or subscription.");
  }
  const original = originalRow.donation;
  const recurringId = `donation_invoice_${invoice.id}`;
  const [created] = await db.insert(donations).values({
    id: recurringId,
    workspaceId: original.workspaceId,
    campaignId: original.campaignId,
    eventId: original.eventId,
    householdId: original.householdId,
    donorName: original.donorName,
    donorEmail: original.donorEmail,
    amountCents: original.amountCents,
    frequency: "monthly",
    designation: original.designation,
    tributeType: original.tributeType,
    tributeName: original.tributeName,
    tributeNotifyEmail: original.tributeNotifyEmail,
    anonymous: original.anonymous,
    employer: original.employer,
    feesCoveredCents: original.feesCoveredCents,
    status: "paid",
    stripeSessionId: invoice.id,
    stripeSubscriptionId: subscriptionId,
    paidAt: new Date((invoice.status_transitions.paid_at ?? Math.floor(Date.now() / 1_000)) * 1_000),
  }).onConflictDoNothing({ target: donations.stripeSessionId }).returning({ id: donations.id });
  if (created) {
    await ensureDonationHousehold(recurringId);
    await issueDonationReceipt(recurringId);
  }
}

export async function syncRecurringDonationSubscription(subscription: Stripe.Subscription, connectedAccountId: string): Promise<void> {
  const donationId = subscription.metadata?.donationId;
  if (!donationId) return;
  const [row] = await db.select({ donation: donations, accountId: workspaces.stripeConnectedAccountId }).from(donations)
    .innerJoin(workspaces, eq(donations.workspaceId, workspaces.id)).where(eq(donations.id, donationId)).limit(1);
  if (!row || row.accountId !== connectedAccountId || (row.donation.stripeSubscriptionId && row.donation.stripeSubscriptionId !== subscription.id)) {
    throw new HttpError(400, "The donation subscription event does not match this organization.");
  }
  await db.update(donations).set({
    stripeSubscriptionId: subscription.id,
    subscriptionEndedAt: subscription.status === "canceled" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(donations.id, donationId));
}

export async function completeAuctionCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || session.payment_status === "unpaid") return;
  const [payment] = await db.select().from(auctionOrders).where(eq(auctionOrders.id, orderId)).limit(1);
  if (!payment) throw new HttpError(400, "The auction order in this Stripe event does not exist.");
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: payment.stripeConnectedAccountId, storedSessionId: payment.stripeSessionId, amountCents: payment.amountCents, currency: payment.currency });
  const paidAt = new Date();
  const [updated] = await db.update(auctionOrders).set({
    status: "paid",
    paidAt,
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    updatedAt: paidAt,
  }).where(and(eq(auctionOrders.id, orderId), eq(auctionOrders.status, "pending"))).returning();
  if (!updated) return;
  const [row] = await db.select({ order: auctionOrders, item: auctionItems, bidder: auctionBidders, event: events })
    .from(auctionOrders)
    .innerJoin(auctionItems, eq(auctionOrders.itemId, auctionItems.id))
    .innerJoin(auctionBidders, eq(auctionOrders.bidderId, auctionBidders.id))
    .innerJoin(events, eq(auctionOrders.eventId, events.id))
    .where(eq(auctionOrders.id, orderId)).limit(1);
  if (!row) return;
  await db.update(auctionItems).set({
    paymentReceivedAt: paidAt,
    paymentMethod: "Stripe",
    fulfillmentStatus: "ready",
    updatedAt: paidAt,
  }).where(eq(auctionItems.id, row.item.id));
  await notifyAuctionPaymentConfirmation({
    orderId,
    to: row.bidder.email,
    bidderName: row.bidder.name,
    eventTitle: row.event.title,
    itemTitle: row.item.title,
    amountCents: row.order.amountCents,
    deliveryDetails: row.item.deliveryDetails,
  });
}

export async function failAuctionCheckoutSession(session: Stripe.Checkout.Session, eventAccount?: string | null): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
  const [order] = await db.select().from(auctionOrders).where(eq(auctionOrders.id, orderId)).limit(1);
  if (!order) return;
  requireCheckoutMatch({ session, eventAccount, connectedAccountId: order.stripeConnectedAccountId, storedSessionId: order.stripeSessionId });
  await db.update(auctionOrders).set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(auctionOrders.id, orderId), eq(auctionOrders.status, "pending")));
}

export async function listAuctionOrders(ctx: RequestContext, eventId: string): Promise<AuctionOrder[]> {
  const rows = await db.select({ order: auctionOrders, item: auctionItems, bidder: auctionBidders })
    .from(auctionOrders)
    .innerJoin(auctionItems, eq(auctionOrders.itemId, auctionItems.id))
    .innerJoin(auctionBidders, eq(auctionOrders.bidderId, auctionBidders.id))
    .where(and(eq(auctionOrders.workspaceId, ctx.workspaceId), eq(auctionOrders.eventId, eventId)))
    .orderBy(sql`${auctionOrders.createdAt} desc`);
  return rows.map(({ order, item, bidder }) => ({
    id: order.id,
    eventId: order.eventId,
    itemId: order.itemId,
    itemTitle: item.title,
    bidderId: order.bidderId,
    bidderName: bidder.name,
    bidderEmail: bidder.email,
    amountCents: order.amountCents,
    applicationFeeCents: order.applicationFeeCents,
    status: order.status,
    paidAt: order.paidAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    fulfillmentStatus: item.fulfillmentStatus,
    createdAt: order.createdAt.toISOString(),
  }));
}

export async function refundAuctionOrder(ctx: RequestContext, eventId: string, orderId: string): Promise<AuctionOrder> {
  if (!(["owner", "admin"] as const).includes(ctx.role as "owner" | "admin")) {
    throw new HttpError(403, "Only an owner or admin can refund an auction payment.");
  }
  const [order] = await db.select().from(auctionOrders).where(and(
    eq(auctionOrders.id, orderId), eq(auctionOrders.eventId, eventId), eq(auctionOrders.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!order) throw new HttpError(404, "That auction order no longer exists.");
  if (order.status === "refunded") return (await listAuctionOrders(ctx, eventId)).find((item) => item.id === orderId)!;
  if (order.status === "refunding" && (!order.updatedAt || order.updatedAt > new Date(Date.now() - 5 * 60_000))) {
    throw new HttpError(409, "This refund is already processing.");
  }
  if (order.status !== "paid" && order.status !== "refunding") {
    throw new HttpError(409, "Only a paid auction order can be refunded.");
  }
  if (!order.stripePaymentIntentId || !order.stripeConnectedAccountId) {
    throw new HttpError(409, "This order is missing its Stripe payment reference. Contact Beebizy support.");
  }
  if (order.status === "paid") {
    const [claimed] = await db.update(auctionOrders).set({ status: "refunding", updatedAt: new Date() })
      .where(and(eq(auctionOrders.id, order.id), eq(auctionOrders.status, "paid"))).returning({ id: auctionOrders.id });
    if (!claimed) throw new HttpError(409, "This refund is already processing.");
  }
  let refund: Stripe.Refund;
  try {
    refund = await stripeClient().refunds.create(
      { payment_intent: order.stripePaymentIntentId, refund_application_fee: true },
      { stripeAccount: order.stripeConnectedAccountId, idempotencyKey: `beebizy_auction_refund_${order.id}` },
    );
  } catch (error) {
    await db.update(auctionOrders).set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(auctionOrders.id, order.id), eq(auctionOrders.status, "refunding")));
    throw error;
  }
  const refundedAt = new Date();
  await db.batch([
    db.update(auctionOrders).set({ status: "refunded", refundedAt, stripeRefundId: refund.id, updatedAt: refundedAt })
      .where(and(eq(auctionOrders.id, order.id), eq(auctionOrders.status, "refunding"))),
    db.update(auctionItems).set({ paymentReceivedAt: null, fulfillmentStatus: "pending", updatedAt: refundedAt })
      .where(eq(auctionItems.id, order.itemId)),
  ]);
  return (await listAuctionOrders(ctx, eventId)).find((item) => item.id === orderId)!;
}
