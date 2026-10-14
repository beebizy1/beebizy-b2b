import { describe, expect, it } from "vitest";
import { balanceDueState, depositPaidCents, remainingBalanceCents, vendorPaymentPlanDeposits, vendorPaymentProgress } from "./depositTracker";

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

  it("shows the full vendor payment process and the date it was completed", () => {
    const payments = [
      { id: "deposit-1", amountCents: 250_000, status: "paid" as const, paidDate: "2026-09-15T12:00:00.000Z" },
      { id: "deposit-2", amountCents: 150_000, status: "paid" as const, paidDate: "2026-10-01T12:00:00.000Z" },
      { id: "deposit-3", amountCents: 100_000, status: "pending" as const, paidDate: null },
    ];

    expect(vendorPaymentProgress(500_000, payments)).toEqual({
      paidCents: 400_000,
      remainingCents: 100_000,
      completedAt: null,
      paidDeposits: [
        { id: "deposit-1", amountCents: 250_000, paidDate: "2026-09-15T12:00:00.000Z" },
        { id: "deposit-2", amountCents: 150_000, paidDate: "2026-10-01T12:00:00.000Z" },
      ],
    });

    expect(vendorPaymentProgress(400_000, payments).completedAt).toBe("2026-10-01T12:00:00.000Z");
    expect(vendorPaymentProgress(500_000, [
      ...payments.slice(0, 2),
      { id: "deposit-4", amountCents: 100_000, status: "paid", paidDate: null },
    ]).completedAt).toBeNull();
  });

  it("includes legacy same-vendor payments that predate stable plan IDs", () => {
    const deposits = [
      { id: "linked", paymentPlanId: "plan-1", vendorName: "Golden Gate Catering" },
      { id: "legacy", paymentPlanId: null, vendorName: " golden gate catering " },
      { id: "other", paymentPlanId: null, vendorName: "Other Vendor" },
    ];
    expect(vendorPaymentPlanDeposits({ id: "plan-1", vendorName: "Golden Gate Catering" }, deposits).map((deposit) => deposit.id)).toEqual(["linked", "legacy"]);
  });
});
