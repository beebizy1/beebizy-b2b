import { describe, expect, it } from "vitest";
import { balanceDueState, depositPaidCents, remainingBalanceCents } from "./depositTracker";

describe("vendor payment tracker", () => {
  it("counts only paid deposits toward the remaining vendor balance", () => {
    expect(depositPaidCents({ amountCents: 120_000, status: "paid" })).toBe(120_000);
    expect(depositPaidCents({ amountCents: 120_000, status: "pending" })).toBe(0);
    expect(remainingBalanceCents(500_000, 120_000)).toBe(380_000);
    expect(remainingBalanceCents(100_000, 120_000)).toBe(0);
  });

  it("marks an unpaid balance as upcoming, overdue, or unscheduled", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    expect(balanceDueState("2026-10-20T12:00:00.000Z", 50_000, now)).toBe("upcoming");
    expect(balanceDueState("2026-10-10T12:00:00.000Z", 50_000, now)).toBe("overdue");
    expect(balanceDueState("2026-10-14T00:00:00.000Z", 50_000, now)).toBe("upcoming");
    expect(balanceDueState("2026-10-14T12:00:00.000Z", 50_000, new Date("2026-10-15T00:30:00.000Z"), "America/Los_Angeles")).toBe("upcoming");
    expect(balanceDueState(null, 50_000, now)).toBe("unscheduled");
    expect(balanceDueState("2026-10-10T12:00:00.000Z", 0, now)).toBe("paid");
  });
});
