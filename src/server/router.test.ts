import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  authorize: vi.fn(),
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
    budget: child,
    menu: child,
    moodBoard: child,
    auction: child,
    sponsorships: child,
    eventVendors: child,
    tickets: child,
    raffle: child,
  };
});

const { handleRequest } = await import("../../api/router");

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
