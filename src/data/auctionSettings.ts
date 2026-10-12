import type { AuctionPageSettings } from "./entities";

export const DEFAULT_AUCTION_PAGE_SETTINGS: AuctionPageSettings = {
  title: "Auction",
  welcomeMessage: "Browse the catalog and support the event.",
  startsAt: null,
  closesAt: null,
  registrationOpen: false,
  catalogPublished: false,
  allowRemoteBidders: true,
  automaticBiddingEnabled: false,
  secondChanceEnabled: false,
  staggeredClosingEnabled: false,
  autoExtendMinutes: 2,
  automaticClosingAlertsEnabled: true,
  closingAlertMinutes: [15, 5],
  broadcastCooldownMinutes: 3,
  bidHistoryPrivacy: "paddle",
};

export function normalizeAuctionPageSettings(value: unknown): AuctionPageSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_AUCTION_PAGE_SETTINGS };
  const input = value as Partial<AuctionPageSettings>;
  return {
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : DEFAULT_AUCTION_PAGE_SETTINGS.title,
    welcomeMessage: typeof input.welcomeMessage === "string" ? input.welcomeMessage.trim().slice(0, 2_000) : DEFAULT_AUCTION_PAGE_SETTINGS.welcomeMessage,
    startsAt: typeof input.startsAt === "string" ? input.startsAt : null,
    closesAt: typeof input.closesAt === "string" ? input.closesAt : null,
    registrationOpen: input.registrationOpen === true,
    catalogPublished: input.catalogPublished === true,
    allowRemoteBidders: input.allowRemoteBidders !== false,
    automaticBiddingEnabled: input.automaticBiddingEnabled === true,
    secondChanceEnabled: input.secondChanceEnabled === true,
    staggeredClosingEnabled: input.staggeredClosingEnabled === true,
    autoExtendMinutes: Number.isInteger(input.autoExtendMinutes)
      ? Math.max(0, Math.min(60, input.autoExtendMinutes!))
      : 2,
    automaticClosingAlertsEnabled: input.automaticClosingAlertsEnabled !== false,
    closingAlertMinutes: Array.isArray(input.closingAlertMinutes)
      ? [...new Set(input.closingAlertMinutes.filter((minutes) => Number.isInteger(minutes) && minutes >= 1 && minutes <= 120))].sort((left, right) => right - left).slice(0, 5)
      : [15, 5],
    broadcastCooldownMinutes: Number.isInteger(input.broadcastCooldownMinutes)
      ? Math.max(1, Math.min(60, input.broadcastCooldownMinutes!))
      : 3,
    bidHistoryPrivacy: input.bidHistoryPrivacy === "initials" ? "initials" : "paddle",
  };
}
