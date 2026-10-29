import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./notify", () => ({ notifyTicketOrderConfirmation: vi.fn() }));

const { requireCheckoutMatch, requireStripeConnectAvailable, stripeConnectReturnUrls, ticketCheckoutSessionParams } = await import("./commercePayments");

describe("Stripe Connect workspace exemption", () => {
  it("rejects onboarding for an exempt workspace before Stripe setup can begin", () => {
    expect(() => requireStripeConnectAvailable({ stripeConnectExempt: true })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("keeps onboarding available for a normal workspace", () => {
    expect(() => requireStripeConnectAvailable({ stripeConnectExempt: false })).not.toThrow();
  });
});

describe("Stripe Connect launch-guide return", () => {
  it("returns onboarding to the event's master step list", () => {
    expect(stripeConnectReturnUrls("https://beebizy.example", "/app/events/evt-123/share")).toEqual({
      refreshUrl: "https://beebizy.example/app/events/evt-123/share?stripe=refresh",
      returnUrl: "https://beebizy.example/app/events/evt-123/share?stripe=return",
    });
  });

  it("rejects external or unrelated return destinations", () => {
    expect(stripeConnectReturnUrls("https://beebizy.example", "https://evil.example").returnUrl).toBe(
      "https://beebizy.example/app/tickets?stripe=return",
    );
  });
});

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
      donationAddOnCents: 0,
      currency: "USD",
      origin: "https://beebizy.example",
      expiresAt,
    });

    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([expect.objectContaining({ quantity: 2 })]);
    expect(params.payment_intent_data?.application_fee_amount).toBe(400);
    expect(params.payment_intent_data?.setup_future_usage).toBe("off_session");
    expect(params.customer_creation).toBe("always");
    expect(params.metadata).toMatchObject({ kind: "ticket-order", orderId: "tord_123" });
    expect(params.expires_at).toBe(Math.floor(expiresAt.getTime() / 1_000));
    expect(params.success_url).toContain("checkout=success");
    expect(params.cancel_url).toContain("checkout=cancelled");
  });

  it("keeps the ticket and fully deductible donation add-on as separate receiptable lines", () => {
    const params = ticketCheckoutSessionParams({
      orderId: "tord_addon",
      eventTitle: "School Gala",
      ticketName: "Family ticket",
      ticketTypeId: "tt_family",
      shareToken: "public-token",
      buyerEmail: "family@example.com",
      quantity: 1,
      unitAmountCents: 25_000,
      applicationFeeCents: 600,
      donationAddOnCents: 5_000,
      currency: "USD",
      origin: "https://beebizy.example",
      expiresAt: new Date("2026-10-12T20:30:00.000Z"),
    });
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items?.[1]).toMatchObject({ quantity: 1, price_data: { unit_amount: 5_000 } });
  });
});

describe("Stripe Connect checkout binding", () => {
  const session = {
    id: "cs_test_expected",
    amount_total: 12_500,
    currency: "usd",
  } as import("stripe").default.Checkout.Session;

  it("accepts only the stored account, session, total, and currency", () => {
    expect(() => requireCheckoutMatch({ session, eventAccount: "acct_school", connectedAccountId: "acct_school", storedSessionId: "cs_test_expected", amountCents: 12_500, currency: "USD" })).not.toThrow();
  });

  it.each([
    [{ eventAccount: "acct_attacker", connectedAccountId: "acct_school", storedSessionId: "cs_test_expected", amountCents: 12_500, currency: "USD" }, /payment account/i],
    [{ eventAccount: "acct_school", connectedAccountId: "acct_school", storedSessionId: "cs_test_other", amountCents: 12_500, currency: "USD" }, /session/i],
    [{ eventAccount: "acct_school", connectedAccountId: "acct_school", storedSessionId: "cs_test_expected", amountCents: 100, currency: "USD" }, /total/i],
    [{ eventAccount: "acct_school", connectedAccountId: "acct_school", storedSessionId: "cs_test_expected", amountCents: 12_500, currency: "EUR" }, /currency/i],
  ])("rejects a mismatched webhook field", (input, message) => {
    expect(() => requireCheckoutMatch({ session, ...input })).toThrow(message);
  });
});
