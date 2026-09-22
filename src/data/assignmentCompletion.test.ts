import { describe, expect, it } from "vitest";
import { volunteerCompletionTransition } from "./assignmentCompletion";

describe("volunteer assignment completion", () => {
  it.each(["scheduled", "confirmed", "checked_in"] as const)(
    "restores the exact %s status after an accidental completion",
    (status) => {
      const completed = volunteerCompletionTransition("complete", status, null);
      expect(completed).toEqual({ status: "completed", previousStatus: status });
      if (!completed) throw new Error("Expected a reversible completion transition.");
      expect(volunteerCompletionTransition("reopen", completed.status, completed.previousStatus)).toEqual({
        status,
        previousStatus: null,
      });
    },
  );

  it("does not change cancelled shifts", () => {
    expect(volunteerCompletionTransition("complete", "cancelled", null)).toBeNull();
    expect(volunteerCompletionTransition("reopen", "cancelled", "confirmed")).toBeNull();
  });

  it("falls back to confirmed for completions saved before undo tracking existed", () => {
    expect(volunteerCompletionTransition("reopen", "completed", null)).toEqual({
      status: "confirmed",
      previousStatus: null,
    });
  });
});
