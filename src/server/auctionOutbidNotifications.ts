import { and, asc, eq, lte } from "drizzle-orm";
import { memberRoleNotificationRetryAt } from "../data/memberRoleNotifications.ts";
import { newId } from "./auth.ts";
import { db } from "./db.ts";
import { notifyAuctionOutbid } from "./notify.ts";
import * as s from "./schema.ts";

export interface AuctionOutbidNotificationInput {
  eventId: string;
  bidId: string;
  to: string;
  bidderName: string;
  eventTitle: string;
  itemTitle: string;
  currentBidCents: number;
  auctionUrl: string;
}

/** Persists a failed immediate delivery. The provider idempotency key makes retries safe. */
export async function queueAuctionOutbidNotification(input: AuctionOutbidNotificationInput, reason: string, now = new Date()): Promise<void> {
  await db.insert(s.auctionOutbidNotifications).values({
    id: newId("outbid-notification"),
    eventId: input.eventId,
    bidId: input.bidId,
    recipientEmail: input.to.toLowerCase(),
    bidderName: input.bidderName,
    eventTitle: input.eventTitle,
    itemTitle: input.itemTitle,
    currentBidCents: input.currentBidCents,
    auctionUrl: input.auctionUrl,
    status: "pending",
    attemptCount: 1,
    nextAttemptAt: memberRoleNotificationRetryAt(1, now),
    lastError: reason.slice(0, 1_000),
    updatedAt: now,
  }).onConflictDoNothing();
}

/** Retries due outbid emails in bounded batches; failed rows stay pending indefinitely. */
export async function processDueAuctionOutbidNotifications(limit = 50, now = new Date()): Promise<{ processed: number; sent: number; queued: number }> {
  const rows = await db.select().from(s.auctionOutbidNotifications).where(and(
    eq(s.auctionOutbidNotifications.status, "pending"),
    lte(s.auctionOutbidNotifications.nextAttemptAt, now),
  )).orderBy(asc(s.auctionOutbidNotifications.nextAttemptAt)).limit(Math.max(1, Math.min(100, limit)));

  let sent = 0;
  let queued = 0;
  for (const row of rows) {
    const outcome = await notifyAuctionOutbid({
      bidId: row.bidId,
      to: row.recipientEmail,
      bidderName: row.bidderName,
      eventTitle: row.eventTitle,
      itemTitle: row.itemTitle,
      currentBidCents: row.currentBidCents,
      auctionUrl: row.auctionUrl,
    });
    if (outcome.status === "sent") {
      await db.update(s.auctionOutbidNotifications).set({
        status: "sent",
        sentAt: now,
        lastError: null,
        updatedAt: now,
      }).where(and(eq(s.auctionOutbidNotifications.id, row.id), eq(s.auctionOutbidNotifications.status, "pending")));
      sent += 1;
      continue;
    }
    const attemptCount = row.attemptCount + 1;
    await db.update(s.auctionOutbidNotifications).set({
      attemptCount,
      nextAttemptAt: memberRoleNotificationRetryAt(attemptCount, now),
      lastError: outcome.reason.slice(0, 1_000),
      updatedAt: now,
    }).where(and(eq(s.auctionOutbidNotifications.id, row.id), eq(s.auctionOutbidNotifications.status, "pending")));
    queued += 1;
  }
  return { processed: rows.length, sent, queued };
}
