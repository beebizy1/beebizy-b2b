import { describe, expect, it } from "vitest";
import { bidderRegistrationReady, bidderSetupStage } from "./bidderOnboarding";

describe("bidder onboarding", () => {
  it("keeps registration focused on three contact fields", () => {
    expect(bidderRegistrationReady({ name: "Ada Lovelace", email: "ada@example.com", phone: "4155550123" })).toBe(true);
    expect(bidderRegistrationReady({ name: "Ada Lovelace", email: "not-an-email", phone: "4155550123" })).toBe(false);
    expect(bidderRegistrationReady({ name: "Ada Lovelace", email: "ada@example.com", phone: "555" })).toBe(false);
  });

  it("moves from registration to secure payment only after bidder creation", () => {
    expect(bidderSetupStage({ bidderToken: "", profileLoading: false, hasPaymentMethod: false, paymentMode: "card" })).toBe("registration");
    expect(bidderSetupStage({ bidderToken: "bidder-token", profileLoading: true, hasPaymentMethod: false, paymentMode: "card" })).toBe("loading");
    expect(bidderSetupStage({ bidderToken: "bidder-token", profileLoading: false, hasPaymentMethod: false, paymentMode: "card" })).toBe("wallet");
    expect(bidderSetupStage({ bidderToken: "bidder-token", profileLoading: false, hasPaymentMethod: true, paymentMode: "card" })).toBe("ready");
    expect(bidderSetupStage({ bidderToken: "bidder-token", profileLoading: false, hasPaymentMethod: false, paymentMode: "pay_later" })).toBe("ready");
    expect(bidderSetupStage({ bidderToken: "bidder-token", profileLoading: false, hasPaymentMethod: false, paymentMode: "unavailable" })).toBe("unavailable");
  });
});
