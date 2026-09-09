/**
 * End-to-end Stripe sandbox verification. No Checkout page is completed and no payment
 * method is attached, so this script cannot create a charge.
 *
 * Run with: node --env-file=.env.local --import tsx scripts/verify-billing.ts
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createCheckoutSession, syncStripeSubscription } from "../src/server/billing";
import { db } from "../src/server/db";
import * as repos from "../src/server/repos";
import { workspaceMembers, workspaces } from "../src/server/schema";
import type { BillingInterval } from "../src/data/plans";
import type { RequestContext } from "../src/server/auth";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");
if (!secretKey.startsWith("sk_test_")) throw new Error("This verification requires a Stripe test key.");

const stripe = new Stripe(secretKey);
const suffix = Date.now().toString(36);
const workspaceId = `ws_billing_verify_${suffix}`;
const ctx: RequestContext = {
  userId: `user_billing_verify_${suffix}`,
  email: "billing-verify@beebizy.com",
  workspaceId,
  role: "owner",
  access: {
    status: "beta",
    plan: null,
    betaStartedAt: new Date().toISOString(),
    betaEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  },
};
const request = new Request("https://beebizy-studio-preview.vercel.app/api/billing/checkout", { method: "POST" });

let customerId: string | null = null;

async function sessionInterval(url: string): Promise<BillingInterval | null> {
  const id = url.match(/cs_(?:test_)?[A-Za-z0-9]+/)?.[0];
  if (!id) return null;
  const session = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items.data.price"] });
  const price = session.line_items?.data[0]?.price;
  return price?.recurring?.interval === "month" || price?.recurring?.interval === "year"
    ? price.recurring.interval
    : null;
}

async function sessionPriceId(url: string): Promise<string | null> {
  const id = url.match(/cs_(?:test_)?[A-Za-z0-9]+/)?.[0];
  if (!id) return null;
  const session = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items.data.price"] });
  return session.line_items?.data[0]?.price?.id ?? null;
}

function subscriptionFixture(
  id: string,
  status: Stripe.Subscription.Status,
  stripeCustomerId: string,
  priceId: string,
): Stripe.Subscription {
  return {
    id,
    status,
    customer: stripeCustomerId,
    metadata: { workspaceId, plan: "solo" },
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: priceId }, current_period_end: Math.floor(Date.now() / 1_000) + 86_400 }],
    },
  } as Stripe.Subscription;
}

try {
  await db.insert(workspaces).values({ id: workspaceId, name: "Billing verification" });
  await db.insert(workspaceMembers).values({ workspaceId, userId: ctx.userId, role: "owner" });

  await db.insert(workspaceMembers).values({ workspaceId, userId: `${ctx.userId}_extra`, role: "member" });
  const extraSeat = await createCheckoutSession(ctx, "month", request).then(() => false, (error) => /one user/i.test(String(error)));
  if (!extraSeat) throw new Error("Solo Checkout did not reject an extra workspace member.");
  await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, `${ctx.userId}_extra`));

  const eventDate = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 5, 1)).toISOString();
  const eventA = await repos.events.create(ctx, { title: "Checkout event A", date: eventDate, category: "Test" });
  const eventB = await repos.events.create(ctx, { title: "Checkout event B", date: eventDate, category: "Test" });
  const eventOverage = await createCheckoutSession(ctx, "month", request).then(
    () => false,
    (error) => /one event per calendar year/i.test(String(error)),
  );
  if (!eventOverage) throw new Error("Solo Checkout did not reject an existing annual event overage.");
  await repos.events.remove(ctx, eventB.id);

  const concurrent = await Promise.allSettled([
    createCheckoutSession(ctx, "month", request),
    createCheckoutSession(ctx, "year", request),
  ]);
  const fulfilled = concurrent.filter((result): result is PromiseFulfilledResult<{ url: string }> => result.status === "fulfilled");
  const rejected = concurrent.filter((result) => result.status === "rejected");
  if (fulfilled.length !== 1 || rejected.length !== 1) throw new Error("Concurrent checkout lock did not allow exactly one session.");

  const firstInterval = await sessionInterval(fulfilled[0]!.value.url);
  if (!firstInterval) throw new Error("The first Checkout session has no recurring Solo price.");
  const otherInterval: BillingInterval = firstInterval === "month" ? "year" : "month";
  const switched = await createCheckoutSession(ctx, otherInterval, request);
  if ((await sessionInterval(switched.url)) !== otherInterval) throw new Error("Switching billing interval returned the wrong Checkout price.");
  const reused = await createCheckoutSession(ctx, otherInterval, request);
  if (reused.url !== switched.url) throw new Error("Repeated checkout did not reuse the open session.");

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  customerId = workspace?.stripeCustomerId ?? null;
  if (!customerId) throw new Error("Checkout verification did not persist the Stripe customer.");
  const priceId = await sessionPriceId(switched.url);
  if (!priceId) throw new Error("The verified Checkout session did not contain a Stripe price.");
  const subscriptionId = `sub_verify_${suffix}`;
  const eventTime = Math.floor(Date.now() / 1_000);
  const subscription = (status: Stripe.Subscription.Status) =>
    subscriptionFixture(subscriptionId, status, customerId!, priceId);

  await syncStripeSubscription(subscription("past_due"), eventTime);
  let [access] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (access?.subscriptionStatus !== "beta") throw new Error("A failed payment removed private-pilot access.");
  await syncStripeSubscription(subscription("active"), eventTime - 1);
  [access] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (access?.subscriptionStatus !== "beta") throw new Error("An older active event overrode a newer payment failure.");
  await syncStripeSubscription(subscription("active"), eventTime + 1);
  await syncStripeSubscription(subscription("canceled"), eventTime + 1);
  await syncStripeSubscription(subscription("active"), eventTime + 1);
  await syncStripeSubscription(subscription("active"), eventTime + 2);
  [access] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (access?.subscriptionStatus !== "cancelled") {
    throw new Error("A same-second terminal event lost precedence or a late active event restored cancellation.");
  }

  console.log("PASS  concurrent Checkout requests create only one session");
  console.log("PASS  Solo Checkout rejects extra seats and annual event overages");
  console.log("PASS  switching interval returns the requested recurring price");
  console.log("PASS  repeated Checkout reuses the existing open session");
  console.log("PASS  sandbox verification completed without a payment method or charge");
  console.log("PASS  pilot access survives failed payment and same-second terminal events keep precedence");
  await repos.events.remove(ctx, eventA.id);
} finally {
  if (!customerId) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    customerId = workspace?.stripeCustomerId ?? null;
  }
  if (customerId) {
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
    await Promise.all(sessions.data.map((session) => stripe.checkout.sessions.expire(session.id)));
    await stripe.customers.del(customerId);
  }
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}
