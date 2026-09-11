import { describe, expect, it } from "vitest";
import {
  BILLING_INTERVALS,
  effectivePlan,
  planHasCapability,
  SOLO_FEATURES,
  SOLO_LIMITS,
  SOLO_PRICE_OPTIONS,
  SOLO_TRIAL_DAYS,
} from "./plans";

describe("plan entitlements", () => {
  it("keeps the private pilot fully enabled", () => {
    expect(effectivePlan({ status: "beta", plan: "solo" })).toBe("enterprise");
    expect(effectivePlan({ status: "beta", plan: null })).toBe("enterprise");
  });

  it("restricts paid workspaces to the selected plan", () => {
    expect(effectivePlan({ status: "active", plan: "solo" })).toBe("solo");
    expect(effectivePlan({ status: "active", plan: null })).toBe("solo");
    expect(effectivePlan(undefined)).toBe("solo");
    expect(planHasCapability("solo", "corePlanning")).toBe(true);
    expect(planHasCapability("solo", "collaboration")).toBe(true);
    expect(planHasCapability("solo", "inspirationBoards")).toBe(true);
    expect(planHasCapability("solo", "contingencyPlanning")).toBe(false);
    expect(planHasCapability("team", "vendorManagement")).toBe(true);
    expect(planHasCapability("team", "contingencyPlanning")).toBe(true);
    expect(planHasCapability("team", "customReporting")).toBe(false);
    expect(planHasCapability("enterprise", "customReporting")).toBe(true);
  });

  it("keeps the Solo package aligned with the published offer", () => {
    expect(SOLO_PRICE_OPTIONS.month.amountCents).toBe(29_900);
    expect(BILLING_INTERVALS).toEqual(["month"]);
    expect(SOLO_LIMITS).toEqual({ teamMembers: 2, eventsPerYear: 3 });
    expect(SOLO_FEATURES).toHaveLength(5);
    expect(SOLO_TRIAL_DAYS).toBe(30);
  });
});
