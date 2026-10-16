import type { TicketTypeDraft } from "./entities";
import { centsFromInput } from "./money";

export interface TicketDraftFormInput {
  name: string;
  price: string;
  quantity: string;
  fairMarketValue: string;
  zeroValueConfirmed: boolean;
  benefitsDescription?: string;
}

/** One validation and payload boundary for both guided and advanced ticket editors. */
export function ticketDraftFromForm(input: TicketDraftFormInput): TicketTypeDraft | null {
  const name = input.name.trim();
  const priceCents = centsFromInput(input.price);
  const quantityTotal = input.quantity.trim() ? Number.parseInt(input.quantity, 10) : 0;
  const fairMarketValueCents = centsFromInput(input.fairMarketValue);
  if (!name || priceCents == null || !Number.isFinite(quantityTotal) || quantityTotal < 0) return null;
  if (priceCents > 0 && fairMarketValueCents == null) return null;
  if (priceCents > 0 && fairMarketValueCents === 0 && !input.zeroValueConfirmed) return null;
  return {
    name,
    priceCents,
    quantityTotal,
    fairMarketValueCents: priceCents > 0 ? fairMarketValueCents : 0,
    fmvZeroConfirmed: priceCents > 0 && fairMarketValueCents === 0 ? input.zeroValueConfirmed : false,
    benefitsDescription: input.benefitsDescription?.trim() || null,
  };
}
