import { describe, expect, it } from "vitest";
import { hasInternalAccess, INTERNAL_ACCESS_EMAILS } from "./internalAccess";

describe("internal access allowlist", () => {
  it("contains only the two approved Beebizy operators", () => {
    expect(INTERNAL_ACCESS_EMAILS).toEqual(["laila@beebizy.com", "mary@beebizy.com"]);
  });

  it("accepts approved email addresses regardless of casing or surrounding space", () => {
    expect(hasInternalAccess(" LAILA@BEEBIZY.COM ")).toBe(true);
    expect(hasInternalAccess("mary@beebizy.com")).toBe(true);
  });

  it("rejects every other address", () => {
    expect(hasInternalAccess("someone@beebizy.com")).toBe(false);
    expect(hasInternalAccess("laila@example.com")).toBe(false);
    expect(hasInternalAccess(null)).toBe(false);
  });
});
