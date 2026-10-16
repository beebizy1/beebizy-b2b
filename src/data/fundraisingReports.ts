/** Existing report presentation centralized so money and export behavior share one seam. */
import { formatMoney } from "./money";

export function fundraisingReportColumnLabel(column: string): string {
  const words = column
    .replace(/Cents$/, "")
    .replaceAll(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase();
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : "";
}

export function fundraisingReportCell(column: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (column.endsWith("Cents") && typeof value === "number") return formatMoney(value);
  return String(value ?? "");
}
