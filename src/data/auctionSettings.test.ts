import { describe, expect, it } from "vitest";
import { normalizeAuctionPageSettings } from "./auctionSettings";

describe("auction closing alert settings", () => {
  it("defaults to enabled 15- and 5-minute alerts with a three-minute cooldown", () => {
    const settings = normalizeAuctionPageSettings(null);
    expect(settings.automaticClosingAlertsEnabled).toBe(true);
    expect(settings.closingAlertMinutes).toEqual([15, 5]);
    expect(settings.broadcastCooldownMinutes).toBe(3);
  });

  it("normalizes school-defined alert timing and cooldown limits", () => {
    const settings = normalizeAuctionPageSettings({
      automaticClosingAlertsEnabled: false,
      closingAlertMinutes: [5, 30, 5, 0, 121],
      broadcastCooldownMinutes: 90,
    });
    expect(settings.automaticClosingAlertsEnabled).toBe(false);
    expect(settings.closingAlertMinutes).toEqual([30, 5]);
    expect(settings.broadcastCooldownMinutes).toBe(60);
  });
});
