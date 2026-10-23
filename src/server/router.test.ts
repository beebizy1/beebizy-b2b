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
  const child = () => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() });
  return {
    eventByShareToken: vi.fn(),
    publicAgenda: vi.fn(),
    publicTickets: vi.fn(),
    publicSponsors: vi.fn().mockResolvedValue([]),
    publicFloorplan: vi.fn(),
    publicVolunteerNeeds: vi.fn().mockResolvedValue([]),
    publicRegistration: vi.fn(),
    publicVolunteerSignup: vi.fn(),
    publicAuction: vi.fn(),
    registerPublicAuctionBidder: vi.fn(),
    placePublicAuctionBid: vi.fn(),
    publicAuctionDonor: vi.fn(),
    submitPublicAuctionDonation: vi.fn(),
    publicRfp: vi.fn(),
    publicRfpResponse: vi.fn(),
    publicVendorConversation: vi.fn(),
    publicVendorReply: vi.fn(),
    publicAssignment: vi.fn(),
    publicCheckInStation: vi.fn(),
    publicAttendanceDashboard: vi.fn(),
    setPublicCheckIn: vi.fn(),
    createPublicWalkIn: vi.fn(),
    removePublicWalkIn: vi.fn(),
    completePublicAssignment: vi.fn(),
    reopenPublicAssignment: vi.fn(),
    checklist: child(),
    checkInStations: child(),
    runOfShow: { ...child(), reorder: vi.fn() },
    volunteerNeeds: child(),
    volunteers: child(),
    budget: child(),
    deposits: child(),
    vendorPaymentPlans: child(),
    menu: child(),
    moodBoard: child(),
    floorplan: { ...child(), share: vi.fn() },
    auction: child(),
    sponsorships: child(),
    eventVendors: child(),
    tickets: child(),
    raffle: child(),
    auctionDonors: child(),
    auctionManagement: {
      share: vi.fn(), updateSettings: vi.fn(), publishItem: vi.fn(), listBidders: vi.fn(), listBids: vi.fn(), sendDonorThankYou: vi.fn(),
    },
    events: {
      get: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), updateRegistrationPage: vi.fn(), remove: vi.fn(),
      sendAssignmentSummaries: vi.fn(),
    },
    vendors: { list: vi.fn() },
    registrations: { ...child(), listForEvent: vi.fn(), importGuests: vi.fn() },
    locations: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
    members: { list: vi.fn().mockResolvedValue([]), setRole: vi.fn(), remove: vi.fn() },
    canvases: { list: vi.fn().mockResolvedValue([]), get: vi.fn(), create: vi.fn() },
    analytics: { portfolio: vi.fn().mockResolvedValue({}), customReport: vi.fn().mockResolvedValue([]) },
    feedback: { list: vi.fn(), listInbox: vi.fn(), create: vi.fn(), notify: vi.fn() },
    teamUpdates: { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "update-1" }) },
    rfps: {
      list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addResponse: vi.fn(),
      setResponseStatus: vi.fn(), removeResponse: vi.fn(), inviteVendor: vi.fn(),
    },
  };
});
vi.mock("./billing", () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleStripeWebhook: vi.fn(),
}));
vi.mock("./commercePayments", () => ({
  createPublicTicketCheckout: vi.fn(),
  createBidderWalletSetup: vi.fn(),
  createStripeConnectOnboarding: vi.fn(),
  getStripeConnectStatus: vi.fn(),
  listTicketOrders: vi.fn(),
  refundTicketOrder: vi.fn(),
  closeAuctionItem: vi.fn(),
  offerAuctionSecondChance: vi.fn(),
  settleDueAuctionItems: vi.fn(),
  listAuctionOrders: vi.fn(),
  refundAuctionOrder: vi.fn(),
  getPublicTicketOrderStatus: vi.fn(),
  buildBidderBills: vi.fn(),
  sendBidderBills: vi.fn(),
  publicBidderBill: vi.fn(),
  createBidderBillCheckout: vi.fn(),
  publicFundraisingReceipt: vi.fn(),
  createDonationCheckout: vi.fn(),
  publicDonationStatus: vi.fn(),
  publicExperienceCertificate: vi.fn(),
  refundBidderBill: vi.fn(),
  sendDueBidderBillReminders: vi.fn(),
}));
vi.mock("./ticketInvitations", () => ({
  listTicketInvitations: vi.fn(),
  openTicketInvitation: vi.fn(),
  sendTicketInvitations: vi.fn(),
}));
vi.mock("./vendorEventPackets", () => ({
  sendVendorEventPackets: vi.fn(),
}));
vi.mock("./memberRoleNotifications", () => ({
  processDueMemberRoleNotifications: vi.fn(),
}));
vi.mock("./auctionOutbidNotifications", () => ({
  processDueAuctionOutbidNotifications: vi.fn(),
}));
vi.mock("./eventCopy", () => ({
  generateRegistrationCopy: vi.fn(),
  generatePostEventCopy: vi.fn(),
}));
vi.mock("./runOfShowDrafts", () => ({
  discardRunOfShowDraft: vi.fn(),
  listRunOfShowDrafts: vi.fn(),
  saveRunOfShowDraft: vi.fn(),
}));
vi.mock("./fundraisingUx", () => ({
  createAuctionCategory: vi.fn(),
  extendAuctionItem: vi.fn(),
  extendAuctionItems: vi.fn(),
  reopenAuctionItem: vi.fn(),
  fundraisingDashboard: vi.fn(),
  getFundraisingOrganizationProfile: vi.fn(),
  listAuctionCategories: vi.fn(),
  listItemSubmissions: vi.fn(),
  mergeAuctionItems: vi.fn(),
  publicItemIntake: vi.fn(),
  reinvitePastItemDonors: vi.fn(),
  submitPublicItem: vi.fn(),
  updateFundraisingOrganizationProfile: vi.fn(),
  updateItemSubmission: vi.fn(),
  publicBidderProfile: vi.fn(),
  toggleAuctionWatch: vi.fn(),
  createPublicPledge: vi.fn(),
  createDonationCampaign: vi.fn(),
  listDonationCampaigns: vi.fn(),
  publicDonationCampaign: vi.fn(),
  fundraisingReports: vi.fn(),
  previewFundraisingBroadcast: vi.fn(),
  sendFundraisingBroadcast: vi.fn(),
  sendDueClosingAlerts: vi.fn(),
  sendAllDueClosingAlerts: vi.fn(),
  sendDueYearEndStatements: vi.fn(),
  sendYearEndStatements: vi.fn(),
  recordLiveAuctionSale: vi.fn(),
  undoLiveAuctionSale: vi.fn(),
  buyNowAuctionItem: vi.fn(),
}));

const { config, handleRequest, requireScopedRoute } = await import("../../api/router");
const { authorize, HttpError, requireBeebizyOperator } = await import("./auth");
const { deposits, vendorPaymentPlans, feedback, events, registrations, members, runOfShow, eventByShareToken, publicAgenda, publicSponsors, publicFloorplan, publicVolunteerNeeds, publicAssignment, publicCheckInStation, publicAttendanceDashboard, setPublicCheckIn, createPublicWalkIn, removePublicWalkIn, completePublicAssignment, reopenPublicAssignment, publicRegistration, publicVolunteerSignup, publicRfp, publicRfpResponse, publicVendorConversation, publicVendorReply } = await import("./repos");
const { createCheckoutSession, handleStripeWebhook } = await import("./billing");
const { openTicketInvitation, sendTicketInvitations } = await import("./ticketInvitations");
const { sendVendorEventPackets } = await import("./vendorEventPackets");
const { processDueMemberRoleNotifications } = await import("./memberRoleNotifications");
const { processDueAuctionOutbidNotifications } = await import("./auctionOutbidNotifications");
const { generateRegistrationCopy, generatePostEventCopy } = await import("./eventCopy");
const { discardRunOfShowDraft, listRunOfShowDrafts, saveRunOfShowDraft } = await import("./runOfShowDrafts");
const { publicAuction, registerPublicAuctionBidder, publicAuctionDonor } = await import("./repos");
const { publicDonationStatus, sendDueBidderBillReminders } = await import("./commercePayments");
const { sendAllDueClosingAlerts, sendDueYearEndStatements } = await import("./fundraisingUx");

describe("fundraising maintenance", () => {
  it("requires the cron secret and runs both due-job families", async () => {
    vi.stubEnv("CRON_SECRET", "maintenance-secret");
    expect((await handleRequest(new Request("http://localhost/api/fundraising/maintenance"))).status).toBe(401);
    vi.mocked(sendAllDueClosingAlerts).mockResolvedValue(3);
    vi.mocked(sendDueBidderBillReminders).mockResolvedValue({ sent: 2, failed: 0 });
    vi.mocked(sendDueYearEndStatements).mockResolvedValue({ sent: 1, failed: 0 });
    const response = await handleRequest(new Request("http://localhost/api/fundraising/maintenance", { headers: { authorization: "Bearer maintenance-secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, eventsChecked: 3, reminders: { sent: 2, failed: 0 }, yearEndStatements: { sent: 1, failed: 0 } });
    vi.unstubAllEnvs();
  });
});

describe("notification maintenance", () => {
  it("requires the cron secret and retries due role notifications", async () => {
    vi.stubEnv("CRON_SECRET", "maintenance-secret");
    expect((await handleRequest(new Request("http://localhost/api/notifications/maintenance"))).status).toBe(401);
    vi.mocked(processDueMemberRoleNotifications).mockResolvedValue({ processed: 2, sent: 1, queued: 1, superseded: 0 });
    vi.mocked(processDueAuctionOutbidNotifications).mockResolvedValue({ processed: 1, sent: 0, queued: 1 });
    const response = await handleRequest(new Request("http://localhost/api/notifications/maintenance", { headers: { authorization: "Bearer maintenance-secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      roleNotifications: { processed: 2, sent: 1, queued: 1, superseded: 0 },
      outbidNotifications: { processed: 1, sent: 0, queued: 1 },
    });
    vi.unstubAllEnvs();
  });
});

describe("public donation completion", () => {
  it("returns only the token-scoped payment status and receipt link", async () => {
    vi.mocked(publicDonationStatus).mockResolvedValue({ donationId: "donation-1", status: "paid", receiptToken: "receipt-token" });
    const response = await handleRequest(new Request("http://localhost/api/public/donations/campaign-token/status/donation-1"));
    expect(response.status).toBe(200);
    expect(publicDonationStatus).toHaveBeenCalledWith("campaign-token", "donation-1");
    expect(await response.json()).toEqual({ donationId: "donation-1", status: "paid", receiptToken: "receipt-token" });
  });
});

describe("single-event collaborator routing", () => {
  const context = {
    userId: "user-annie",
    email: "annie@sevareid.com",
    workspaceId: "workspace-ccs",
    role: "member" as const,
    eventScopeId: "event-gala",
  };

  it("allows the complete assigned event workspace", () => {
    expect(() =>
      requireScopedRoute(
        context,
        ["events", "event-gala", "checklist"],
        "POST",
        { title: "Confirm catering" },
        new URL("http://localhost/api/events/event-gala/checklist"),
      ),
    ).not.toThrow();
  });

  it("hides every other event even when its id is known", () => {
    expect(() =>
      requireScopedRoute(
        context,
        ["events", "event-santa-clara", "checklist"],
        "GET",
        {},
        new URL("http://localhost/api/events/event-santa-clara/checklist"),
      ),
    ).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it("blocks workspace-wide creation and portfolio data", () => {
    expect(() =>
      requireScopedRoute(context, ["events"], "POST", {}, new URL("http://localhost/api/events")),
    ).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() =>
      requireScopedRoute(
        context,
        ["analytics", "portfolio"],
        "GET",
        {},
        new URL("http://localhost/api/analytics/portfolio"),
      ),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("allows event display data but blocks workspace directory and settings changes", () => {
    expect(() =>
      requireScopedRoute(context, ["settings"], "GET", {}, new URL("http://localhost/api/settings")),
    ).not.toThrow();
    expect(() =>
      requireScopedRoute(context, ["settings"], "PATCH", {}, new URL("http://localhost/api/settings")),
    ).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() =>
      requireScopedRoute(context, ["locations"], "POST", {}, new URL("http://localhost/api/locations")),
    ).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() =>
      requireScopedRoute(
        context,
        ["vendors", "vendor-other"],
        "PATCH",
        {},
        new URL("http://localhost/api/vendors/vendor-other"),
      ),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("allows conversations only through the scoped vendor repository checks", () => {
    expect(() =>
      requireScopedRoute(
        context,
        ["vendors", "vendor-gala", "messages"],
        "POST",
        { content: "The arrival time changed." },
        new URL("http://localhost/api/vendors/vendor-gala/messages"),
      ),
    ).not.toThrow();
  });
});

describe("workspace role changes", () => {
  it("requires a request id and routes one role change without creating another invitation", async () => {
    const context = {
      userId: "user-owner", workspaceId: "workspace-1", email: "owner@example.com", role: "owner" as const,
      eventScopeId: null,
      access: { status: "active" as const, plan: "enterprise" as const, betaStartedAt: "2026-01-01T00:00:00.000Z", betaEndsAt: "2027-01-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
    };
    const changeId = "66ee3482-cbea-4c20-a181-eddc7c9b7001";
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(members.setRole).mockResolvedValue({ member: { userId: "user-2", role: "owner" }, emailSent: true, roleChanged: true } as never);
    const response = await handleRequest(new Request("http://localhost/api/members/user-2", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "owner", changeId }),
    }));
    expect(response.status).toBe(200);
    expect(members.setRole).toHaveBeenCalledWith(context, "user-2", "owner", changeId);

    const invalid = await handleRequest(new Request("http://localhost/api/members/user-2", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "admin", changeId: "not-valid" }),
    }));
    expect(invalid.status).toBe(400);
    expect(members.setRole).toHaveBeenCalledTimes(1);
  });
});

describe("event copy assistant", () => {
  const context = {
    userId: "user-owner",
    workspaceId: "workspace-1",
    email: "owner@example.com",
    role: "owner" as const,
    eventScopeId: null,
    access: { status: "active" as const, plan: "enterprise" as const, betaStartedAt: "2026-01-01T00:00:00.000Z", betaEndsAt: "2027-01-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
  };
  const event = { id: "event-1", title: "Spring Gala" };

  it("generates editable registration-page copy from the event and agenda", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(events.get).mockResolvedValue(event as never);
    const { runOfShow } = await import("./repos");
    vi.mocked(runOfShow.list).mockResolvedValue([{ id: "cue-1", title: "Welcome" }] as never);
    vi.mocked(generateRegistrationCopy).mockResolvedValue({
      aboutHeading: "Why we are gathering",
      aboutBody: "A clear description for guests.",
      agendaIntroduction: "Here is what to expect.",
      source: "ai",
    });

    const response = await handleRequest(new Request("http://localhost/api/assistant/registration-copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "event-1", aboutHeading: "About", aboutBody: "", agendaIntroduction: "" }),
    }));

    expect(response.status).toBe(200);
    expect(generateRegistrationCopy).toHaveBeenCalledWith(expect.objectContaining({
      event,
      agenda: [{ id: "cue-1", title: "Welcome" }],
      userId: "user-owner",
    }));
  });

  it("builds post-event copy from unique attendance and recorded results", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(events.get).mockResolvedValue(event as never);
    const { checklist, budget, sponsorships } = await import("./repos");
    vi.mocked(registrations.listForEvent).mockResolvedValue([
      { id: "reg-1", status: "confirmed", checkedInAt: "2026-10-01T18:00:00.000Z", guest: { name: "Ada Lovelace" } },
      { id: "reg-2", status: "confirmed", checkedInAt: "2026-10-01T18:05:00.000Z", guest: { name: "ada lovelace" } },
      { id: "reg-3", status: "confirmed", checkedInAt: null, guest: { name: "Grace Hopper" } },
    ] as never);
    vi.mocked(checklist.list).mockResolvedValue([{ completed: true }, { completed: false }] as never);
    vi.mocked(budget.list).mockResolvedValue([{ type: "revenue", estimatedCents: 50_000, actualCents: 60_000 }] as never);
    vi.mocked(sponsorships.list).mockResolvedValue([{ status: "confirmed", amountCents: 40_000 }] as never);
    vi.mocked(generatePostEventCopy).mockResolvedValue({ subject: "Thank you", thankYouMessage: "Thank you for joining us.", wrapUp: "One unique guest checked in.", source: "ai" });

    const response = await handleRequest(new Request("http://localhost/api/assistant/post-event-copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));

    expect(response.status).toBe(200);
    expect(generatePostEventCopy).toHaveBeenCalledWith(expect.objectContaining({
      facts: expect.objectContaining({ uniqueRegistered: 2, uniqueCheckedIn: 1, checklistDone: 1, checklistTotal: 2, revenueCents: 100_000 }),
      userId: "user-owner",
    }));
  });

  it("does not report estimated or pending revenue as money raised", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(events.get).mockResolvedValue(event as never);
    const { checklist, budget, sponsorships } = await import("./repos");
    vi.mocked(registrations.listForEvent).mockResolvedValue([]);
    vi.mocked(checklist.list).mockResolvedValue([]);
    vi.mocked(budget.list).mockResolvedValue([{ type: "revenue", estimatedCents: 900_000, actualCents: null }] as never);
    vi.mocked(sponsorships.list).mockResolvedValue([{ status: "pending", amountCents: 500_000 }] as never);
    vi.mocked(generatePostEventCopy).mockResolvedValue({ subject: "Thank you", thankYouMessage: "Thank you.", wrapUp: "No revenue recorded.", source: "fallback" });

    const response = await handleRequest(new Request("http://localhost/api/assistant/post-event-copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "event-1" }),
    }));

    expect(response.status).toBe(200);
    expect(generatePostEventCopy).toHaveBeenCalledWith(expect.objectContaining({ facts: expect.objectContaining({ revenueCents: 0 }) }));
  });

  it("returns not found instead of generating copy for a removed event", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(events.get).mockResolvedValue(null);
    vi.mocked(generateRegistrationCopy).mockClear();
    const response = await handleRequest(new Request("http://localhost/api/assistant/registration-copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "missing", aboutHeading: "", aboutBody: "", agendaIntroduction: "" }),
    }));
    expect(response.status).toBe(404);
    expect(generateRegistrationCopy).not.toHaveBeenCalled();
  });

  it("routes a field-level registration-page update without replacing the whole page", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(events.updateRegistrationPage).mockResolvedValue(event as never);
    const response = await handleRequest(new Request("http://localhost/api/events/event-1/registration-page", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postEventThankYou: "Saved independently" }),
    }));
    expect(response.status).toBe(200);
    expect(events.updateRegistrationPage).toHaveBeenCalledWith(context, "event-1", { postEventThankYou: "Saved independently" });
  });
});

describe("run of show server drafts", () => {
  const context = {
    userId: "user-owner", workspaceId: "workspace-1", email: "owner@example.com", role: "owner" as const,
    eventScopeId: null,
    access: { status: "active" as const, plan: "enterprise" as const, betaStartedAt: "2026-01-01T00:00:00.000Z", betaEndsAt: "2027-01-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
  };
  const draft = { dayNumber: 1, startTime: "09:00", title: "Doors open", duration: "15", assignee: "Mary", description: "Welcome guests" };

  it("lists and saves a user-scoped draft", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(listRunOfShowDrafts).mockResolvedValue([]);
    expect((await handleRequest(new Request("http://localhost/api/events/event-1/run-of-show-drafts"))).status).toBe(200);
    expect(listRunOfShowDrafts).toHaveBeenCalledWith(context, "event-1");

    vi.mocked(saveRunOfShowDraft).mockResolvedValue({ draftKey: "new-1", draft, clientUpdatedAt: 1000, updatedAt: "2026-10-16T12:00:00.000Z" });
    const response = await handleRequest(new Request("http://localhost/api/events/event-1/run-of-show-drafts/new-1", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft, clientUpdatedAt: 1000 }),
    }));
    expect(response.status).toBe(200);
    expect(saveRunOfShowDraft).toHaveBeenCalledWith(context, "event-1", "new-1", draft, 1000);
  });

  it("writes a discard tombstone so a delayed save cannot resurrect a cleared draft", async () => {
    vi.mocked(authorize).mockResolvedValue(context);
    const response = await handleRequest(new Request("http://localhost/api/events/event-1/run-of-show-drafts/cue-1", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ discarded: true, clientUpdatedAt: 2000 }),
    }));
    expect(response.status).toBe(200);
    expect(discardRunOfShowDraft).toHaveBeenCalledWith(context, "event-1", "cue-1", 2000);
  });
});

describe("run of show ordering", () => {
  it("routes one complete day order to the atomic reorder operation", async () => {
    const context = {
      userId: "user-owner", workspaceId: "workspace-1", email: "owner@example.com", role: "owner" as const,
      eventScopeId: null,
      access: { status: "active" as const, plan: "enterprise" as const, betaStartedAt: "2026-01-01T00:00:00.000Z", betaEndsAt: "2027-01-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
    };
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(runOfShow.reorder).mockResolvedValue([]);
    const response = await handleRequest(new Request("http://localhost/api/events/event-1/run-of-show-order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayNumber: 2, orderedIds: ["cue-2", "cue-1"] }),
    }));

    expect(response.status).toBe(200);
    expect(runOfShow.reorder).toHaveBeenCalledWith(context, "event-1", 2, ["cue-2", "cue-1"]);
  });
});

function leadRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/lead", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("private vendor links", () => {
  it("opens a token-scoped RFP without a login", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicRfp).mockResolvedValue({ vendorName: "Venue" } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/rfps/private-token"));
    expect(response.status).toBe(200);
    expect(publicRfp).toHaveBeenCalledWith("private-token");
    expect(authorize).not.toHaveBeenCalled();
    vi.mocked(publicRfp).mockResolvedValue(null);
    expect((await handleRequest(new Request("http://localhost/api/public/rfps/expired"))).status).toBe(404);
  });

  it("validates proposals and strips client-supplied approval or vendor identity", async () => {
    vi.mocked(publicRfpResponse).mockClear();
    const request = (body: unknown) => new Request("http://localhost/api/public/rfps/private-token/responses", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    expect((await handleRequest(request({ contactEmail: "bad" }))).status).toBe(400);
    expect(publicRfpResponse).not.toHaveBeenCalled();
    const draft = { contactName: "Ada", contactEmail: "ada@example.com", quotedAmountCents: 10000, notes: "Includes setup" };
    vi.mocked(publicRfpResponse).mockResolvedValue({ id: "response" } as never);
    expect((await handleRequest(request({ ...draft, status: "accepted", vendorName: "Spoofed" }))).status).toBe(201);
    expect(publicRfpResponse).toHaveBeenCalledWith("private-token", draft);
  });

  it("reads and replies through a private conversation without opening authenticated routes", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicVendorConversation).mockResolvedValue({ vendorName: "Venue", messages: [] });
    vi.mocked(publicVendorReply).mockResolvedValue(undefined);
    const url = "http://localhost/api/public/vendor-conversations/private-token";
    expect((await handleRequest(new Request(url))).status).toBe(200);
    expect((await handleRequest(new Request(url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "Confirmed" }),
    }))).status).toBe(201);
    expect(publicVendorReply).toHaveBeenCalledWith("private-token", { content: "Confirmed" });
    expect(authorize).not.toHaveBeenCalled();
  });
});

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

  it("carries the plan and what they wrote into the email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("MAIL_TO", "hello@beebizy.com");
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    const sendEmail = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"email-2"}', { status: 200 }));

    const notes = "Four galas and a summit. ".repeat(40);
    const response = await handleRequest(
      leadRequest("POST", {
        name: "Grace",
        email: "grace@example.com",
        company: "Northwind",
        phone: "555-0100",
        plan: "Enterprise (Colony)",
        notes,
      }),
    );
    expect(response.status).toBe(200);

    const sent = JSON.parse(String((sendEmail.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(sent.subject).toBe("Enterprise (Colony) enquiry - Northwind");
    expect(sent.to).toEqual(["hello@beebizy.com"]);
    expect(sent.reply_to).toBe("grace@example.com");
    for (const detail of ["Grace", "grace@example.com", "Northwind", "555-0100", "Enterprise (Colony)"]) {
      expect(sent.text).toContain(detail);
    }
    // The message survives past the 200-character cap the short fields use.
    expect(sent.text).toContain(notes.trim().slice(0, 400));

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

describe("public assignment endpoint", () => {
  it("returns one active assignment without requiring a user session", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicAssignment).mockResolvedValue({
      kind: "volunteer",
      eventTitle: "Demo Day",
      eventDate: "2026-09-21T16:00:00.000Z",
      eventEndDate: "2026-09-21T20:00:00.000Z",
      timeZone: "America/Los_Angeles",
      location: "Mission Gardens",
      assignee: "Ada",
      title: "Welcome desk",
      description: "Check in guests at the east entrance.",
      dueDate: null,
      dueDateCivil: null,
      dayNumber: 1,
      completed: false,
      appPath: "/app/events/event-1/volunteers?shift=vol-1",
      startTime: "08:00",
      endTime: "12:00",
      endDayOffset: 0,
    });

    const response = await handleRequest(new Request("http://localhost/api/public/assignments/assignment-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Welcome desk", assignee: "Ada" });
    expect(publicAssignment).toHaveBeenCalledWith("assignment-token");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("returns 404 when an assignment link is inactive", async () => {
    vi.mocked(publicAssignment).mockResolvedValue(null);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/expired-token"));
    expect(response.status).toBe(404);
  });

  it("lets a checklist assignee complete only the item addressed by their private link", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(completePublicAssignment).mockResolvedValue({
      kind: "checklist", title: "Book Venue", completed: true,
    } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/assignment-token/complete", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Book Venue", completed: true });
    expect(completePublicAssignment).toHaveBeenCalledWith("assignment-token");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("does not complete an item through an inactive or volunteer assignment link", async () => {
    vi.mocked(completePublicAssignment).mockResolvedValue(null);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/expired-token/complete", {
      method: "POST",
    }));
    expect(response.status).toBe(404);
  });

  it("uses the same private completion endpoint for a volunteer shift", async () => {
    vi.mocked(completePublicAssignment).mockResolvedValue({
      kind: "volunteer", title: "Welcome desk", completed: true,
    } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/complete", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "volunteer", completed: true });
    expect(completePublicAssignment).toHaveBeenCalledWith("volunteer-token");
  });

  it("uses the same private completion endpoint for a run-of-show cue", async () => {
    vi.mocked(completePublicAssignment).mockResolvedValue({
      kind: "run-of-show", title: "Doors open", completed: true,
    } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/cue-token/complete", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "run-of-show", completed: true });
    expect(completePublicAssignment).toHaveBeenCalledWith("cue-token");
  });

  it.each([
    ["checklist", "assignment-token", "Book Venue"],
    ["run-of-show", "cue-token", "Doors open"],
    ["volunteer", "volunteer-token", "Welcome desk"],
  ] as const)("lets a %s assignee undo an accidental completion through the same private link", async (kind, token, title) => {
    vi.mocked(reopenPublicAssignment).mockResolvedValue({
      kind, title, completed: false,
    } as never);
    const response = await handleRequest(new Request(`http://localhost/api/public/assignments/${token}/reopen`, {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind, title, completed: false });
    expect(reopenPublicAssignment).toHaveBeenCalledWith(token);
  });

  it("does not reopen an assignment through an inactive private link", async () => {
    vi.mocked(reopenPublicAssignment).mockResolvedValue(null);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/expired-token/reopen", {
      method: "POST",
    }));
    expect(response.status).toBe(404);
  });

  it("returns the complete A-Z guest list through every shared event-day link", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicCheckInStation).mockResolvedValue({
      eventTitle: "Demo Day",
      eventDate: "2026-09-21T16:00:00.000Z",
      timeZone: "America/Los_Angeles",
      location: "Mission Gardens",
      volunteer: { name: "Volunteer 2" },
      station: { id: "station-2", name: "Counter 2", lane: "Last names E-H" },
      guests: [{
        registrationId: "reg-goyal",
        name: "Tarang Goyal",
        organization: "Beebizy",
        segment: "General",
        status: "confirmed",
        checkedInAt: null,
        checkInStation: null,
        removable: false,
      }],
    });

    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      volunteer: { name: "Volunteer 2" },
      station: { lane: "Last names E-H" },
      guests: [{ name: "Tarang Goyal" }],
    });
    expect(publicCheckInStation).toHaveBeenCalledWith("volunteer-token");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("checks in or undoes only the registration addressed by the station link", async () => {
    vi.mocked(setPublicCheckIn).mockResolvedValue({
      registrationId: "reg-goyal",
      name: "Tarang Goyal",
      organization: "Beebizy",
      segment: "General",
      status: "confirmed",
      checkedInAt: "2026-09-21T16:05:00.000Z",
      checkInStation: "Counter 2",
      removable: false,
    });

    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in/reg-goyal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkedIn: true }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ registrationId: "reg-goyal", checkedInAt: expect.any(String) });
    expect(setPublicCheckIn).toHaveBeenCalledWith("volunteer-token", "reg-goyal", true);
  });

  it("registers, checks in and returns a name-only walk-in for immediate badge printing", async () => {
    vi.mocked(createPublicWalkIn).mockResolvedValue({
      registrationId: "reg-walk-in",
      name: "Ada Lovelace",
      organization: null,
      segment: "Walk-in",
      status: "confirmed",
      checkedInAt: "2026-09-21T16:10:00.000Z",
      checkInStation: "Counter 3",
      removable: true,
    });

    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in/walk-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada Lovelace" }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: "Ada Lovelace", checkedInAt: expect.any(String) });
    expect(createPublicWalkIn).toHaveBeenCalledWith("volunteer-token", "Ada Lovelace");
  });

  it("removes a walk-in through the shared desk", async () => {
    vi.mocked(removePublicWalkIn).mockResolvedValue(true);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in/walk-ins/reg-walk-in", {
      method: "DELETE",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true });
    expect(removePublicWalkIn).toHaveBeenCalledWith("volunteer-token", "reg-walk-in");
  });

  it("refuses to remove a registered guest through the shared desk", async () => {
    vi.mocked(removePublicWalkIn).mockResolvedValue(false);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in/walk-ins/reg-registered", {
      method: "DELETE",
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Only walk-ins can be removed from this check-in desk." });
    expect(removePublicWalkIn).toHaveBeenCalledWith("volunteer-token", "reg-registered");
  });

  it("rejects an inactive or out-of-range check-in link without exposing a guest", async () => {
    vi.mocked(setPublicCheckIn).mockResolvedValue(null);
    const response = await handleRequest(new Request("http://localhost/api/public/assignments/volunteer-token/check-in/reg-outside-range", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkedIn: false }),
    }));
    expect(response.status).toBe(404);
  });
});

describe("public attendance dashboard", () => {
  it("returns aggregate attendance without authorizing or exposing attendee records", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicAttendanceDashboard).mockResolvedValue({
      eventTitle: "SCU Demo Day 2026",
      eventDate: "2026-10-10T01:00:00.000Z",
      timeZone: "America/Los_Angeles",
      generatedAt: "2026-10-12T18:00:00.000Z",
      summary: {
        registrationRows: 912,
        uniqueRegistered: 850,
        checkedInRows: 550,
        uniqueCheckedIn: 533,
        duplicateCheckedInRows: 17,
        noShows: 317,
        attendanceRate: 62.7,
      },
      guestTypes: [{ label: "General", count: 300 }],
      registrationSources: [{ label: "Imported registration", count: 148 }],
    });

    const response = await handleRequest(new Request("http://localhost/api/public/attendance/public-dashboard-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ summary: { uniqueCheckedIn: 533, duplicateCheckedInRows: 17 } });
    expect(JSON.stringify(body)).not.toMatch(/email|guestId|registrationId|name/i);
    expect(publicAttendanceDashboard).toHaveBeenCalledWith("public-dashboard-token");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("returns 404 for an inactive attendance dashboard link", async () => {
    vi.mocked(publicAttendanceDashboard).mockResolvedValue(null);
    const response = await handleRequest(new Request("http://localhost/api/public/attendance/inactive"));
    expect(response.status).toBe(404);
  });
});

describe("public event signup endpoints", () => {
  it("does not fetch internal schedule or volunteer coverage for disabled public sections", async () => {
    vi.mocked(eventByShareToken).mockResolvedValue({
      event: {
        id: "event-1",
        registrationPage: { showAgenda: false, showSponsors: false, showVolunteerSignup: false },
      } as never,
      timeZone: "America/Los_Angeles",
    });
    vi.mocked(publicAgenda).mockClear();
    vi.mocked(publicVolunteerNeeds).mockClear();
    const response = await handleRequest(new Request("http://localhost/api/public/events/share-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      agenda: [],
      sponsors: [],
      volunteerNeeds: [],
    });
    expect(publicAgenda).not.toHaveBeenCalled();
    expect(publicSponsors).not.toHaveBeenCalled();
    expect(publicVolunteerNeeds).not.toHaveBeenCalled();
  });

  it("returns one isolated floorplan through its own token without authorizing", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicFloorplan).mockResolvedValue({
      eventTitle: "Gala",
      eventDate: "2026-10-18T18:00:00.000Z",
      floorplan: { id: "floorplan-1", eventId: "event-1", name: "Ballroom", items: [], updatedAt: "2026-10-14T00:00:00.000Z" },
    });
    const response = await handleRequest(new Request("http://localhost/api/public/floorplans/floorplan-token"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ floorplan: { id: "floorplan-1", name: "Ballroom" } });
    expect(publicFloorplan).toHaveBeenCalledWith("floorplan-token");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("registers one guest without requiring a user session", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicRegistration).mockResolvedValue({ id: "reg-1" } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/events/share-1/registrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", email: "ada@example.com", segment: "Investor" }),
    }));
    expect(response.status).toBe(201);
    expect(publicRegistration).toHaveBeenCalledWith("share-1", {
      name: "Ada", email: "ada@example.com", segment: "Investor",
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("claims a volunteer opening without requiring a user session", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicVolunteerSignup).mockResolvedValue({ id: "vol-1" } as never);
    const response = await handleRequest(new Request("http://localhost/api/public/events/share-1/volunteers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needId: "need-1", name: "Grace", email: "grace@example.com" }),
    }));
    expect(response.status).toBe(201);
    expect(publicVolunteerSignup).toHaveBeenCalledWith("share-1", {
      needId: "need-1", name: "Grace", email: "grace@example.com",
    });
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe("public commerce endpoints", () => {
  it("serves a public auction and registers bidders without a login", async () => {
    vi.mocked(authorize).mockClear();
    vi.mocked(publicAuction).mockResolvedValue({ eventTitle: "Gala", items: [] } as never);
    vi.mocked(registerPublicAuctionBidder).mockResolvedValue({ id: "bidder-1" } as never);

    const catalog = await handleRequest(new Request("http://localhost/api/public/auctions/auction-token"));
    const registration = await handleRequest(new Request("http://localhost/api/public/auctions/auction-token/bidders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", email: "ada@example.com", participantType: "remote" }),
    }));

    expect(catalog.status).toBe(200);
    expect(registration.status).toBe(201);
    expect(registerPublicAuctionBidder).toHaveBeenCalledWith("auction-token", {
      name: "Ada", email: "ada@example.com", participantType: "remote",
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("opens donor intake and redirects unique ticket invitations", async () => {
    vi.mocked(publicAuctionDonor).mockResolvedValue({ eventTitle: "Gala", items: [] } as never);
    vi.mocked(openTicketInvitation).mockResolvedValue("/e/share-token/tickets?invite=invite-token");

    const donor = await handleRequest(new Request("http://localhost/api/public/auction-donors/donor-token"));
    const invitation = await handleRequest(new Request("http://localhost/api/public/ticket-invitations/invite-token"));

    expect(donor.status).toBe(200);
    expect(invitation.status).toBe(302);
    expect(invitation.headers.get("location")).toBe("http://localhost/e/share-token/tickets?invite=invite-token");
  });
});

describe("workspace member ticket invitations", () => {
  it("allows a full workspace member to send the event's invitations", async () => {
    const context = {
      userId: "user-laila",
      workspaceId: "workspace-school",
      email: "laila@beebizy.com",
      role: "member" as const,
      eventScopeId: null,
      access: { status: "beta" as const, plan: null, betaStartedAt: "2026-09-01T00:00:00.000Z", betaEndsAt: "2026-12-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
    };
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(sendTicketInvitations).mockResolvedValue({ attempted: 1, sent: 1, failed: 0, invitations: [] });
    const response = await handleRequest(new Request("http://localhost/api/events/event-gala/ticket-invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipients: [{ name: "Laila", email: "laila@beebizy.com" }], consentConfirmed: true }),
    }));
    expect(response.status).toBe(201);
    expect(sendTicketInvitations).toHaveBeenCalledWith(context, "event-gala", [{ name: "Laila", email: "laila@beebizy.com" }], true, expect.any(Request), false);
  });

  it("marks a test delivery so it does not count as a real invitation", async () => {
    vi.mocked(authorize).mockResolvedValue({ userId: "user-laila", workspaceId: "workspace-school", email: "laila@beebizy.com", role: "member", access: { status: "beta", plan: null, betaStartedAt: "2026-09-01T00:00:00.000Z", betaEndsAt: "2026-12-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false } });
    vi.mocked(sendTicketInvitations).mockResolvedValue({ attempted: 1, sent: 1, failed: 0, invitations: [] });
    const response = await handleRequest(new Request("http://localhost/api/events/event-gala/ticket-invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipients: [{ name: "Laila", email: "laila@beebizy.com" }], consentConfirmed: true, testOnly: true }) }));
    expect(response.status).toBe(201);
    expect(sendTicketInvitations).toHaveBeenCalledWith(expect.anything(), "event-gala", [{ name: "Laila", email: "laila@beebizy.com" }], true, expect.any(Request), true);
  });
});

describe("vendor event packet endpoint", () => {
  it("validates and routes one private email per selected event vendor", async () => {
    const context = {
      userId: "user-laila", workspaceId: "workspace-school", email: "laila@beebizy.com", role: "member" as const,
      eventScopeId: null,
      access: { status: "beta" as const, plan: null, betaStartedAt: "2026-09-01T00:00:00.000Z", betaEndsAt: "2026-12-01T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false },
    };
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(sendVendorEventPackets).mockResolvedValue({ sent: 1, failed: 0, skipped: 0, attachmentNames: ["packet.pdf"], deliveries: [] });
    const draft = {
      vendorIds: ["vendor-1"], subject: "Final details", message: "Please review.", includeRunOfShow: true,
      floorplanIds: ["plan-1"], requestId: "66ee3482-cbea-4c20-a181-eddc7c9b7001", consentConfirmed: true, testEmail: null,
    };
    const response = await handleRequest(new Request("http://localhost/api/events/event-gala/vendor-packets", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft),
    }));
    expect(response.status).toBe(201);
    expect(sendVendorEventPackets).toHaveBeenCalledWith(context, "event-gala", draft);
  });

  it("requires a vendor unless this is a test email", async () => {
    const response = await handleRequest(new Request("http://localhost/api/events/event-gala/vendor-packets", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        vendorIds: [], subject: "Final details", message: "Please review.", includeRunOfShow: false,
        floorplanIds: [], requestId: "66ee3482-cbea-4c20-a181-eddc7c9b7001", consentConfirmed: false, testEmail: null,
      }),
    }));
    expect(response.status).toBe(400);
    expect(sendVendorEventPackets).toHaveBeenCalledTimes(1);
  });
});

describe("guest spreadsheet import endpoint", () => {
  it("routes a 700-row spreadsheet through one atomic import operation", async () => {
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
    vi.mocked(authorize).mockResolvedValue(context);
    vi.mocked(registrations.importGuests).mockResolvedValue([] as never);
    const rows = Array.from({ length: 700 }, (_, index) => ({
      eventId: "event-1",
      name: `Guest ${index + 1}`,
      contact: `guest-${index + 1}@example.com`,
      quantity: 1,
    }));

    const response = await handleRequest(new Request("http://localhost/api/registrations/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    }));

    expect(response.status).toBe(201);
    expect(registrations.importGuests).toHaveBeenCalledTimes(1);
    expect(registrations.importGuests).toHaveBeenCalledWith(context, { rows });
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

  it("returns the focused experience for a verified Santa Clara account", async () => {
    vi.mocked(authorize).mockResolvedValue({ ...context, email: "ccismasflorea@scu.edu" });
    const response = await handleRequest(new Request("http://localhost/api/me"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      userId: context.userId,
      workspaceId: context.workspaceId,
      experience: "santa-clara",
    });
  });

  it("allows approved Beebizy product operators to preview another account experience", async () => {
    vi.mocked(authorize).mockResolvedValueOnce({ ...context, email: "tarang@beebizy.com" });
    const tarang = await handleRequest(new Request("http://localhost/api/me"));

    vi.mocked(authorize).mockResolvedValueOnce({ ...context, email: "mary@beebizy.com" });
    const mary = await handleRequest(new Request("http://localhost/api/me"));

    expect(await tarang.json()).toMatchObject({
      experience: "standard",
      canSwitchExperience: true,
    });
    expect(await mary.json()).toMatchObject({
      experience: "standard",
      canSwitchExperience: true,
    });
  });

  it("keeps an event-only collaborator on the standard product and names only their event", async () => {
    vi.mocked(events.get).mockResolvedValue({ id: "event-gala", title: "Celebrate CCS Gala" } as never);
    vi.mocked(authorize).mockResolvedValue({
      ...context,
      email: "annie@sevareid.com",
      eventScopeId: "event-gala",
    });

    const response = await handleRequest(new Request("http://localhost/api/me"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      experience: "standard",
      canSwitchExperience: false,
      eventScope: { id: "event-gala", title: "Celebrate CCS Gala" },
    });
  });

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

  it("lets an operator email an existing feedback item to the monitored inbox", async () => {
    vi.mocked(authorize).mockResolvedValue({ ...context, email: "tarang@beebizy.com" });
    vi.mocked(requireBeebizyOperator).mockReturnValue(undefined);
    vi.mocked(feedback.notify).mockResolvedValue({ status: "sent" });

    const response = await handleRequest(
      new Request("http://localhost/api/feedback/feedback-1/notify", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(feedback.notify).toHaveBeenCalledWith(expect.objectContaining({ email: "tarang@beebizy.com" }), "feedback-1");
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

  it("creates monthly checkout and ignores client price ids", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    vi.mocked(createCheckoutSession).mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const request = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval: "month", priceId: "price_attacker_supplied" }),
    });

    const response = await handleRequest(request);

    expect(response.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(owner, "month", request);
  });

  it("rejects unadvertised billing intervals", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    const response = await handleRequest(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval: "year" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Solo is billed monthly." });
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
    for (const path of ["locations", "members", "boards", "analytics/portfolio"]) {
      expect((await handleRequest(new Request(`http://localhost/api/${path}`))).status).toBe(200);
    }
    expect((await handleRequest(new Request("http://localhost/api/boards", { method: "POST" }))).status).toBe(201);
    expect((await handleRequest(new Request("http://localhost/api/locations", { method: "POST" }))).status).toBe(403);
    expect((await handleRequest(new Request("http://localhost/api/analytics/custom-report"))).status).toBe(403);
    expect((await handleRequest(new Request("http://localhost/api/vendors"))).status).toBe(403);

    vi.mocked(authorize).mockResolvedValue({ ...owner, access: { ...owner.access, plan: "enterprise" } });
    expect((await handleRequest(new Request("http://localhost/api/boards"))).status).toBe(200);
    expect((await handleRequest(new Request("http://localhost/api/analytics/custom-report"))).status).toBe(200);
  });

  it("reads and posts live updates through the event route", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    const list = await handleRequest(new Request("http://localhost/api/events/evt-1/updates"));
    const create = await handleRequest(new Request("http://localhost/api/events/evt-1/updates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "schedule", message: "Doors move to 8 AM" }),
    }));
    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
  });

  it("persists deposit reads and writes through the event route", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    vi.mocked(deposits.list).mockResolvedValue([]);
    vi.mocked(deposits.create).mockResolvedValue({ id: "dep-1" } as never);

    const list = await handleRequest(new Request("http://localhost/api/events/evt-1/deposits"));
    const create = await handleRequest(new Request("http://localhost/api/events/evt-1/deposits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendorName: "Venue", amountCents: 50000, status: "pending" }),
    }));

    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(deposits.list).toHaveBeenCalledWith(owner, "evt-1");
    expect(deposits.create).toHaveBeenCalledWith(owner, "evt-1", {
      vendorName: "Venue",
      amountCents: 50000,
      status: "pending",
    });
  });

  it("persists vendor payment plans through the event route", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    vi.mocked(vendorPaymentPlans.list).mockResolvedValue([]);
    vi.mocked(vendorPaymentPlans.create).mockResolvedValue({ id: "vpp-1" } as never);

    const list = await handleRequest(new Request("http://localhost/api/events/evt-1/vendor-payment-plans"));
    const create = await handleRequest(new Request("http://localhost/api/events/evt-1/vendor-payment-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendorName: "Venue", totalAmountCents: 250000, balanceDueDate: "2026-12-01T12:00:00.000Z" }),
    }));

    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(vendorPaymentPlans.list).toHaveBeenCalledWith(owner, "evt-1");
    expect(vendorPaymentPlans.create).toHaveBeenCalledWith(owner, "evt-1", {
      vendorName: "Venue",
      totalAmountCents: 250000,
      balanceDueDate: "2026-12-01T12:00:00.000Z",
    });
  });

  it("sends consolidated responsibility summaries through the event route", async () => {
    vi.mocked(authorize).mockResolvedValue(owner);
    vi.mocked(events.sendAssignmentSummaries).mockResolvedValue({
      recipients: 2, assignments: 5, missingEmail: 1, sent: 2, failed: 0,
    });

    const response = await handleRequest(new Request("http://localhost/api/events/evt-1/assignment-summaries", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(events.sendAssignmentSummaries).toHaveBeenCalledWith(owner, "evt-1");
    expect(await response.json()).toMatchObject({ recipients: 2, assignments: 5, sent: 2 });
  });
});
