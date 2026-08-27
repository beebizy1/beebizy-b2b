import { describe, expect, it } from "vitest";
import { getStudioAccess, hasInternalAccess, INTERNAL_ACCESS_EMAILS } from "./internalAccess";

describe("internal access allowlist", () => {
  it("contains only the three approved Beebizy operators", () => {
    expect(INTERNAL_ACCESS_EMAILS).toEqual([
      "laila@beebizy.com",
      "mary@beebizy.com",
      "tarang@beebizy.com",
    ]);
  });

  it("accepts approved email addresses regardless of casing or surrounding space", () => {
    expect(hasInternalAccess(" LAILA@BEEBIZY.COM ")).toBe(true);
    expect(hasInternalAccess("mary@beebizy.com")).toBe(true);
    expect(hasInternalAccess("Tarang@Beebizy.com")).toBe(true);
  });

  it("rejects every other address", () => {
    expect(hasInternalAccess("someone@beebizy.com")).toBe(false);
    expect(hasInternalAccess("laila@example.com")).toBe(false);
    expect(hasInternalAccess(null)).toBe(false);
  });
});

describe("private beta access", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("gives invited beta testers 90 days from account creation", () => {
    const result = getStudioAccess(
      {
        email: "tester@example.com",
        createdAt: "2026-08-01T12:00:00.000Z",
        publicMetadata: { beebizyBeta: true },
      },
      now,
    );
    expect(result.allowed).toBe(true);
    expect(result.kind).toBe("beta");
    expect(result.trialEndsAt).toBe("2026-10-30T12:00:00.000Z");
  });

  it("blocks an invited tester after the trial expires", () => {
    const result = getStudioAccess(
      {
        email: "tester@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        publicMetadata: { beebizyBeta: true },
      },
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.kind).toBe("expired");
  });

  it("allows an active subscriber after beta", () => {
    const result = getStudioAccess(
      {
        email: "customer@example.com",
        createdAt: "2025-01-01T00:00:00.000Z",
        publicMetadata: { beebizyBeta: true, subscriptionStatus: "active" },
      },
      now,
    );
    expect(result).toEqual({ allowed: true, kind: "subscriber", trialEndsAt: null });
  });
});
