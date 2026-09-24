import { describe, expect, it } from "vitest";
import { assignmentDeliveryEmail, assignmentSummaryCounts } from "./assignmentSummary";

describe("assignment responsibility summaries", () => {
  it("normalizes valid addresses and rejects blank or malformed values", () => {
    expect(assignmentDeliveryEmail(" ADA@Example.com ")).toBe("ada@example.com");
    expect(assignmentDeliveryEmail("   ")).toBeNull();
    expect(assignmentDeliveryEmail("not-an-email")).toBeNull();
  });

  it("counts one recipient across several assignments without hiding missing addresses", () => {
    expect(assignmentSummaryCounts([
      { email: "ada@example.com" },
      { email: "ADA@example.com" },
      { email: null },
    ])).toEqual({ recipients: 1, assignments: 2, missingEmail: 1 });
  });
});
