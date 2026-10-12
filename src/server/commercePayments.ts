import Stripe from "stripe";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { platformFeeCents } from "../data/commerce.ts";
import type { AuctionOrder, StripeConnectStatus, TicketCheckoutResult, TicketOrder } from "../data/entities.ts";
import { db } from "./db.ts";
import { HttpError, newId, type RequestContext } from "./auth.ts";
import { notifyAuctionPaymentConfirmation, notifyAuctionWinner, notifyTicketOrderConfirmation } from "./notify.ts";
import {
  auctionBidders,
  auctionItems,
  auctionOrders,
  events,
  guests,
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

function requireOwner(ctx: RequestContext): void {
  if (ctx.role !== "owner") throw new HttpError(403, "Only the workspace owner can connect the payment account.");
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
): Promise<StripeConnectStatus> {
  requireOwner(ctx);
  const stripe = stripeClient();
  const workspace = await workspaceRow(ctx.workspaceId);
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
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due", future_requirements: "include" },
    refresh_url: `${origin}/app/tickets?stripe=refresh`,
    return_url: `${origin}/app/tickets?stripe=return`,
  });
  const account = await stripe.accounts.retrieve(accountId);
  await syncConnectedAccount(workspace.id, account);
  return { ...accountStatus(account), onboardingUrl: link.url };
}

export interface PublicTicketCheckoutInput {
  ticketTypeId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  guestNames: string[];
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
    ],
    metadata,
    payment_intent_data: {
      application_fee_amount: input.applicationFeeCents,
      metadata,
    },
    billing_address_collection: "auto",
    expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
    success_url: `${input.origin}/e/${encodeURIComponent(input.shareToken)}/tickets?checkout=success&order=${encodeURIComponent(input.orderId)}`,
    cancel_url: `${input.origin}/e/${encodeURIComponent(input.shareToken)}/tickets?checkout=cancelled`,
  };
}

function checkoutError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
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

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
}

export async function completeTicketOrder(input: {
  orderId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
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
  if (!changed) return;

  const [details] = await db
    .select({ order: ticketOrders, event: events, ticket: ticketTypes, timeZone: workspaces.timeZone })
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
    timeZone: details.timeZone,
  });
}

export async function completeTicketCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || session.payment_status === "unpaid") return;
  await completeTicketOrder({
    orderId,
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
  });
}

export async function failTicketCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
  await db
    .update(ticketOrders)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.status, "pending")));
}

export async function createPublicTicketCheckout(
  shareToken: string,
  input: PublicTicketCheckoutInput,
  request: Request,
): Promise<TicketCheckoutResult> {
  const buyerName = input.buyerName.trim();
  const buyerEmail = input.buyerEmail.trim().toLowerCase();
  if (!buyerName) throw new HttpError(400, "Enter the buyer's full name.");
  if (!EMAIL.test(buyerEmail)) throw new HttpError(400, "Enter a valid email address.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new HttpError(400, "Choose at least one ticket.");

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
  if (!row.ticket.isActive) throw new HttpError(409, `${row.ticket.name} is not on sale.`);
  if (input.quantity > row.ticket.maxPerOrder) {
    throw new HttpError(409, `You can purchase at most ${row.ticket.maxPerOrder} at a time.`);
  }

  const suppliedNames = input.guestNames.map((name) => name.trim()).filter(Boolean);
  const guestNames = row.ticket.collectGuestNames ? suppliedNames : [buyerName];
  if (row.ticket.collectGuestNames && guestNames.length !== input.quantity) {
    throw new HttpError(400, `Enter a full name for all ${input.quantity} ticket holders.`);
  }
  if (guestNames.some((name) => name.length > 160)) throw new HttpError(400, "Guest names must be 160 characters or fewer.");

  const amountCents = row.ticket.priceCents * input.quantity;
  const applicationFeeCents = platformFeeCents(amountCents);
  const orderId = newId("tord");
  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
  const connectedAccountId = amountCents > 0 ? row.workspace.stripeConnectedAccountId : null;
  if (amountCents > 0 && !connectedAccountId) {
    throw new HttpError(409, "The organizer has not connected ticket payouts yet. Ask them to finish payment setup.");
  }
  if (amountCents > 0 && (!row.workspace.stripeConnectedChargesEnabled || !row.workspace.stripeConnectedPayoutsEnabled)) {
    throw new HttpError(409, "The organizer's payout setup is not complete yet.");
  }

  await reserveOrder({
    orderId,
    ticketTypeId: row.ticket.id,
    buyerName,
    buyerEmail,
    quantity: input.quantity,
    amountCents,
    applicationFeeCents,
    connectedAccountId,
    expiresAt,
  });
  try {
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

    const stripe = stripeClient();
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
    quantity: order.quantity,
    amountCents: order.amountCents,
    applicationFeeCents: order.applicationFeeCents,
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
  if (order.status !== "paid") throw new HttpError(409, "Only a paid ticket order can be refunded.");

  let refundId: string | null = null;
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

  const refundedAt = new Date();
  await db.batch([
    db.update(ticketOrders).set({ status: "refunded", refundedAt, stripeRefundId: refundId, updatedAt: refundedAt })
      .where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, "paid"))),
    db.update(ticketTypes).set({
      quantitySold: sql`greatest(0, ${ticketTypes.quantitySold} - ${order.quantity})`,
      updatedAt: refundedAt,
    }).where(eq(ticketTypes.id, order.ticketTypeId)),
    db.update(registrations).set({ status: "cancelled", updatedAt: refundedAt })
      .where(eq(registrations.ticketOrderId, order.id)),
  ]);
  return (await listTicketOrders(ctx, eventId)).find((item) => item.id === orderId)!;
}

function auctionCheckoutSessionParams(input: {
  orderId: string;
  itemTitle: string;
  eventTitle: string;
  bidderEmail: string;
  auctionToken: string;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  origin: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = { kind: "auction-order", orderId: input.orderId };
  return {
    mode: "payment",
    client_reference_id: input.orderId,
    customer_email: input.bidderEmail,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountCents,
        product_data: { name: input.itemTitle, description: `Winning bid at ${input.eventTitle}` },
      },
    }],
    metadata,
    payment_intent_data: { application_fee_amount: input.applicationFeeCents, metadata },
    success_url: `${input.origin}/auction/${encodeURIComponent(input.auctionToken)}?payment=success`,
    cancel_url: `${input.origin}/auction/${encodeURIComponent(input.auctionToken)}?payment=cancelled`,
  };
}

export async function closeAuctionItem(
  ctx: RequestContext,
  eventId: string,
  itemId: string,
  request: Request,
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
  if (!row.event.auctionPublicToken) throw new HttpError(409, "Create the public auction link before closing items.");
  if (!row.workspace.stripeConnectedAccountId || !row.workspace.stripeConnectedChargesEnabled || !row.workspace.stripeConnectedPayoutsEnabled) {
    throw new HttpError(409, "Connect and finish Stripe payout setup before collecting a winning bid.");
  }

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

  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create(auctionCheckoutSessionParams({
    orderId: order.id,
    itemTitle: row.item.title,
    eventTitle: row.event.title,
    bidderEmail: row.bidder.email,
    auctionToken: row.event.auctionPublicToken,
    amountCents,
    applicationFeeCents,
    currency: row.workspace.currency,
    origin: appOrigin(request),
  }), {
    stripeAccount: row.workspace.stripeConnectedAccountId,
    idempotencyKey: `beebizy_auction_checkout_${order.id}`,
  });
  if (!session.url) throw new Error("Stripe did not return an auction payment URL.");
  await db.batch([
    db.update(auctionOrders).set({
      status: "pending", stripeSessionId: session.id, updatedAt: new Date(),
    }).where(eq(auctionOrders.id, order.id)),
    db.update(auctionItems).set({
      status: "won", winnerName: row.bidder.name, paymentLink: session.url, updatedAt: new Date(),
    }).where(eq(auctionItems.id, itemId)),
  ]);
  await notifyAuctionWinner({
    orderId: order.id,
    to: row.bidder.email,
    bidderName: row.bidder.name,
    eventTitle: row.event.title,
    itemTitle: row.item.title,
    amountCents,
    paymentUrl: session.url,
  });
  return { status: "winner-notified", paymentUrl: session.url };
}

export async function completeAuctionCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || session.payment_status === "unpaid") return;
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

export async function failAuctionCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
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
  if (order.status !== "paid") throw new HttpError(409, "Only a paid auction order can be refunded.");
  if (!order.stripePaymentIntentId || !order.stripeConnectedAccountId) {
    throw new HttpError(409, "This order is missing its Stripe payment reference. Contact Beebizy support.");
  }
  const refund = await stripeClient().refunds.create(
    { payment_intent: order.stripePaymentIntentId, refund_application_fee: true },
    { stripeAccount: order.stripeConnectedAccountId, idempotencyKey: `beebizy_auction_refund_${order.id}` },
  );
  const refundedAt = new Date();
  await db.batch([
    db.update(auctionOrders).set({ status: "refunded", refundedAt, stripeRefundId: refund.id, updatedAt: refundedAt })
      .where(eq(auctionOrders.id, order.id)),
    db.update(auctionItems).set({ paymentReceivedAt: null, fulfillmentStatus: "pending", updatedAt: refundedAt })
      .where(eq(auctionItems.id, order.itemId)),
  ]);
  return (await listAuctionOrders(ctx, eventId)).find((item) => item.id === orderId)!;
}
