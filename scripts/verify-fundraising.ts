import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import * as s from "../src/server/schema";
import { allocateAuctionBidder } from "../src/server/auctionBidderAllocation";

const suffix = Date.now().toString(36);
const workspaceId = `ws_fundraising_verify_${suffix}`;
const eventId = `evt_fundraising_verify_${suffix}`;

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error(`FAIL  ${label}`);
  console.log(`PASS  ${label}`);
}

try {
  await db.insert(s.workspaces).values({ id: workspaceId, name: "Fundraising verification" });
  await db.insert(s.events).values({
    id: eventId,
    workspaceId,
    title: "Fundraising verification",
    startsAt: new Date(Date.now() + 86_400_000),
    status: "published",
    category: "Fundraiser",
    auctionPublicToken: `auction-${suffix}`,
  });

  const allocations = await Promise.all(Array.from({ length: 12 }, (_, index) => allocateAuctionBidder({
    workspaceId,
    eventId,
    name: `Bidder ${index + 1}`,
    email: `fundraising-verify-${suffix}-${index + 1}@beebizy.com`,
    phone: "408-555-0100",
    householdId: null,
    attendeeId: null,
    paymentMethodId: `pm_verify_${index + 1}`,
    stripeCustomerId: `cus_verify_${index + 1}`,
    autoChargeOptIn: false,
    checkedInAt: null,
    participantType: "remote",
    publicToken: `bidder-token-${suffix}-${index + 1}`,
    updateExisting: false,
  })));
  check("concurrent bidder registration allocates unique paddles", new Set(allocations.map((row) => row.paddleNumber)).size === allocations.length);

  const liveItemId = `auc_live_${suffix}`;
  await db.insert(s.auctionItems).values({
    id: liveItemId, workspaceId, eventId, title: "Live lot", itemType: "live", auctionType: "live",
    quantityAvailable: 1, startingBidCents: 10_000, currentBidCents: 20_000, isPublished: true, status: "open",
  });
  const liveAttempts = await Promise.allSettled([1, 2].map(() => db.execute(sql`
    select record_live_auction_sale_atomic(${workspaceId}, ${eventId}, ${liveItemId}, string_to_array(${String(allocations[0]!.paddleNumber)}, ',')::integer[], ${20_000}, ${"verification"})
  `)));
  check("concurrent live-sale recording settles exactly once", liveAttempts.filter((result) => result.status === "fulfilled").length === 1);
  const [{ liveOrders } = { liveOrders: 0 }] = await db.select({ liveOrders: count() }).from(s.auctionOrders).where(eq(s.auctionOrders.itemId, liveItemId));
  check("live-sale recording creates one order", Number(liveOrders) === 1);

  const buyNowItemId = `auc_buy_${suffix}`;
  await db.insert(s.auctionItems).values({
    id: buyNowItemId, workspaceId, eventId, title: "Buy now lot", itemType: "buy_now", auctionType: "silent",
    buyNowCents: 15_000, startingBidCents: 5_000, isPublished: true, status: "open",
  });
  const buyAttempts = await Promise.allSettled([1, 2].map(() => db.execute(sql`
    select purchase_auction_item_buy_now(${`auction-${suffix}`}, ${allocations[1]!.publicToken}, ${buyNowItemId})
  `)));
  check("concurrent buy-now requests settle exactly once", buyAttempts.filter((result) => result.status === "fulfilled").length === 1);

  await db.insert(s.bidderBills).values({
    id: `bill_${suffix}`, workspaceId, eventId, bidderId: allocations[2]!.id,
    publicToken: `bill-token-${suffix}`, status: "paid", totalCents: 10_000,
  });
  const latePledgeBlocked = await db.insert(s.fundraisingPledges).values({
    id: `pledge_${suffix}`, workspaceId, eventId, bidderId: allocations[2]!.id, amountCents: 10_000,
  }).then(() => false, (error) => {
    const message = `${error instanceof Error ? error.message : String(error)} ${(error as { cause?: { message?: string } })?.cause?.message ?? ""}`;
    if (!/finalized bidder bill/i.test(message)) console.error("Unexpected final-bill guard error:", message);
    return /finalized bidder bill/i.test(message);
  });
  check("a finalized bill blocks uncollectible late pledges", latePledgeBlocked);

  const [{ duplicatePaddles } = { duplicatePaddles: 0 }] = await db.select({ duplicatePaddles: count() }).from(s.auctionBidders).where(and(eq(s.auctionBidders.eventId, eventId), sql`${s.auctionBidders.paddleNumber} is not null`));
  check("all verification bidders persisted", Number(duplicatePaddles) === allocations.length);
} finally {
  await db.delete(s.workspaces).where(eq(s.workspaces.id, workspaceId));
}
