import type { DepositStatus, IsoDateTime } from "./entities";
import { civilDayInZone } from "@/lib/datetime";

export function depositPaidCents(deposit: { amountCents: number; status: DepositStatus }): number {
  return deposit.status === "paid" ? deposit.amountCents : 0;
}

export function remainingBalanceCents(totalAmountCents: number, paidCents: number): number {
  return Math.max(0, totalAmountCents - paidCents);
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
