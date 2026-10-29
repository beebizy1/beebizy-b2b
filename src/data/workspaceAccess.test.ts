import { describe, expect, it } from "vitest";
import { workspaceUsesStripeConnect } from "./workspaceAccess";

describe("workspaceUsesStripeConnect", () => {
  it("keeps Stripe available for normal workspaces", () => {
    expect(workspaceUsesStripeConnect({ stripeConnectExempt: false })).toBe(true);
    expect(workspaceUsesStripeConnect(undefined)).toBe(true);
  });

  it("removes Stripe setup for an exempt workspace", () => {
    expect(workspaceUsesStripeConnect({ stripeConnectExempt: true })).toBe(false);
  });
});
