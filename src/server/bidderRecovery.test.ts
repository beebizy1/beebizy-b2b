import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("./notify", () => ({ sendEmail: vi.fn().mockResolvedValue({ status: "sent" }) }));

const { waitUntil } = await import("@vercel/functions");
const { sendEmail } = await import("./notify");
const { deferBidderRecoveryEmail } = await import("./bidderRecovery");

describe("bidder recovery email", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defers the private link so the public response does not reveal bidder existence through provider timing", () => {
    deferBidderRecoveryEmail({
      auctionToken: "auction-token",
      bidderId: "bidder-1",
      bidderName: "Ada",
      bidderToken: "private-token",
      email: "ada@example.com",
      eventTitle: "School Gala",
      paddleNumber: 104,
      now: new Date("2026-10-29T19:30:00.000Z"),
    });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "ada@example.com",
      idempotencyKey: "auction-bidder-access-bidder-1-2026-10-29T19",
      subject: "Your private bidder link - School Gala",
      text: expect.stringContaining("/auction/auction-token?bidder=private-token"),
    }));
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
