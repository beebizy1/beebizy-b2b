import { describe, expect, it } from "vitest";
import {
  BEEBIZY_PLATFORM_FEE_BPS,
  auctionCatalogReadiness,
  calculateProxyBid,
  platformFeeCents,
} from "./commerce";

describe("Beebizy payment fee", () => {
  it("takes exactly two percent in integer cents", () => {
    expect(BEEBIZY_PLATFORM_FEE_BPS).toBe(200);
    expect(platformFeeCents(10_000)).toBe(200);
    expect(platformFeeCents(2_525)).toBe(51);
    expect(platformFeeCents(0)).toBe(0);
  });
});

describe("proxy bidding", () => {
  it("opens at the starting bid for one bidder", () => {
    expect(calculateProxyBid([{ bidderId: "a", maximumAmountCents: 10_000, sequence: 1 }], 2_500, 1_000)).toEqual({
      leaderBidderId: "a",
      currentBidCents: 2_500,
    });
  });

  it("raises only one increment above the second-highest maximum", () => {
    expect(calculateProxyBid([
      { bidderId: "a", maximumAmountCents: 10_000, sequence: 1 },
      { bidderId: "b", maximumAmountCents: 6_000, sequence: 2 },
    ], 2_500, 1_000)).toEqual({ leaderBidderId: "a", currentBidCents: 7_000 });
  });

  it("lets the earliest bidder retain a tied maximum", () => {
    expect(calculateProxyBid([
      { bidderId: "a", maximumAmountCents: 10_000, sequence: 1 },
      { bidderId: "b", maximumAmountCents: 10_000, sequence: 2 },
    ], 2_500, 1_000)).toEqual({ leaderBidderId: "a", currentBidCents: 10_000 });
  });
});

describe("auction catalog readiness", () => {
  it("names every missing field needed before publication", () => {
    expect(auctionCatalogReadiness({
      title: "Dinner",
      description: null,
      imageUrl: null,
      category: null,
      restrictions: null,
      fairMarketValueCents: null,
      startingBidCents: null,
      bidIncrementCents: null,
      closesAt: null,
    })).toEqual(expect.arrayContaining([
      "description",
      "photo",
      "category",
      "fair market value",
      "starting bid",
      "bid increment",
      "closing time",
    ]));
  });
});
