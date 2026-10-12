import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./notify", () => ({ notifyTicketOrderConfirmation: vi.fn() }));

const { ticketCheckoutSessionParams } = await import("./commercePayments");

describe("ticket Checkout session", () => {
  it("routes exactly the calculated Beebizy fee while leaving processing fees to Stripe", () => {
    const expiresAt = new Date("2026-10-12T20:30:00.000Z");
    const params = ticketCheckoutSessionParams({
      orderId: "tord_123",
      eventTitle: "School Gala",
      ticketName: "General admission",
      ticketTypeId: "tt_123",
      shareToken: "public-token",
      buyerEmail: "buyer@example.com",
      quantity: 2,
      unitAmountCents: 10_000,
      applicationFeeCents: 400,
      currency: "USD",
      origin: "https://beebizy.example",
      expiresAt,
    });

    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([expect.objectContaining({ quantity: 2 })]);
    expect(params.payment_intent_data?.application_fee_amount).toBe(400);
    expect(params.metadata).toMatchObject({ kind: "ticket-order", orderId: "tord_123" });
    expect(params.expires_at).toBe(Math.floor(expiresAt.getTime() / 1_000));
    expect(params.success_url).toContain("checkout=success");
    expect(params.cancel_url).toContain("checkout=cancelled");
  });
});
