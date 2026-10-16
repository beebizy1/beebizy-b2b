import type { Cents } from "./money";

export const BEEBIZY_PLATFORM_FEE_BPS = 200;

/** Stripe application fees use integer cents. Beebizy receives exactly 2% after rounding. */
export function platformFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.round((amountCents * BEEBIZY_PLATFORM_FEE_BPS) / 10_000);
}

export interface ProxyBidMaximum {
  bidderId: string;
  maximumAmountCents: Cents;
  /** Earlier submissions win an exact maximum tie. */
  sequence: number;
}

export function calculateProxyBid(
  maximums: ProxyBidMaximum[],
  startingBidCents: Cents,
  incrementCents: Cents,
): { leaderBidderId: string | null; currentBidCents: Cents | null } {
  const ranked = maximums
    .filter((bid) => Number.isInteger(bid.maximumAmountCents) && bid.maximumAmountCents >= startingBidCents)
    .sort((left, right) => right.maximumAmountCents - left.maximumAmountCents || left.sequence - right.sequence);
  const leader = ranked[0];
  if (!leader) return { leaderBidderId: null, currentBidCents: null };
  const runnerUp = ranked[1];
  const currentBidCents = runnerUp
    ? Math.min(leader.maximumAmountCents, Math.max(startingBidCents, runnerUp.maximumAmountCents + incrementCents))
    : startingBidCents;
  return { leaderBidderId: leader.bidderId, currentBidCents };
}

export interface AuctionCatalogCandidate {
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  restrictions: string | null;
  fairMarketValueCents: Cents | null;
  startingBidCents: Cents | null;
  bidIncrementCents: Cents | null;
  closesAt: string | null;
}

/** Publication gate used by donor intake, organizer review, and the public catalog. */
export function auctionCatalogReadiness(item: AuctionCatalogCandidate): string[] {
  const missing: string[] = [];
  if (!item.title.trim()) missing.push("title");
  if (!item.description?.trim()) missing.push("description");
  if (!item.imageUrl?.trim()) missing.push("photo");
  if (!item.category?.trim()) missing.push("category");
  if (item.fairMarketValueCents == null) missing.push("fair market value");
  if (item.startingBidCents == null) missing.push("starting bid");
  if (item.bidIncrementCents == null) missing.push("bid increment");
  if (!item.closesAt) missing.push("closing time");
  return missing;
}
