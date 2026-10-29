import { describe, expect, it } from "vitest";
import { auctionPaymentMode, bidderPaymentReady } from "./auctionPayments";

describe("auction payment policy", () => {
  it("lets one explicitly configured event collect payment later", () => {
    expect(auctionPaymentMode({ auctionPayLater: true, stripeConnectedAccountId: null })).toBe("pay_later");
    expect(bidderPaymentReady("pay_later", false)).toBe(true);
  });

  it("keeps card setup for connected events and blocks ordinary unconnected events", () => {
    expect(auctionPaymentMode({ auctionPayLater: false, stripeConnectedAccountId: "acct_school" })).toBe("card");
    expect(auctionPaymentMode({ auctionPayLater: false, stripeConnectedAccountId: null })).toBe("unavailable");
    expect(bidderPaymentReady("card", false)).toBe(false);
    expect(bidderPaymentReady("card", true)).toBe(true);
    expect(bidderPaymentReady("unavailable", true)).toBe(false);
  });
});
