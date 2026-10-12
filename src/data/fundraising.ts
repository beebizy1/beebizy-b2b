/**
 * Fundraising arithmetic.
 *
 * Separate from the screen because the tax rule is the one piece of real judgement in
 * the fundraising tab, and it should be testable without rendering anything.
 */

import type { Cents } from "./money";
import { SCHOOL_GRADES, type FundraisingBroadcastAudience } from "./entities.ts";

const STATIC_BROADCAST_AUDIENCES = new Set(["all", "remote", "in_room", "bidders", "outbid", "watchers"]);

export function isFundraisingBroadcastAudience(value: string): value is FundraisingBroadcastAudience {
  return STATIC_BROADCAST_AUDIENCES.has(value) || (value.startsWith("grade:") && SCHOOL_GRADES.includes(value.slice("grade:".length) as (typeof SCHOOL_GRADES)[number]));
}

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
  if (current >= 500_000) return 10_000;
  if (current >= 100_000) return 5_000;
  if (current >= 50_000) return 2_500;
  if (current >= 10_000) return 1_000;
  return 500;
}

export function suggestedStartingBidCents(estimatedValueCents: Cents | null): Cents | null {
  return estimatedValueCents == null ? null : Math.round(estimatedValueCents * 0.4);
}

export type DeductibleTransactionKind = "auction" | "ticket" | "donation" | "fund-a-need" | "sponsorship" | "raffle";

export function deductibleAmountCents(input: {
  kind: DeductibleTransactionKind;
  amountCents: Cents;
  fairMarketValueCents: Cents | null;
  benefitsDeclined?: boolean;
}): Cents {
  if (input.kind === "raffle") return 0;
  if (input.kind === "donation" || input.kind === "fund-a-need" || input.benefitsDeclined) return input.amountCents;
  return Math.max(0, input.amountCents - (input.fairMarketValueCents ?? 0));
}

/** Gross-up so the organization nets the intended gift after 2.9% + 30¢ and Beebizy 2%. */
export function coveredFeesCents(baseAmountCents: Cents): Cents {
  if (baseAmountCents <= 0) return 0;
  return Math.ceil((baseAmountCents + 30) / (1 - 0.049)) - baseAmountCents;
}
