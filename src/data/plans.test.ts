import { describe, expect, it } from "vitest";
import { effectivePlan, planHasCapability } from "./plans";

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
    expect(planHasCapability("solo", "collaboration")).toBe(false);
    expect(planHasCapability("solo", "contingencyPlanning")).toBe(false);
    expect(planHasCapability("team", "vendorManagement")).toBe(true);
    expect(planHasCapability("team", "contingencyPlanning")).toBe(true);
    expect(planHasCapability("team", "customReporting")).toBe(false);
    expect(planHasCapability("enterprise", "customReporting")).toBe(true);
  });
});
