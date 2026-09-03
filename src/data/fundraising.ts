/**
 * Fundraising arithmetic.
 *
 * Separate from the screen because the tax rule is the one piece of real judgement in
 * the fundraising tab, and it should be testable without rendering anything.
 */

import type { Cents } from "./money";

/**
 * The tax-deductible portion of a winning auction bid.
 *
 * A charitable auction bid is only a donation to the extent it exceeds what the bidder
 * received. Bid at or below fair market value and you have bought goods, not given —
 * hence the floor at zero rather than a negative "deduction".
 *
 * Returns null when either figure is missing: an unknown fair market value means the
 * deductible amount is unknown, which is different from it being zero.
 */
export function taxDeductibleCents(item: {
  currentBidCents: Cents | null;
  fairMarketValueCents: Cents | null;
}): Cents | null {
  if (item.fairMarketValueCents == null || item.currentBidCents == null) return null;
  return Math.max(0, item.currentBidCents - item.fairMarketValueCents);
}

/**
 * How much to raise the ask by, given where the bidding currently stands.
 *
 * A flat increment is wrong at both ends: ten-unit steps on a twenty-thousand lot take
 * all night, and five-hundred-unit steps on a sixty-unit lot kill the bidding. The bands
 * mirror how an auctioneer actually calls a room. Units are the workspace currency.
 */
export function bidIncrementCents(currentCents: Cents | null | undefined): Cents {
  const current = currentCents ?? 0;
  if (current >= 1_000_000) return 50_000;
  if (current >= 100_000) return 10_000;
  if (current >= 10_000) return 2_500;
  return 1_000;
}
