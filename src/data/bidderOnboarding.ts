import { bidderPaymentReady, type AuctionPaymentMode } from "./auctionPayments";

export interface BidderRegistrationInput {
  name: string;
  email: string;
  phone: string;
}
export type BidderSetupStage = "registration" | "loading" | "wallet" | "ready" | "unavailable";

export function validBidderEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function bidderRegistrationReady(input: BidderRegistrationInput): boolean {
  return Boolean(
    input.name.trim()
    && validBidderEmail(input.email)
    && input.phone.replace(/\D/g, "").length >= 10,
  );
}

export function bidderSetupStage(input: {
  bidderToken: string;
  profileLoading: boolean;
  hasPaymentMethod: boolean;
  paymentMode: AuctionPaymentMode;
}): BidderSetupStage {
  if (!input.bidderToken) return "registration";
  if (input.profileLoading) return "loading";
  if (input.paymentMode === "unavailable") return "unavailable";
  return bidderPaymentReady(input.paymentMode, input.hasPaymentMethod) ? "ready" : "wallet";
}

