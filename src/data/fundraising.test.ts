import { describe, expect, it } from "vitest";
import { bidIncrementCents, taxDeductibleCents } from "./fundraising";

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
    expect(bidIncrementCents(0)).toBe(1_000); // $0 → $10
    expect(bidIncrementCents(5_000)).toBe(1_000); // $50 → $10
    expect(bidIncrementCents(50_000)).toBe(2_500); // $500 → $25
    expect(bidIncrementCents(500_000)).toBe(10_000); // $5,000 → $100
    expect(bidIncrementCents(5_000_000)).toBe(50_000); // $50,000 → $500
  });

  it("steps up exactly at each band boundary", () => {
    expect(bidIncrementCents(9_999)).toBe(1_000);
    expect(bidIncrementCents(10_000)).toBe(2_500);
    expect(bidIncrementCents(99_999)).toBe(2_500);
    expect(bidIncrementCents(100_000)).toBe(10_000);
    expect(bidIncrementCents(999_999)).toBe(10_000);
    expect(bidIncrementCents(1_000_000)).toBe(50_000);
  });

  it("treats a lot with no bid yet as the lowest band", () => {
    expect(bidIncrementCents(null)).toBe(1_000);
    expect(bidIncrementCents(undefined)).toBe(1_000);
  });
});
