import { describe, expect, it } from "vitest";
import { eventBudgetAmounts } from "./eventBudget";

describe("event budget readings", () => {
  it("includes a newly booked vendor before any manual budget line or payment exists", () => {
    expect(eventBudgetAmounts([], [{ vendor: { name: "Florist" }, feeCents: 50_000, clientChargeCents: 70_000 }])).toMatchObject({
      committedSpend: 50_000, estimatedSpend: 50_000, actualSpend: 0, estimatedRevenue: 70_000, actualRevenue: 0,
    });
  });
  it("does not count a named vendor's manual expense or revenue twice", () => {
    const totals = eventBudgetAmounts([
      { type: "expense", name: " florist ", estimatedCents: 50_000, actualCents: 45_000 },
      { type: "revenue", name: "FLORIST", estimatedCents: 70_000, actualCents: 65_000 },
      { type: "expense", name: "Venue", estimatedCents: 100_000, actualCents: null },
    ], [{ vendor: { name: "Florist" }, feeCents: 50_000, clientChargeCents: 70_000 }]);
    expect(totals).toMatchObject({ committedSpend: 145_000, estimatedSpend: 150_000, actualSpend: 45_000, estimatedRevenue: 70_000, actualRevenue: 65_000 });
  });
  it("keeps zero actuals and missing amounts distinct", () => {
    expect(eventBudgetAmounts([{ type: "expense", name: "Venue", estimatedCents: 100_000, actualCents: 0 }], [
      { vendor: null, feeCents: 25_000, clientChargeCents: null },
      { vendor: { name: "Pending quote" }, feeCents: null, clientChargeCents: null },
    ])).toMatchObject({ committedSpend: 25_000, estimatedSpend: 125_000, actualSpend: 0, estimatedRevenue: 0 });
  });
});
