import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));

const { handleStripeWebhook, validateSoloPrice } = await import("./billing");

function price(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    active: true,
    currency: "usd",
    livemode: false,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    unit_amount: 7_900,
    ...overrides,
  } as Stripe.Price;
}

afterEach(() => vi.unstubAllEnvs());

describe("Stripe Solo price validation", () => {
  it("accepts only the amount, currency, and interval advertised by Beebizy", () => {
    expect(() => validateSoloPrice(price(), "month")).not.toThrow();
    expect(() => validateSoloPrice(price({ unit_amount: 7_901 }), "month")).toThrow(/does not match/);
    expect(() => validateSoloPrice(price({ currency: "eur" }), "month")).toThrow(/does not match/);
    expect(() =>
      validateSoloPrice(
        price({ recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } as Stripe.Price.Recurring }),
        "month",
      ),
    ).toThrow(/does not match/);
    expect(() =>
      validateSoloPrice(
        price({ recurring: { interval: "month", interval_count: 2, usage_type: "licensed" } as Stripe.Price.Recurring }),
        "month",
      ),
    ).toThrow(/does not match/);
    expect(() =>
      validateSoloPrice(
        price({ recurring: { interval: "month", interval_count: 1, usage_type: "metered" } as Stripe.Price.Recurring }),
        "month",
      ),
    ).toThrow(/does not match/);
  });

  it("keeps live payments locked until the founder explicitly enables them", () => {
    vi.stubEnv("STRIPE_LIVE_PAYMENTS_ENABLED", "false");
    expect(() => validateSoloPrice(price({ livemode: true }), "month")).toThrow(/locked/);

    vi.stubEnv("STRIPE_LIVE_PAYMENTS_ENABLED", "true");
    expect(() => validateSoloPrice(price({ livemode: true }), "month")).not.toThrow();
  });
});

describe("Stripe webhook signatures", () => {
  it("accepts the exact signed UTF-8 body and rejects a modified body", async () => {
    const secret = "whsec_beebizy_test";
    const payload = JSON.stringify({
      id: "evt_test_signature",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_test", name: "Café 🐝" } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_beebizy_signature_only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);

    await expect(
      handleStripeWebhook(
        new Request("http://localhost/api/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": signature },
          body: payload,
        }),
      ),
    ).resolves.toEqual({ received: true });

    await expect(
      handleStripeWebhook(
        new Request("http://localhost/api/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": signature },
          body: `${payload} `,
        }),
      ),
    ).rejects.toThrow(/Invalid Stripe signature/);
  });
});
