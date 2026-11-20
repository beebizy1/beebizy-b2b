import type { BudgetItem } from "./entities";
import { sumCents } from "./money";

type BudgetLine = Pick<BudgetItem, "type" | "name" | "estimatedCents" | "actualCents">;
type VendorAmounts = { vendor?: { name: string } | null; feeCents: number | null; clientChargeCents: number | null };

/** Keep the budget header and ROI consistent without counting a named vendor line twice. */
export function eventBudgetAmounts(lines: readonly BudgetLine[], vendors: readonly VendorAmounts[]) {
  const expenses = lines.filter(line => line.type === "expense");
  const revenues = lines.filter(line => line.type === "revenue");
  const key = (name: string) => name.trim().toLowerCase();
  const expenseNames = new Set(expenses.map(line => key(line.name)));
  const revenueNames = new Set(revenues.map(line => key(line.name)));
  const vendorSpend = sumCents(vendors.filter(row => !row.vendor || !expenseNames.has(key(row.vendor.name))).map(row => row.feeCents));
  const vendorRevenue = sumCents(vendors.filter(row => !row.vendor || !revenueNames.has(key(row.vendor.name))).map(row => row.clientChargeCents));
  return {
    committedSpend: sumCents(expenses.map(line => line.actualCents ?? line.estimatedCents)) + vendorSpend,
    estimatedSpend: sumCents(expenses.map(line => line.estimatedCents)) + vendorSpend,
    actualSpend: sumCents(expenses.map(line => line.actualCents)),
    estimatedRevenue: sumCents(revenues.map(line => line.estimatedCents)) + vendorRevenue,
    actualRevenue: sumCents(revenues.map(line => line.actualCents)),
    vendorSpend,
    vendorRevenue,
  };
}
