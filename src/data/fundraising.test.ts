import { describe, expect, it } from "vitest";
import {
  bidIncrementCents,
  deductibleAmountCents,
  coveredFeesCents,
  isFundraisingBroadcastAudience,
  suggestedStartingBidCents,
  taxDeductibleCents,
} from "./fundraising";

describe("taxDeductibleCents", () => {
  it("is the excess of the winning bid over fair market value", () => {
    expect(taxDeductibleCents({ currentBidCents: 120_000, fairMarketValueCents: 80_000 })).toBe(40_000);
  });

  it("floors at zero when the bid is at or below fair market value", () => {
    expect(taxDeductibleCents({ currentBidCents: 80_000, fairMarketValueCents: 80_000 })).toBe(0);
    // A bargain is not a donation, and it is certainly not a negative one.
    expect(taxDeductibleCents({ currentBidCents: 50_000, fairMarketValueCents: 80_000 })).toBe(0);
  });

  it("is unknown rather than zero when either figure is missing", () => {
    expect(taxDeductibleCents({ currentBidCents: 120_000, fairMarketValueCents: null })).toBeNull();
    expect(taxDeductibleCents({ currentBidCents: null, fairMarketValueCents: 80_000 })).toBeNull();
    expect(taxDeductibleCents({ currentBidCents: null, fairMarketValueCents: null })).toBeNull();
  });

  it("treats a zero fair market value as fully deductible", () => {
    expect(taxDeductibleCents({ currentBidCents: 120_000, fairMarketValueCents: 0 })).toBe(120_000);
  });
});

describe("bidIncrementCents", () => {
  it("scales the step with the size of the bid", () => {
    expect(bidIncrementCents(0)).toBe(500);
    expect(bidIncrementCents(5_000)).toBe(500);
    expect(bidIncrementCents(50_000)).toBe(2_500); // $500 → $25
    expect(bidIncrementCents(500_000)).toBe(10_000); // $5,000 → $100
    expect(bidIncrementCents(5_000_000)).toBe(10_000);
  });

  it("steps up exactly at each band boundary", () => {
    expect(bidIncrementCents(9_999)).toBe(500);
    expect(bidIncrementCents(10_000)).toBe(1_000);
    expect(bidIncrementCents(49_999)).toBe(1_000);
    expect(bidIncrementCents(50_000)).toBe(2_500);
    expect(bidIncrementCents(99_999)).toBe(2_500);
    expect(bidIncrementCents(100_000)).toBe(5_000);
    expect(bidIncrementCents(499_999)).toBe(5_000);
    expect(bidIncrementCents(500_000)).toBe(10_000);
  });

  it("treats a lot with no bid yet as the lowest band", () => {
    expect(bidIncrementCents(null)).toBe(500);
    expect(bidIncrementCents(undefined)).toBe(500);
  });
});

describe("auction UX spec arithmetic", () => {
  it("accepts only supported fundraising broadcast audiences", () => {
    expect(isFundraisingBroadcastAudience("watchers")).toBe(true);
    expect(isFundraisingBroadcastAudience("grade:5")).toBe(true);
    expect(isFundraisingBroadcastAudience("watcehrs")).toBe(false);
    expect(isFundraisingBroadcastAudience("grade:College")).toBe(false);
  });

  it("uses Laila's tiered bid increments", () => {
    expect(bidIncrementCents(9_999)).toBe(500);
    expect(bidIncrementCents(10_000)).toBe(1_000);
    expect(bidIncrementCents(49_999)).toBe(1_000);
    expect(bidIncrementCents(50_000)).toBe(2_500);
    expect(bidIncrementCents(99_999)).toBe(2_500);
    expect(bidIncrementCents(100_000)).toBe(5_000);
    expect(bidIncrementCents(499_999)).toBe(5_000);
    expect(bidIncrementCents(500_000)).toBe(10_000);
  });

  it("suggests forty percent of estimated value without inventing FMV", () => {
    expect(suggestedStartingBidCents(125_00)).toBe(50_00);
    expect(suggestedStartingBidCents(null)).toBeNull();
  });

  it("calculates deductible amounts by transaction type", () => {
    expect(deductibleAmountCents({ kind: "auction", amountCents: 1_500_00, fairMarketValueCents: 1_200_00 })).toBe(300_00);
    expect(deductibleAmountCents({ kind: "auction", amountCents: 900_00, fairMarketValueCents: 1_200_00 })).toBe(0);
    expect(deductibleAmountCents({ kind: "ticket", amountCents: 250_00, fairMarketValueCents: 100_00 })).toBe(150_00);
    expect(deductibleAmountCents({ kind: "ticket", amountCents: 250_00, fairMarketValueCents: 100_00, benefitsDeclined: true })).toBe(250_00);
    expect(deductibleAmountCents({ kind: "donation", amountCents: 250_00, fairMarketValueCents: null })).toBe(250_00);
    expect(deductibleAmountCents({ kind: "raffle", amountCents: 250_00, fairMarketValueCents: null })).toBe(0);
  });

  it("grosses up covered fees so the school nets the original amount", () => {
    const fee = coveredFeesCents(10_000);
    const gross = 10_000 + fee;
    const processing = Math.round(gross * 0.029) + 30;
    const platform = Math.round(gross * 0.02);
    expect(gross - processing - platform).toBeGreaterThanOrEqual(10_000);
    expect(gross - processing - platform).toBeLessThanOrEqual(10_001);
  });
});
