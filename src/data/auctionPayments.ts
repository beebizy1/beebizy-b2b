export type AuctionPaymentMode = "card" | "pay_later" | "unavailable";

export function auctionPaymentMode(input: {
  auctionPayLater: boolean;
  stripeConnectedAccountId: string | null;
}): AuctionPaymentMode {
  if (input.auctionPayLater) return "pay_later";
  return input.stripeConnectedAccountId ? "card" : "unavailable";
}

export function bidderPaymentReady(mode: AuctionPaymentMode, hasPaymentMethod: boolean): boolean {
  return mode === "pay_later" || (mode === "card" && hasPaymentMethod);
}
