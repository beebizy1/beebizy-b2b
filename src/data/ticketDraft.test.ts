import { describe, expect, it } from "vitest";
import { ticketDraftFromForm } from "./ticketDraft";

describe("ticket form draft", () => {
  it("builds the same safe paid-ticket payload for every editor", () => {
    expect(ticketDraftFromForm({ name: " Gala ", price: "150", quantity: "300", fairMarketValue: "75", zeroValueConfirmed: false, benefitsDescription: " Meal " })).toMatchObject({ name: "Gala", priceCents: 15_000, quantityTotal: 300, fairMarketValueCents: 7_500, benefitsDescription: "Meal" });
  });

  it("requires confirmation before a paid ticket can claim zero value", () => {
    expect(ticketDraftFromForm({ name: "Donation ticket", price: "100", quantity: "", fairMarketValue: "0", zeroValueConfirmed: false })).toBeNull();
    expect(ticketDraftFromForm({ name: "Donation ticket", price: "100", quantity: "", fairMarketValue: "0", zeroValueConfirmed: true })).toMatchObject({ fairMarketValueCents: 0, fmvZeroConfirmed: true });
  });
});
