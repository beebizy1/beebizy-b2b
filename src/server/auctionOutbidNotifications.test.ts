import { beforeEach, describe, expect, it, vi } from "vitest";

const dueRows = vi.hoisted(() => [] as unknown[][]);
const insertedValues = vi.hoisted(() => [] as Record<string, unknown>[]);
const updatedValues = vi.hoisted(() => [] as Record<string, unknown>[]);
const notifyAuctionOutbid = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues.push(values);
        return { onConflictDoNothing: vi.fn(async () => undefined) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(async () => dueRows.shift() ?? []) })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updatedValues.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  },
}));
vi.mock("./auth", () => ({ newId: vi.fn(() => "outbid-notification_1") }));
vi.mock("./notify", () => ({ notifyAuctionOutbid }));

const { processDueAuctionOutbidNotifications, queueAuctionOutbidNotification } = await import("./auctionOutbidNotifications");

const input = {
  eventId: "event-1",
  bidId: "bid-1",
  to: "BIDDER@EXAMPLE.COM",
  bidderName: "Bidder One",
  eventTitle: "Spring Gala",
  itemTitle: "Lake Tahoe Stay",
  currentBidCents: 2_800_00,
  auctionUrl: "https://example.com/auction/token",
};

describe("auction outbid notification retries", () => {
  beforeEach(() => {
    dueRows.length = 0;
    insertedValues.length = 0;
    updatedValues.length = 0;
    notifyAuctionOutbid.mockReset();
  });

  it("queues a failed immediate delivery with a normalized address and retry time", async () => {
    const now = new Date("2026-10-22T18:00:00.000Z");
    await queueAuctionOutbidNotification(input, "temporary outage", now);

    expect(insertedValues[0]).toMatchObject({
      id: "outbid-notification_1",
      bidId: "bid-1",
      recipientEmail: "bidder@example.com",
      status: "pending",
      attemptCount: 1,
      lastError: "temporary outage",
    });
    expect(insertedValues[0]?.nextAttemptAt).toEqual(new Date("2026-10-22T18:01:00.000Z"));
  });

  it("marks successful retries sent and leaves failures queued", async () => {
    dueRows.push([
      { id: "notice-1", ...input, recipientEmail: "one@example.com", to: undefined, attemptCount: 1 },
      { id: "notice-2", ...input, bidId: "bid-2", recipientEmail: "two@example.com", to: undefined, attemptCount: 2 },
    ]);
    notifyAuctionOutbid
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "failed", reason: "provider unavailable" });

    const result = await processDueAuctionOutbidNotifications(50, new Date("2026-10-22T18:00:00.000Z"));

    expect(result).toEqual({ processed: 2, sent: 1, queued: 1 });
    expect(updatedValues[0]).toMatchObject({ status: "sent", lastError: null });
    expect(updatedValues[1]).toMatchObject({ attemptCount: 3, lastError: "provider unavailable" });
  });
});
