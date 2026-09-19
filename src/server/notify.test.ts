import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyFeedbackSubmission, notifyTeamUpdate, notifyVolunteerAssignment } from "./notify";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function configureDelivery() {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("MAIL_FROM", "Beebizy <events@beebizy.com>");
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
}

describe("assignment and live-update email", () => {
  it("sends a volunteer the role, shift and Beebizy link", async () => {
    const fetch = configureDelivery();
    expect(await notifyVolunteerAssignment({
      to: "volunteer@example.com",
      volunteerName: "Ada",
      role: "Welcome desk",
      eventTitle: "Demo Day",
      startTime: "08:00",
      endTime: "12:00",
      url: "https://beebizy.test/app/events/one/volunteers",
    })).toEqual({ status: "sent" });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ to: ["volunteer@example.com"], subject: "Your Welcome desk shift - Demo Day" });
    expect(body.text).toContain("Shift: 08:00–12:00");
    expect(body.text).toContain("https://beebizy.test/app/events/one/volunteers");
  });

  it("sends urgent event context to the team", async () => {
    const fetch = configureDelivery();
    await notifyTeamUpdate({
      to: "team@example.com",
      eventTitle: "Demo Day",
      kind: "vendor-delay",
      message: "The caterer is 20 minutes late.",
      url: "https://beebizy.test/app/events/one",
    });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.subject).toBe("Live vendor delay update - Demo Day");
    expect(body.text).toContain("The caterer is 20 minutes late.");
  });
});

describe("product feedback email", () => {
  it("sends the exact feedback from every submitter to hello with a stable delivery key", async () => {
    const fetch = configureDelivery();
    expect(await notifyFeedbackSubmission({
      feedbackId: "feedback-123",
      userName: "Radhika Khandelwal",
      userEmail: "radhika@example.com",
      workspaceName: "CCS",
      category: "general",
      message: "Exact feedback, including punctuation!",
      pageUrl: "https://beebizy.test/app/events/one/checklist",
      createdAt: "2026-09-15T17:58:08.488Z",
      inboxUrl: "https://beebizy.test/app/feedback",
    })).toEqual({ status: "sent" });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      to: ["hello@beebizy.com"],
      reply_to: "radhika@example.com",
      subject: "New Beebizy feedback from Radhika Khandelwal",
    });
    expect(body.text).toContain("Exact feedback:\nExact feedback, including punctuation!");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("product-feedback-feedback-123");
  });
});
