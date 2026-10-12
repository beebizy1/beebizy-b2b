import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import * as s from "../src/server/schema";
import { allocateAuctionBidder } from "../src/server/auctionBidderAllocation";
import { raffle, tickets } from "../src/server/repos";
import { fundraisingReports } from "../src/server/fundraisingUx";

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
  const context = { userId: "fundraising-verifier", email: "hello@beebizy.com", workspaceId, role: "owner" as const };

  const unconfirmedZeroFmvBlocked = await tickets.create(context, eventId, {
    name: "Admission",
    priceCents: 5_000,
    fairMarketValueCents: 0,
    quantityTotal: 100,
  }).then(() => false, (error) => error instanceof Error && /confirm.*no goods or services/i.test(error.message));
  check("paid tickets with zero FMV require an explicit confirmation", unconfirmedZeroFmvBlocked);
  const confirmedTicket = await tickets.create(context, eventId, {
    name: "Admission",
    priceCents: 5_000,
    fairMarketValueCents: 0,
    fmvZeroConfirmed: true,
    quantityTotal: 100,
  });
  check("confirmed zero-FMV paid tickets persist the tax safeguard", confirmedTicket.fmvZeroConfirmed === true);

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
    paymentMethod: "Apple Pay", payoutAvailableAt: new Date(Date.now() + 86_400_000),
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

  const firstBroadcastId = `broadcast_first_${suffix}`;
  const secondBroadcastId = `broadcast_second_${suffix}`;
  await db.insert(s.fundraisingBroadcasts).values([
    { id: firstBroadcastId, workspaceId, eventId, sentBy: context.userId, message: "First", channels: ["email"] },
    { id: secondBroadcastId, workspaceId, eventId, sentBy: context.userId, message: "Second", channels: ["email"] },
  ]);
  const claimedFirst = await db.execute<{ bidder_id: string }>(sql`
    select bidder_id from claim_fundraising_broadcast_recipients(
      ${workspaceId}, ${eventId}, ${firstBroadcastId},
      string_to_array(${allocations.slice(0, 2).map((allocation) => allocation.id).join(",")}, ',')::text[],
      ${"email"}
    )
  `);
  const claimedSecond = await db.execute<{ bidder_id: string }>(sql`
    select bidder_id from claim_fundraising_broadcast_recipients(
      ${workspaceId}, ${eventId}, ${secondBroadcastId},
      string_to_array(${allocations.slice(0, 2).map((allocation) => allocation.id).join(",")}, ',')::text[],
      ${"email"}
    )
  `);
  check("the first blast claims each eligible bidder", claimedFirst.rows.length === 2);
  check("the three-minute guard blocks a second blast per bidder", claimedSecond.rows.length === 0);

  const receiptId = `receipt_verify_${suffix}`;
  await db.insert(s.fundraisingReceipts).values({
    id: receiptId, workspaceId, eventId, type: "contribution", receiptNumber: `VERIFY-${suffix}`,
    publicToken: `receipt-token-${suffix}`, payerName: "Verification Donor", amountCents: 100,
    fairMarketValueCents: 0, deductibleCents: 100, lineItems: [],
  });
  const directReceiptDeleteBlocked = await db.delete(s.fundraisingReceipts).where(eq(s.fundraisingReceipts.id, receiptId))
    .then(() => false, (error) => `${error instanceof Error ? error.message : String(error)} ${(error as { cause?: { message?: string } })?.cause?.message ?? ""}`.includes("receipts are immutable"));
  check("direct receipt deletion remains blocked", directReceiptDeleteBlocked);

  const householdId = `household_${suffix}`;
  await db.insert(s.households).values({ id: householdId, workspaceId, displayName: "Verification Household", primaryEmail: `household-${suffix}@beebizy.com` });
  await db.insert(s.fundraisingReceipts).values([
    { id: `receipt_household_a_${suffix}`, workspaceId, eventId, householdId, type: "contribution", receiptNumber: `VERIFY-A-${suffix}`, publicToken: `receipt-household-a-${suffix}`, payerName: "First Adult", payerEmail: `first-${suffix}@beebizy.com`, amountCents: 10_000, fairMarketValueCents: 0, deductibleCents: 10_000, lineItems: [] },
    { id: `receipt_household_b_${suffix}`, workspaceId, eventId, householdId, type: "contribution", receiptNumber: `VERIFY-B-${suffix}`, publicToken: `receipt-household-b-${suffix}`, payerName: "Second Adult", payerEmail: `second-${suffix}@beebizy.com`, amountCents: 20_000, fairMarketValueCents: 0, deductibleCents: 20_000, lineItems: [] },
  ]);
  const reports = await fundraisingReports(context, eventId);
  const householdStatements = reports.yearEndStatements.filter((statement) => statement.householdId === householdId);
  check("year-end giving statements aggregate once per household", householdStatements.length === 1);
  check("the household statement uses the household address and combined total", householdStatements[0]?.payerEmail === `household-${suffix}@beebizy.com` && householdStatements[0]?.amountCents === 30_000);
  check("payment reconciliation reports method and payout date", reports.payments.some((payment) => payment.paymentMethod === "Apple Pay" && typeof payment.payoutDate === "string"));

  await db.update(s.workspaces).set({ raffleEnabled: true, raffleRegistrationConfirmed: true }).where(eq(s.workspaces.id, workspaceId));
  const raffleItem = await raffle.create(context, eventId, {
    name: "Verification prize",
    ticketPriceCents: 100,
    fairMarketValueCents: 100_000,
    totalTickets: 100,
  });
  await db.insert(s.raffleTickets).values({
    id: `raffle_ticket_${suffix}`,
    workspaceId,
    eventId,
    raffleItemId: raffleItem.id,
    buyerName: "Verification Winner",
    buyerEmail: `raffle-${suffix}@beebizy.com`,
    quantity: 1,
  });
  const drawnRaffle = await raffle.draw(context, eventId, raffleItem.id);
  check("high-value raffle prizes trigger W-2G review", drawnRaffle.w2gReviewRequired === true);
  check("taxpayer ID collection is tracked without storing an ID", drawnRaffle.taxpayerIdCollectionStatus === "required");
  const collectedRaffle = await raffle.update(context, eventId, raffleItem.id, { taxpayerIdCollectionStatus: "collected" });
  check("secure taxpayer-ID collection records evidence", collectedRaffle.taxpayerIdCollectionStatus === "collected" && Boolean(collectedRaffle.taxpayerIdCollectedAt) && collectedRaffle.taxpayerIdCollectedBy === context.userId);
  const [{ taxTasks } = { taxTasks: 0 }] = await db.select({ taxTasks: count() }).from(s.checklistItems).where(and(
    eq(s.checklistItems.eventId, eventId),
    sql`${s.checklistItems.title} like 'Review W-2G reporting%'`,
  ));
  check("raffle tax review creates an operational checklist task", Number(taxTasks) === 1);
} finally {
  await db.delete(s.workspaces).where(eq(s.workspaces.id, workspaceId));
  const [remainingWorkspace] = await db.select({ id: s.workspaces.id }).from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).limit(1);
  check("workspace cleanup may cascade immutable receipts", remainingWorkspace == null);
}
