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
      { id: "deposit-1", amountCents: 250_000, status: "paid" as const, paidDate: "2026-09-15T12:00:00.000Z", paidBy: "School operating account", paymentMethod: "Wire" },
      { id: "deposit-2", amountCents: 150_000, status: "paid" as const, paidDate: "2026-10-01T12:00:00.000Z", paidBy: "Dana Rivera", paymentMethod: "Check" },
      { id: "deposit-3", amountCents: 100_000, status: "pending" as const, paidDate: null, paidBy: null, paymentMethod: null },
    ];

    expect(vendorPaymentProgress(500_000, payments)).toEqual({
      paidCents: 400_000,
      remainingCents: 100_000,
      completedAt: null,
      completedBy: null,
      lastPaidAt: "2026-10-01T12:00:00.000Z",
      lastPaidBy: "Dana Rivera",
      paidDeposits: [
        { id: "deposit-1", amountCents: 250_000, paidDate: "2026-09-15T12:00:00.000Z", paidBy: "School operating account", paymentMethod: "Wire" },
        { id: "deposit-2", amountCents: 150_000, paidDate: "2026-10-01T12:00:00.000Z", paidBy: "Dana Rivera", paymentMethod: "Check" },
      ],
    });

    expect(vendorPaymentProgress(400_000, payments)).toMatchObject({
      completedAt: "2026-10-01T12:00:00.000Z",
      completedBy: "Dana Rivera",
    });
    expect(vendorPaymentProgress(500_000, [
      ...payments.slice(0, 2),
      { id: "deposit-4", amountCents: 100_000, status: "paid", paidDate: null, paidBy: "Dana Rivera", paymentMethod: "Check" },
    ])).toMatchObject({ completedAt: null, lastPaidAt: null, lastPaidBy: null });
    expect(vendorPaymentProgress(400_000, [
      payments[0]!,
      { ...payments[1]!, paidBy: null },
      payments[2]!,
    ])).toMatchObject({ completedAt: null, completedBy: null });
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
