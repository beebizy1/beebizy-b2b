import { describe, expect, it } from "vitest";
import {
  canAccessOperatorFeedbackInbox,
  hasInternalAccess,
  INTERNAL_ACCESS_EMAILS,
  isBeebizyOperator,
} from "./internalAccess";

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

  it("allows invited beta testers from a comma-separated environment list", () => {
    const invited = " partner@example.com, DESIGNER@example.org ";
    expect(hasInternalAccess("partner@example.com", invited)).toBe(true);
    expect(hasInternalAccess("designer@example.org", invited)).toBe(true);
    expect(hasInternalAccess("not-invited@example.com", invited)).toBe(false);
  });

  it("grants feedback review only to the three Beebizy operators", () => {
    expect(isBeebizyOperator(" LAILA@BEEBIZY.COM ")).toBe(true);
    expect(isBeebizyOperator("mary@beebizy.com")).toBe(true);
    expect(isBeebizyOperator("tarang@beebizy.com")).toBe(true);
    expect(isBeebizyOperator("partner@example.com")).toBe(false);
    expect(isBeebizyOperator(null)).toBe(false);
  });

  it("allows only operators to bypass customer billing for the feedback inbox", () => {
    expect(canAccessOperatorFeedbackInbox("feedback/inbox", "laila@beebizy.com")).toBe(true);
    expect(canAccessOperatorFeedbackInbox("feedback/inbox", "partner@example.com")).toBe(false);
    expect(canAccessOperatorFeedbackInbox("events", "laila@beebizy.com")).toBe(false);
  });
});
