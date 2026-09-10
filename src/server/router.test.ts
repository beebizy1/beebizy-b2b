import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  authorize: vi.fn(),
  requireBeebizyOperator: vi.fn(),
  HttpError: class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));
vi.mock("./repos", () => {
  const child = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
  return {
    eventByShareToken: vi.fn(),
    publicAgenda: vi.fn(),
    publicTickets: vi.fn(),
    checklist: child,
    runOfShow: child,
    volunteers: child,
    budget: child,
    menu: child,
    moodBoard: child,
    auction: child,
    sponsorships: child,
    eventVendors: child,
    tickets: child,
    raffle: child,
    vendors: { list: vi.fn() },
    locations: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    members: { list: vi.fn().mockResolvedValue([]) },
    canvases: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    analytics: { portfolio: vi.fn().mockResolvedValue({}), customReport: vi.fn().mockResolvedValue([]) },
    feedback: { list: vi.fn(), listInbox: vi.fn(), create: vi.fn() },
  };
});
vi.mock("./billing", () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleStripeWebhook: vi.fn(),
}));

const { config, handleRequest } = await import("../../api/router");
const { authorize, HttpError, requireBeebizyOperator } = await import("./auth");
const { feedback } = await import("./repos");
const { createCheckoutSession, handleStripeWebhook } = await import("./billing");

function leadRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/lead", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("public lead endpoint", () => {
  it("rejects unsupported methods and invalid submissions", async () => {
    expect((await handleRequest(leadRequest("GET"))).status).toBe(405);
    expect((await handleRequest(leadRequest("POST", { name: "Ada" }))).status).toBe(400);
    expect(
      (await handleRequest(leadRequest("POST", { name: "Ada", email: "bad", company: "Example" }))).status,
    ).toBe(400);
  });

  it("accepts human submissions and silently drops honeypots", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("MAIL_TO", "hello@beebizy.com");
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    const sendEmail = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
    const human = await handleRequest(
      leadRequest("POST", { name: "Ada", email: "ada@example.com", company: "Example", volume: "6-20" }),
    );
    expect(human.status).toBe(200);
    expect(log).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(JSON.parse(String((sendEmail.mock.calls[0]?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      to: ["hello@beebizy.com"],
      reply_to: "ada@example.com",
      subject: "New demo request - Example",
    });

    const bot = await handleRequest(
      leadRequest("POST", { name: "Bot", email: "bot@example.com", company: "Spam", website: "filled" }),
    );
    expect(bot.status).toBe(200);
    expect(log).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
    sendEmail.mockRestore();
    log.mockRestore();
  });

  it("does not report success when email delivery fails", async () => {
    vi.stubEnv("MAIL_TO", "hello@beebizy.com");
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendEmail = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("provider failure", { status: 500 }));

    const response = await handleRequest(
      leadRequest("POST", { name: "Ada", email: "ada@example.com", company: "Example" }),
    );

    expect(response.status).toBe(502);
    expect(error).toHaveBeenCalledWith("LEAD_EMAIL_FAILED", 500, "provider failure");
    vi.unstubAllEnvs();
    sendEmail.mockRestore();
    error.mockRestore();
    log.mockRestore();
  });
});

describe("feedback endpoint", () => {
  const context = {
    userId: "user-pilot",
    workspaceId: "workspace-school",
    email: "pilot@school.org",
    role: "member" as const,
    access: {
      status: "beta" as const,
      plan: null,
      betaStartedAt: "2026-09-01T00:00:00.000Z",
      betaEndsAt: "2026-12-01T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  };

  it("stores valid feedback for the authorized user", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(feedback.create).mockResolvedValue({
      id: "feedback-1",
      workspaceId: context.workspaceId,
      userId: context.userId,
      category: "idea",
      message: "Add a better timeline view.",
      pagePath: "/app/events/event-1",
      createdAt: "2026-09-09T20:00:00.000Z",
    });

    const response = await handleRequest(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: "idea",
          message: "  Add a better timeline view.  ",
          pagePath: "/app/events/event-1",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(feedback.create).toHaveBeenCalledWith(context, {
      category: "idea",
      message: "Add a better timeline view.",
      pagePath: "/app/events/event-1",
    });
  });

  it("rejects malformed feedback before it reaches storage", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(feedback.create).mockClear();

    const response = await handleRequest(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "idea", message: "x", pagePath: "https://example.com" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(feedback.create).not.toHaveBeenCalled();
  });

  it("allows only the three Beebizy operators to review all feedback", async () => {
    vi.mocked(feedback.listInbox).mockResolvedValue([]);
    vi.mocked(requireBeebizyOperator).mockReturnValue(undefined);
    vi.mocked(authorize).mockResolvedValue({ ...context, email: "tarang@beebizy.com" });

    const allowed = await handleRequest(new Request("http://localhost/api/feedback/inbox"));
    expect(allowed.status).toBe(200);
    expect(feedback.listInbox).toHaveBeenCalledOnce();

    vi.mocked(feedback.listInbox).mockClear();
    vi.mocked(requireBeebizyOperator).mockImplementationOnce(() => {
      throw new HttpError(403, "Only the Beebizy product team can review pilot feedback.");
    });
    vi.mocked(authorize).mockResolvedValue(context);
    const denied = await handleRequest(new Request("http://localhost/api/feedback/inbox"));
    expect(denied.status).toBe(403);
    expect(feedback.listInbox).not.toHaveBeenCalled();
  });
});

describe("billing endpoints", () => {
  const owner = {
    userId: "user-owner",
    workspaceId: "workspace-paid",
    email: "owner@example.com",
    role: "owner" as const,
    access: {
      status: "active" as const,
      plan: "solo" as const,
      betaStartedAt: "2026-01-01T00:00:00.000Z",
      betaEndsAt: "2026-04-01T00:00:00.000Z",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    },
  };

  it("creates checkout from the server-selected interval and ignores client price ids", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    vi.mocked(createCheckoutSession).mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval: "year", priceId: "price_attacker_supplied" }),
    });

    const response = await handleRequest(request);

    expect(response.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(owner, "year", request);
  });

  it("accepts the signed Stripe webhook without a user session", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(handleStripeWebhook).mockResolvedValue({ received: true });
    const request = new Request("http://localhost/api/billing/webhook", { method: "POST", body: "signed" });

    expect((await handleRequest(request)).status).toBe(200);
    expect(handleStripeWebhook).toHaveBeenCalledWith(request);
    expect(authorize).not.toHaveBeenCalled();
    expect(config.api.bodyParser).toBe(false);
  });

  it("keeps Solo core reads working while enforcing premium writes", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    for (const path of ["locations", "members", "analytics/portfolio"]) {
      expect((await handleRequest(new Request(`http://localhost/api/${path}`))).status).toBe(200);
    }
    expect((await handleRequest(new Request("http://localhost/api/boards"))).status).toBe(403);
    for (const path of ["boards", "locations"]) {
      expect((await handleRequest(new Request(`http://localhost/api/${path}`, { method: "POST" }))).status).toBe(403);
    }
    expect((await handleRequest(new Request("http://localhost/api/analytics/custom-report"))).status).toBe(403);
    expect((await handleRequest(new Request("http://localhost/api/vendors"))).status).toBe(403);

    vi.mocked(authorize).mockResolvedValue({ ...owner, access: { ...owner.access, plan: "enterprise" } });
    expect((await handleRequest(new Request("http://localhost/api/boards"))).status).toBe(200);
    expect((await handleRequest(new Request("http://localhost/api/analytics/custom-report"))).status).toBe(200);
  });
});
