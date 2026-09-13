import { describe, expect, it } from "vitest";
import {
  canAccessOperatorFeedbackInbox,
  hasInternalAccess,
  INTERNAL_ACCESS_EMAILS,
  isBeebizyOperator,
} from "./internalAccess";

describe("internal access allowlist", () => {
  it("treats the whole Beebizy domain as staff, including people hired since", () => {
    for (const staff of ["laila@beebizy.com", "mary@beebizy.com", "tarang@beebizy.com", "sabina@beebizy.com"]) {
      expect(isBeebizyOperator(staff)).toBe(true);
    }
    // The old list was three addresses and had already missed someone holding a workspace.
    expect(INTERNAL_ACCESS_EMAILS).not.toContain("sabina@beebizy.com");
  });

  it("accepts approved email addresses regardless of casing or surrounding space", () => {
    expect(hasInternalAccess(" LAILA@BEEBIZY.COM ")).toBe(true);
    expect(hasInternalAccess("mary@beebizy.com")).toBe(true);
    expect(hasInternalAccess("Tarang@Beebizy.com")).toBe(true);
  });

  it("rejects addresses outside the domain, and look-alikes of it", () => {
    expect(hasInternalAccess("laila@example.com")).toBe(false);
    expect(hasInternalAccess(null)).toBe(false);
    // Only the domain itself counts: a suffix match would hand staff access to anyone
    // who registered a domain ending in the same letters.
    expect(isBeebizyOperator("attacker@notbeebizy.com")).toBe(false);
    expect(isBeebizyOperator("attacker@beebizy.com.evil.example")).toBe(false);
    expect(isBeebizyOperator("beebizy.com")).toBe(false);
    expect(isBeebizyOperator("attacker@sub.beebizy.com")).toBe(false);
  });

  it("allows invited beta testers from a comma-separated environment list", () => {
    const invited = " partner@example.com, DESIGNER@example.org ";
    expect(hasInternalAccess("partner@example.com", invited)).toBe(true);
    expect(hasInternalAccess("designer@example.org", invited)).toBe(true);
    expect(hasInternalAccess("not-invited@example.com", invited)).toBe(false);
  });

  it("grants feedback review to Beebizy staff and nobody else", () => {
    expect(isBeebizyOperator(" LAILA@BEEBIZY.COM ")).toBe(true);
    expect(isBeebizyOperator("mary@beebizy.com")).toBe(true);
    expect(isBeebizyOperator("tarang@beebizy.com")).toBe(true);
    expect(isBeebizyOperator("sabina@beebizy.com")).toBe(true);
    expect(isBeebizyOperator("partner@example.com")).toBe(false);
    // A pilot customer is not staff, however much they use the product.
    expect(isBeebizyOperator("carlin@page-oneevents.com")).toBe(false);
    expect(isBeebizyOperator(null)).toBe(false);
  });

  it("allows only operators to bypass customer billing for the feedback inbox", () => {
    expect(canAccessOperatorFeedbackInbox("feedback/inbox", "laila@beebizy.com")).toBe(true);
    expect(canAccessOperatorFeedbackInbox("feedback/inbox", "partner@example.com")).toBe(false);
    expect(canAccessOperatorFeedbackInbox("events", "laila@beebizy.com")).toBe(false);
  });
});
