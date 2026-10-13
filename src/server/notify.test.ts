import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyAssignmentSummary,
  notifyFeedbackSubmission,
  notifyRegistrationConfirmation,
  notifyTicketOrderConfirmation,
  notifyTicketInvitation,
  notifyAuctionOutbid,
  notifyAuctionDonorThankYou,
  notifyExperienceCertificate,
  notifyTeamUpdate,
  notifyVolunteerAssignment,
  notifyWorkAssignment,
} from "./notify";

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
      dayNumber: 2,
      startTime: "08:00",
      endTime: "12:00",
      url: "https://beebizy.test/app/events/one/volunteers",
    })).toEqual({ status: "sent" });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ to: ["volunteer@example.com"], subject: "Your Welcome desk shift - Demo Day" });
    expect(body.text).toContain("Shift: Day 2, 08:00–12:00");
    expect(body.text).toContain("mark it complete");
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

  it("consolidates every open responsibility into one email for the person", async () => {
    const fetch = configureDelivery();
    expect(await notifyAssignmentSummary({
      to: "ada@example.com",
      assigneeName: "Ada",
      eventTitle: "Demo Day",
      items: [
        { kind: "Checklist", title: "Confirm catering", timing: "Due Oct 5, 2026", url: "https://beebizy.test/assignment/task" },
        { kind: "Run of show", title: "Open doors", timing: "Day 1 at 08:30", url: "https://beebizy.test/assignment/cue" },
      ],
    })).toEqual({ status: "sent" });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ to: ["ada@example.com"], subject: "Your responsibilities - Demo Day" });
    expect(body.text).toContain("1. Confirm catering");
    expect(body.text).toContain("2. Open doors");
    expect(body.text).toContain("opens the exact assignment");
  });

  it("immediately emails a newly assigned checklist task with its private completion link", async () => {
    const fetch = configureDelivery();
    expect(await notifyWorkAssignment({
      assignmentId: "cl-123",
      kind: "Checklist",
      to: "laila@beebizy.com",
      assigneeName: "Laila Marshall",
      eventTitle: "Mrs. Bench Influencer Event",
      title: "Book Boba Bar",
      timing: "Due Oct 5, 2026",
      url: "https://beebizy.test/assignment/task-token",
    })).toEqual({ status: "sent" });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      to: ["laila@beebizy.com"],
      reply_to: "hello@beebizy.com",
      subject: "Checklist assignment - Mrs. Bench Influencer Event",
    });
    expect(body.text).toContain("Book Boba Bar");
    expect(body.text).toContain("mark it complete");
    expect(body.text).toContain("https://beebizy.test/assignment/task-token");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe(
      "work-assignment-Checklist-cl-123-laila@beebizy.com",
    );
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

describe("ticket order confirmation email", () => {
  it("sends an accessible branded receipt with a plain-text alternative and stable key", async () => {
    const fetch = configureDelivery();
    expect(await notifyTicketOrderConfirmation({
      orderId: "tord-123",
      to: "buyer@example.com",
      buyerName: "Tarang Goyal",
      eventTitle: "School Gala",
      ticketName: "General admission",
      quantity: 2,
      amountCents: 20_000,
      applicationFeeCents: 400,
      startsAt: "2026-11-01T01:00:00.000Z",
      timeZone: "America/Los_Angeles",
    })).toEqual({ status: "sent" });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("Total paid: $200.00");
    expect(body.html).toContain('<html lang="en" dir="ltr">');
    expect(body.html).toContain('role="presentation"');
    expect(body.html).toContain("Your tickets are confirmed");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("ticket-order-confirmation-tord-123");
  });
});

describe("ticket and auction action emails", () => {
  it("attaches a generated PDF to an experience certificate email", async () => {
    const fetch = configureDelivery();
    await notifyExperienceCertificate({
      orderId: "order-certificate-1",
      to: "winner@example.com",
      winnerName: "Diego Rivera",
      eventTitle: "School Gala",
      itemTitle: "Tahoe Weekend",
      organizationName: "Cedar Grove School",
      certificateUrl: "https://beebizy.test/certificate/one",
    });
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("attached as a PDF");
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toMatchObject({ filename: "Tahoe-Weekend-certificate.pdf" });
    expect(body.attachments[0].content).toMatch(/^JVBER/);
  });

  it("sends an accessible ticket invitation with a descriptive action", async () => {
    const fetch = configureDelivery();
    await notifyTicketInvitation({
      invitationId: "invite-1", to: "guest@example.com", recipientName: "Ada",
      eventTitle: "School Gala", startsAt: "2026-11-01T01:00:00.000Z",
      timeZone: "America/Los_Angeles", invitationUrl: "https://beebizy.test/invite/one",
    });
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.html).toContain(">Choose a ticket</a>");
    expect(body.text).toContain("Choose a free or paid ticket");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("ticket-invitation-invite-1");
  });

  it("sends the saved invitation design and permits an intentional resend", async () => {
    const fetch = configureDelivery();
    await notifyTicketInvitation({
      invitationId: "invite-2", to: "laila@example.com", recipientName: "Laila",
      eventTitle: "School Gala", startsAt: "2026-11-01T01:00:00.000Z",
      timeZone: "America/Los_Angeles", invitationUrl: "https://beebizy.test/invite/two",
      headline: "An evening under the stars", welcomeMessage: "Join our school community.",
      designedHtml: "<html><body><h1>Designed invitation</h1></body></html>",
      deliveryAttemptKey: "attempt-2",
    });
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.subject).toContain("An evening under the stars");
    expect(body.text).toContain("Join our school community.");
    expect(body.html).toContain("Designed invitation");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("ticket-invitation-invite-2-attempt-2");
  });

  it("uses the bid event as the idempotency key for outbid alerts", async () => {
    const fetch = configureDelivery();
    await notifyAuctionOutbid({
      bidId: "bid-2", to: "bidder@example.com", bidderName: "Grace", eventTitle: "Gala",
      itemTitle: "Dinner", currentBidCents: 8_500, auctionUrl: "https://beebizy.test/auction/one",
    });
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("$85.00");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("auction-outbid-bid-2-bidder@example.com");
  });

  it("acknowledges donated property without assigning a dollar value", async () => {
    const fetch = configureDelivery();
    await notifyAuctionDonorThankYou({
      donorId: "donor-1",
      to: "donor@example.com",
      contactName: "Ada",
      donorName: "Ada's Bakery",
      eventTitle: "School Gala",
      itemTitles: ["Private baking class"],
      receivedDate: "October 12, 2026",
    });
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.text).toContain("Property received: Private baking class");
    expect(body.text).toContain("No dollar value is stated");
    expect(body.text).not.toMatch(/fair market value|\$\d/i);
  });
});

describe("registration confirmation email", () => {
  it("sends event details and a stable delivery key to the registered guest", async () => {
    const fetch = configureDelivery();

    expect(await notifyRegistrationConfirmation({
      registrationId: "reg-123",
      to: "guest@example.com",
      guestName: "Ada Lovelace",
      eventTitle: "Demo Day",
      segment: "Investor",
      startsAt: "2026-10-18T21:00:00.000Z",
      endsAt: "2026-10-19T00:00:00.000Z",
      timeZone: "America/Los_Angeles",
      location: "Mission Hall, Santa Clara",
      eventUrl: "https://beebizy.test/e/demo-day",
    })).toEqual({ status: "sent" });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      to: ["guest@example.com"],
      reply_to: "hello@beebizy.com",
      subject: "Registration confirmed - Demo Day",
    });
    expect(body.text).toContain("Hi Ada Lovelace,");
    expect(body.text).toContain("Guest type: Investor");
    expect(body.text).toContain("Mission Hall, Santa Clara");
    expect(body.text).toContain("https://beebizy.test/e/demo-day");
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe("registration-confirmation-reg-123");
  });
});
