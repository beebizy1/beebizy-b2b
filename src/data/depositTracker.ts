import type { DepositStatus, IsoDateTime } from "./entities";
import { civilDayInZone } from "@/lib/datetime";

export function depositPaidCents(deposit: { amountCents: number; status: DepositStatus }): number {
  return deposit.status === "paid" ? deposit.amountCents : 0;
}

export function remainingBalanceCents(totalAmountCents: number, paidCents: number): number {
  return Math.max(0, totalAmountCents - paidCents);
}

export interface PaymentProgressDeposit {
  id: string;
  amountCents: number;
  status: DepositStatus;
  paidDate: IsoDateTime | null;
  paidBy?: string | null;
  paymentMethod?: string | null;
}

export interface VendorPaymentProgress {
  paidCents: number;
  remainingCents: number;
  completedAt: IsoDateTime | null;
  completedBy: string | null;
  lastPaidAt: IsoDateTime | null;
  lastPaidBy: string | null;
  paidDeposits: Array<{ id: string; amountCents: number; paidDate: IsoDateTime | null; paidBy: string | null; paymentMethod: string | null }>;
}

export function vendorPaymentPlanDeposits<T extends { paymentPlanId: string | null; vendorName: string }>(
  plan: { id: string; vendorName: string },
  deposits: T[],
): T[] {
  const vendorName = plan.vendorName.trim().toLocaleLowerCase();
  return deposits.filter((deposit) =>
    deposit.paymentPlanId === plan.id
    || (deposit.paymentPlanId === null && deposit.vendorName.trim().toLocaleLowerCase() === vendorName));
}

/** One vendor's contract from first deposit through paid-in-full completion. */
export function vendorPaymentProgress(
  totalAmountCents: number,
  deposits: PaymentProgressDeposit[],
): VendorPaymentProgress {
  const paidDeposits = deposits
    .filter((deposit) => deposit.status === "paid")
    .map(({ id, amountCents, paidDate, paidBy, paymentMethod }) => ({ id, amountCents, paidDate, paidBy: paidBy ?? null, paymentMethod: paymentMethod ?? null }))
    .sort((a, b) => (a.paidDate ?? "9999").localeCompare(b.paidDate ?? "9999"));
  const paidCents = paidDeposits.reduce((total, deposit) => total + deposit.amountCents, 0);
  const remainingCents = remainingBalanceCents(totalAmountCents, paidCents);
  const everyPaidDepositHasDate = paidDeposits.every((deposit) => deposit.paidDate);
  const lastPaid = everyPaidDepositHasDate ? paidDeposits.at(-1) ?? null : null;
  const completedAt = remainingCents === 0
    && paidDeposits.length > 0
    && everyPaidDepositHasDate
    && Boolean(paidDeposits.at(-1)!.paidBy)
    ? paidDeposits.at(-1)!.paidDate
    : null;
  return {
    paidCents,
    remainingCents,
    completedAt,
    completedBy: completedAt ? paidDeposits.at(-1)!.paidBy : null,
    lastPaidAt: lastPaid?.paidDate ?? null,
    lastPaidBy: lastPaid?.paidBy ?? null,
    paidDeposits,
  };
}

export type BalanceDueState = "paid" | "upcoming" | "overdue" | "unscheduled";

export function balanceDueState(
  balanceDueDate: IsoDateTime | null,
  remainingCents: number,
  now = new Date(),
  timeZone = "UTC",
): BalanceDueState {
  if (remainingCents <= 0) return "paid";
  if (!balanceDueDate) return "unscheduled";
  const dueDay = balanceDueDate.slice(0, 10);
  const current = civilDayInZone(now, timeZone);
  const currentDay = `${current.year}-${String(current.month).padStart(2, "0")}-${String(current.day).padStart(2, "0")}`;
  return dueDay < currentDay ? "overdue" : "upcoming";
}
