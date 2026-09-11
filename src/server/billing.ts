import Stripe from "stripe";
import { and, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  BILLING_INTERVALS,
  PLAN_IDS,
  SOLO_LIMITS,
  SOLO_PRICE_LOOKUP_KEYS,
  SOLO_PRICE_OPTIONS,
  type BillingInterval,
  type PlanId,
} from "../data/plans.ts";
import { db } from "./db.ts";
import { HttpError, type RequestContext } from "./auth.ts";
import { eventQuotaSlots, events, workspaceInvites, workspaceMembers, workspaces } from "./schema.ts";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Stripe billing is not configured yet.");
  return new Stripe(key);
}

function appOrigin(request: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

function integrationIdentifier(seed: string): string {
  const suffix = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return `beebizy_${suffix}`;
}

function requireOwner(ctx: RequestContext): void {
  if (ctx.role !== "owner") throw new HttpError(403, "Only the workspace owner can manage billing.");
}

async function workspaceFor(ctx: RequestContext) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1);
  if (!workspace) throw new HttpError(404, "Your workspace is no longer available.");
  return workspace;
}

async function soloPrice(stripe: Stripe, interval: BillingInterval): Promise<Stripe.Price> {
  const configuredId = interval === "month"
    ? process.env.STRIPE_SOLO_MONTHLY_PRICE_ID?.trim()
    : process.env.STRIPE_SOLO_ANNUAL_PRICE_ID?.trim();
  if (configuredId) {
    const configured = await stripe.prices.retrieve(configuredId);
    validateSoloPrice(configured, interval);
    return configured;
  }

  const result = await stripe.prices.list({
    active: true,
    lookup_keys: [SOLO_PRICE_LOOKUP_KEYS[interval]],
    limit: 1,
  });
  const price = result.data[0];
  if (!price) throw new HttpError(503, "This billing option is not configured yet.");
  validateSoloPrice(price, interval);
  return price;
}

export function validateSoloPrice(price: Stripe.Price, interval: BillingInterval): void {
  const expected = SOLO_PRICE_OPTIONS[interval];
  if (
    !price.active ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.currency !== expected.currency ||
    price.unit_amount !== expected.amountCents
  ) {
    throw new HttpError(503, "The configured Stripe price does not match this billing option.");
  }
  if (price.livemode && process.env.STRIPE_LIVE_PAYMENTS_ENABLED !== "true") {
    throw new HttpError(503, "Live Stripe payments are locked until launch is approved.");
  }
}

function checkoutUsesPrice(session: Stripe.Checkout.Session, priceId: string): boolean {
  return session.line_items?.data[0]?.price?.id === priceId;
}

export async function createCheckoutSession(
  ctx: RequestContext,
  interval: BillingInterval,
  request: Request,
): Promise<{ url: string }> {
  requireOwner(ctx);
  if (!BILLING_INTERVALS.includes(interval)) throw new HttpError(400, "Choose monthly or yearly billing.");

  const stripe = stripeClient();
  const workspace = await workspaceFor(ctx);
  if (workspace.subscriptionStatus === "active" || (workspace.stripeSubscriptionId && workspace.subscriptionStatus === "past_due")) {
    throw new HttpError(409, "This workspace already has a subscription. Manage it from Settings.");
  }
  const price = await soloPrice(stripe, interval);
  let customerId = workspace.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ctx.email ?? undefined,
      name: workspace.name,
      metadata: { workspaceId: workspace.id },
    }, { idempotencyKey: `beebizy_customer_${workspace.id}` });
    customerId = customer.id;
    await db.update(workspaces).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(workspaces.id, workspace.id));
  }

  let replacedSessionId: string | null = null;
  if (workspace.stripeCheckoutSessionId && !workspace.stripeCheckoutSessionId.startsWith("pending:")) {
    try {
      const previous = await stripe.checkout.sessions.retrieve(workspace.stripeCheckoutSessionId, {
        expand: ["line_items.data.price"],
      });
      if (
        previous.status === "open" &&
        workspace.stripeCheckoutInterval === interval &&
        previous.metadata?.workspaceId === workspace.id &&
        checkoutUsesPrice(previous, price.id) &&
        previous.url
      ) {
        return { url: previous.url };
      }
      if (previous.status === "open") await stripe.checkout.sessions.expire(previous.id);
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
    }
    replacedSessionId = workspace.stripeCheckoutSessionId;
  }

  const lockId = `pending:${randomUUID()}`;
  // This lease exceeds Vercel's maximum function duration. A stale invocation must lose
  // the compare-and-set below and expire any Stripe session it created.
  const lockCutoff = new Date(Date.now() - 15 * 60_000);
  const entitlementLock = db
    .select({ locked: sql<number>`pg_advisory_xact_lock(hashtext(${workspace.id}))` })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id))
    .limit(1);
  const lockCheckout = db
    .update(workspaces)
    .set({ stripeCheckoutSessionId: lockId, stripeCheckoutInterval: interval, stripeCheckoutLockedAt: new Date() })
    .where(
      and(
        eq(workspaces.id, workspace.id),
        sql`(
          (select count(*) from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${workspace.id}) +
          (select count(*) from ${workspaceInvites}
            where ${workspaceInvites.workspaceId} = ${workspace.id}
              and ${workspaceInvites.acceptedAt} is null)
        ) <= ${SOLO_LIMITS.teamMembers}`,
        replacedSessionId
          ? eq(workspaces.stripeCheckoutSessionId, replacedSessionId)
          : or(isNull(workspaces.stripeCheckoutSessionId), lt(workspaces.stripeCheckoutLockedAt, lockCutoff)),
      ),
    )
    .returning({ id: workspaces.id });
  let lockedRows: { id: string }[];
  try {
    [, lockedRows] = await db.batch([
      entitlementLock,
      lockCheckout,
      db.delete(eventQuotaSlots).where(
        and(
          eq(eventQuotaSlots.workspaceId, workspace.id),
          sql`exists (
            select 1 from ${workspaces}
            where ${workspaces.id} = ${workspace.id}
              and ${workspaces.stripeCheckoutSessionId} = ${lockId}
          )`,
        ),
      ),
      db.insert(eventQuotaSlots).select(
        db
          .select({
            workspaceId: events.workspaceId,
            calendarYear: sql<number>`extract(year from ${events.startsAt})::integer`.as("calendar_year"),
            slot: sql<number>`row_number() over (
              partition by ${events.workspaceId}, extract(year from ${events.startsAt})
              order by ${events.startsAt}, ${events.id}
            )::integer`.as("slot"),
            eventId: events.id,
          })
          .from(events)
          .innerJoin(workspaces, eq(workspaces.id, events.workspaceId))
          .where(
            and(
              eq(events.workspaceId, workspace.id),
              eq(workspaces.stripeCheckoutSessionId, lockId),
            ),
          ),
      ),
    ]);
  } catch (error) {
    const detail = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : null;
    if (["23505", "23514"].includes(String(detail?.code)) || String(detail?.message ?? "").includes("event_quota_slots")) {
      throw new HttpError(
        409,
        `Solo includes ${SOLO_LIMITS.eventsPerYear} events per calendar year. Move or remove extra events first.`,
      );
    }
    throw error;
  }
  const locked = lockedRows[0];
  if (!locked) {
    throw new HttpError(
      409,
      `Solo allows ${SOLO_LIMITS.teamMembers} total team members and one Checkout at a time. Remove extra members or try again in a moment.`,
    );
  }

  try {
    const existingSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    if (existingSubscriptions.data.some((subscription) => !["canceled", "incomplete_expired"].includes(subscription.status))) {
      throw new HttpError(409, "This workspace already has a subscription. Manage it from Settings.");
    }

    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
    const beebizySessions = openSessions.data.filter(
      (candidate) => candidate.mode === "subscription" && candidate.metadata?.workspaceId === workspace.id,
    );
    const reusableSession = beebizySessions.find(
      (candidate) =>
        candidate.metadata?.billingInterval === interval &&
        candidate.metadata?.priceId === price.id &&
        candidate.url,
    );
    if (reusableSession?.url) {
      await Promise.all(
        beebizySessions
          .filter((candidate) => candidate.id !== reusableSession.id)
          .map((candidate) => stripe.checkout.sessions.expire(candidate.id)),
      );
      const promoted = await db
        .update(workspaces)
        .set({ stripeCheckoutSessionId: reusableSession.id, stripeCheckoutInterval: interval })
        .where(and(eq(workspaces.id, workspace.id), eq(workspaces.stripeCheckoutSessionId, lockId)))
        .returning({ id: workspaces.id });
      if (promoted.length === 0) {
        await stripe.checkout.sessions.expire(reusableSession.id);
        throw new HttpError(409, "This billing checkout was replaced by a newer request. Try again.");
      }
      return { url: reusableSession.url };
    }
    await Promise.all(beebizySessions.map((candidate) => stripe.checkout.sessions.expire(candidate.id)));

    const origin = appOrigin(request);
    const checkoutAttempt = `${workspace.id}_${interval}_${lockId}`;
    const session = await stripe.checkout.sessions.create(
      {
        integration_identifier: integrationIdentifier(checkoutAttempt),
        mode: "subscription",
        customer: customerId,
        client_reference_id: workspace.id,
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        expires_at: Math.floor(Date.now() / 1_000) + 30 * 60,
        metadata: { workspaceId: workspace.id, plan: "solo", billingInterval: interval, priceId: price.id },
        subscription_data: {
          metadata: { workspaceId: workspace.id, plan: "solo", billingInterval: interval, priceId: price.id },
        },
        success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?checkout=cancelled`,
      },
      { idempotencyKey: `beebizy_checkout_${workspace.id}_${lockId}` },
    );

    if (!session.url) throw new HttpError(502, "Stripe did not return a checkout link.");
    const promoted = await db
      .update(workspaces)
      .set({ stripeCheckoutSessionId: session.id, stripeCheckoutInterval: interval })
      .where(and(eq(workspaces.id, workspace.id), eq(workspaces.stripeCheckoutSessionId, lockId)))
      .returning({ id: workspaces.id });
    if (promoted.length === 0) {
      await stripe.checkout.sessions.expire(session.id);
      throw new HttpError(409, "This billing checkout was replaced by a newer request. Try again.");
    }
    return { url: session.url };
  } catch (error) {
    await db
      .update(workspaces)
      .set({ stripeCheckoutSessionId: null, stripeCheckoutInterval: null, stripeCheckoutLockedAt: null })
      .where(and(eq(workspaces.id, workspace.id), eq(workspaces.stripeCheckoutSessionId, lockId)));
    throw error;
  }
}

export async function createPortalSession(ctx: RequestContext, request: Request): Promise<{ url: string }> {
  requireOwner(ctx);
  const workspace = await workspaceFor(ctx);
  if (!workspace.stripeCustomerId) throw new HttpError(409, "This workspace does not have a Stripe subscription yet.");

  const session = await stripeClient().billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${appOrigin(request)}/app/settings`,
  });
  return { url: session.url };
}

function stripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "cancelled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return "past_due";
}

function subscriptionPlan(subscription: Stripe.Subscription): PlanId {
  const plan = subscription.metadata.plan;
  return PLAN_IDS.includes(plan as PlanId) ? (plan as PlanId) : "solo";
}

function isNewStripeEvent(eventCreated: number) {
  return or(isNull(workspaces.stripeLastEventCreated), lt(workspaces.stripeLastEventCreated, eventCreated));
}

function isCurrentOrNewerStripeEvent(eventCreated: number) {
  return or(isNull(workspaces.stripeLastEventCreated), lte(workspaces.stripeLastEventCreated, eventCreated));
}

export async function syncStripeSubscription(subscription: Stripe.Subscription, eventCreated: number): Promise<void> {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) throw new Error(`Stripe subscription ${subscription.id} has no workspaceId metadata.`);

  const nextStatus = stripeStatus(subscription.status);
  const nextPlan = subscriptionPlan(subscription);
  const item = subscription.items.data[0];
  const values = {
    subscriptionStatus: nextStatus,
    subscriptionPlan: nextPlan,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: item?.price.id ?? null,
    subscriptionCurrentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1_000) : null,
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeLastEventCreated: eventCreated,
    updatedAt: new Date(),
  } as const;

  // Failed or incomplete attempts never take a private-pilot workspace out of beta.
  // Once a subscription is cancelled, late update or invoice webhooks for that exact
  // subscription cannot resurrect it.
  if (nextStatus !== "active") {
    const terminalValues = nextStatus === "cancelled"
      ? { stripeTerminalSubscriptionId: subscription.id }
      : {};
    await db.batch([
      db
        .update(workspaces)
        .set({
          stripeCustomerId: values.stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: values.stripePriceId,
          subscriptionCurrentPeriodEnd: values.subscriptionCurrentPeriodEnd,
          subscriptionCancelAtPeriodEnd: values.subscriptionCancelAtPeriodEnd,
          stripeLastEventCreated: eventCreated,
          ...terminalValues,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.subscriptionStatus, "beta"),
            isCurrentOrNewerStripeEvent(eventCreated),
            or(isNull(workspaces.stripeSubscriptionId), eq(workspaces.stripeSubscriptionId, subscription.id)),
          ),
        ),
      db
        .update(workspaces)
        .set({
          ...values,
          ...terminalValues,
          subscriptionCurrentPeriodEnd: nextStatus === "cancelled" ? null : values.subscriptionCurrentPeriodEnd,
          subscriptionCancelAtPeriodEnd: nextStatus === "cancelled" ? false : values.subscriptionCancelAtPeriodEnd,
        })
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.stripeSubscriptionId, subscription.id),
            ne(workspaces.subscriptionStatus, "beta"),
            ne(workspaces.subscriptionStatus, "cancelled"),
            isCurrentOrNewerStripeEvent(eventCreated),
          ),
        ),
    ]);
    return;
  }

  const canActivate = or(
    isNull(workspaces.stripeSubscriptionId),
    and(eq(workspaces.stripeSubscriptionId, subscription.id), ne(workspaces.subscriptionStatus, "cancelled")),
    eq(workspaces.subscriptionStatus, "beta"),
    and(eq(workspaces.subscriptionStatus, "cancelled"), ne(workspaces.stripeSubscriptionId, subscription.id)),
  );
  const activationIsCurrent = and(
    canActivate,
    isNewStripeEvent(eventCreated),
    or(
      isNull(workspaces.stripeTerminalSubscriptionId),
      ne(workspaces.stripeTerminalSubscriptionId, subscription.id),
    ),
  );

  if (nextPlan === "solo") {
    const entitlementLock = db.select({
      locked: sql<number>`pg_advisory_xact_lock(hashtext(${workspaceId}))`,
    }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const [, , , activated] = await db.batch([
      entitlementLock,
      db.delete(eventQuotaSlots).where(eq(eventQuotaSlots.workspaceId, workspaceId)),
      db.insert(eventQuotaSlots).select(
        db
          .select({
            workspaceId: events.workspaceId,
            calendarYear: sql<number>`extract(year from ${events.startsAt})::integer`.as("calendar_year"),
            slot: sql<number>`row_number() over (
              partition by ${events.workspaceId}, extract(year from ${events.startsAt})
              order by ${events.startsAt}, ${events.id}
            )::integer`.as("slot"),
            eventId: events.id,
          })
          .from(events)
          .where(eq(events.workspaceId, workspaceId)),
      ),
      db
        .update(workspaces)
        .set(values)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            activationIsCurrent,
            sql`(
              (select count(*) from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${workspaceId}) +
              (select count(*) from ${workspaceInvites}
                where ${workspaceInvites.workspaceId} = ${workspaceId}
                  and ${workspaceInvites.acceptedAt} is null)
            ) <= ${SOLO_LIMITS.teamMembers}`,
          ),
        )
        .returning({ id: workspaces.id }),
    ]);
    if (activated.length === 0) {
      const [latest] = await db
        .select({
          lastEventCreated: workspaces.stripeLastEventCreated,
          terminalSubscriptionId: workspaces.stripeTerminalSubscriptionId,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (
        (latest?.lastEventCreated !== null && latest?.lastEventCreated !== undefined && latest.lastEventCreated >= eventCreated) ||
        latest?.terminalSubscriptionId === subscription.id
      ) {
        return;
      }
      throw new HttpError(409, "This workspace changed after Checkout opened and no longer qualifies for Solo.");
    }
    return;
  }

  await db
    .update(workspaces)
    .set(values)
    .where(and(eq(workspaces.id, workspaceId), activationIsCurrent));
}

async function releaseCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
  if (workspaceId) {
    await db
      .update(workspaces)
      .set({ stripeCheckoutSessionId: null, stripeCheckoutInterval: null, stripeCheckoutLockedAt: null })
      .where(
        and(
          eq(workspaces.id, workspaceId),
          eq(workspaces.stripeCheckoutSessionId, session.id),
        ),
      );
  }
}

function checkoutSubscriptionId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.subscription === "string") return session.subscription;
  return session.subscription?.id ?? null;
}

async function syncCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventCreated: number,
): Promise<void> {
  const subscriptionId = checkoutSubscriptionId(session);
  if (session.payment_status === "unpaid" || !subscriptionId) return;
  await syncStripeSubscription(await stripe.subscriptions.retrieve(subscriptionId), eventCreated);
  await releaseCheckoutSession(session);
}

async function syncInvoiceSubscription(stripe: Stripe, invoice: Stripe.Invoice, eventCreated: number): Promise<void> {
  const subscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
  if (subscriptionId) await syncStripeSubscription(await stripe.subscriptions.retrieve(subscriptionId), eventCreated);
}

export async function handleStripeWebhook(request: Request): Promise<{ received: true }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "Stripe webhooks are not configured yet.");
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "Missing Stripe signature.");

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    throw new HttpError(400, "Invalid Stripe signature.");
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await syncCheckoutSession(stripe, event.data.object, event.created);
      break;
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const subscriptionId = checkoutSubscriptionId(session);
      if (subscriptionId) {
        await syncStripeSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
      }
      await releaseCheckoutSession(session);
      break;
    }
    case "checkout.session.expired":
      await releaseCheckoutSession(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncStripeSubscription(await stripe.subscriptions.retrieve(event.data.object.id), event.created);
      break;
    case "customer.subscription.deleted":
      await syncStripeSubscription(event.data.object, event.created);
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      await syncInvoiceSubscription(stripe, event.data.object, event.created);
      break;
  }

  return { received: true };
}
