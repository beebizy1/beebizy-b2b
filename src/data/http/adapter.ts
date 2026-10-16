/**
 * The `DataAdapter` implementation that talks to the API.
 *
 * This is the payoff for the seam. Screens are untouched: they still call `useData()` and
 * the same hooks, and whether the answer comes from an in-process seed or from Postgres
 * over HTTP is decided once, at the root. The in-memory adapter stays for the
 * credential-free demo, and its tests keep describing the invariants both backends hold.
 *
 * Every request carries a Clerk session token. The server resolves it to a user and a
 * workspace — the client never says which workspace it wants, because a tenant id the
 * client can send is a tenant id an attacker can change.
 */

import { DataError, type DataAdapter, type EventScopedRepository, type Identity } from "../adapter";
import type {
  Guest,
  AttentionItem,
  AuctionItem,
  AuctionDonor,
  AuctionBidder,
  AuctionBid,
  AuctionOrder,
  AuctionPageSettings,
  PublicAuctionPayload,
  PublicAuctionBidResult,
  PublicAuctionDonorPayload,
  PublicBidderProfile,
  FundraisingPledge,
  BudgetItem,
  Canvas,
  CanvasCard,
  ChecklistItem,
  CheckInStation,
  CustomReportRow,
  Deposit,
  VendorPaymentPlan,
  Event,
  AssignmentSummaryResult,
  EventHealth,
  EventHistoryEntry,
  FeedbackInboxItem,
  FeedbackNotificationOutcome,
  FundraisingDashboard,
  FundraisingOrganizationProfile,
  ItemSubmission,
  PublicItemIntakePayload,
  AuctionCategory,
  PublicBidderBill,
  FundraisingReceipt,
  DonationCampaign,
  PublicDonationCampaign,
  DonationCheckoutResult,
  PublicDonationStatus,
  PublicExperienceCertificate,
  FundraisingReports,
  MoodBoardImage,
  EventRoi,
  EventVendor,
  Floorplan,
  Location,
  MenuItem,
  OpenTask,
  PortfolioSummary,
  ProductFeedback,
  PublicEventPayload,
  PublicFloorplanPayload,
  PublicRegistrationResult,
  PublicRfpPayload,
  PublicVendorConversation,
  RaffleItem,
  RaffleTicket,
  Registration,
  RegistrationWithGuest,
  Rfp,
  RfpInvitation,
  RfpResponse,
  RfpWithResponses,
  RunOfShowItem,
  Sponsorship,
  TeamHoursEntry,
  TeamUpdate,
  Template,
  TemplateContents,
  TemplateDetail,
  TicketType,
  TicketCheckoutResult,
  TicketOrder,
  TicketInvitation,
  TicketInvitationBatchResult,
  PublicTicketOrderStatus,
  StripeConnectStatus,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
  VendorMessage,
  VolunteerShift,
  InviteResult,
  MemberRoleChangeResult,
  WorkspaceMember,
} from "../entities";
import type { PlanningBrief, PlanningPreviewBrief, PlanningSuggestions } from "../planner";
import type { AssistantTurn } from "../assistantChat";
import type { VendorEventPacketResult } from "../vendorEventPackets";
import type { RunOfShowEditorDraft, RunOfShowSyncedDraft } from "../runOfShowRecovery";

export interface HttpAdapterOptions {
  /** Resolves the current Clerk session token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Current Clerk user id, used only to isolate browser query caches. */
  cacheScope: string;
  /** Clerk organization id, when the user is acting inside one. */
  getOrgId?: () => string | null;
  baseUrl?: string;
}

/** Maps an HTTP status onto the `DataError` codes the UI already renders. */
function codeFor(status: number): DataError["code"] {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
      return "unauthenticated";
    case 403:
      return "permission-denied";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    default:
      return status >= 500 ? "unavailable" : "invalid";
  }
}

function createClient({ getToken, getOrgId, baseUrl = "/api" }: HttpAdapterOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    if (!token) throw new DataError("unauthenticated", "Your session has expired. Sign in again.");

    const orgId = getOrgId?.() ?? null;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
          authorization: `Bearer ${token}`,
          ...(orgId ? { "x-clerk-org-id": orgId } : {}),
          ...init.headers,
        },
      });
    } catch {
      // A dropped connection is retryable; a 400 is not. The distinction drives whether
      // react-query backs off or gives up.
      throw new DataError("unavailable", "Couldn't reach the server. Check your connection.");
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `Request failed with ${response.status}.`;
      throw new DataError(codeFor(response.status), message);
    }

    return payload as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
    del: (path: string) => request<{ ok: true }>(path, { method: "DELETE" }),
    upload: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
  };
}

type Client = ReturnType<typeof createClient>;

/** The event subcollections share one URL shape, so they share one implementation. */
function eventScoped<T, TDraft, TPatch>(client: Client, segment: string): EventScopedRepository<T, TDraft, TPatch> {
  return {
    list: (eventId) => client.get<T[]>(`/events/${eventId}/${segment}`),
    create: (eventId, draft) => client.post<T>(`/events/${eventId}/${segment}`, draft),
    update: (eventId, id, patch) => client.patch<T>(`/events/${eventId}/${segment}/${id}`, patch),
    remove: async (eventId, id) => {
      await client.del(`/events/${eventId}/${segment}/${id}`);
    },
  };
}

export function createHttpAdapter(options: HttpAdapterOptions): DataAdapter {
  const client = createClient(options);
  const publicRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${options.baseUrl ?? "/api"}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      });
    } catch {
      throw new DataError("unavailable", "Couldn't reach the server. Check your connection.");
    }
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}.`;
      throw new DataError(codeFor(response.status), message);
    }
    return payload as T;
  };
  const publicUpload = async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.set("file", file);
    let response: Response;
    try {
      response = await fetch(`${options.baseUrl ?? "/api"}${path}`, { method: "POST", body: form });
    } catch {
      throw new DataError("unavailable", "Couldn't reach the server. Check your connection.");
    }
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}.`;
      throw new DataError(codeFor(response.status), message);
    }
    return payload as T;
  };

  return {
    kind: "postgres",
    cacheScope: options.cacheScope,

    me: () => client.get<Identity>("/me"),

    billing: {
      checkout: (interval) => client.post<{ url: string }>("/billing/checkout", { interval }),
      portal: () => client.post<{ url: string }>("/billing/portal"),
      connectStatus: () => client.get<StripeConnectStatus>("/billing/connect"),
      startConnectOnboarding: (returnTo) => client.post<StripeConnectStatus>("/billing/connect/onboarding", { returnTo }),
    },

    fundraising: {
      getProfile: () => client.get<FundraisingOrganizationProfile>("/fundraising/profile"),
      updateProfile: (profile) => client.patch<FundraisingOrganizationProfile>("/fundraising/profile", profile),
      listCategories: () => client.get<AuctionCategory[]>("/fundraising/categories"),
      createCategory: (name) => client.post<AuctionCategory>("/fundraising/categories", { name }),
      listSubmissions: (eventId) => client.get<ItemSubmission[]>(`/events/${eventId}/item-submissions`),
      updateSubmission: (eventId, submissionId, patch) => client.patch<ItemSubmission>(`/events/${eventId}/item-submissions/${submissionId}`, patch),
      dashboard: (eventId) => client.get<FundraisingDashboard>(`/events/${eventId}/fundraising-dashboard`),
      extendItem: (eventId, itemId, minutes, notify = true) => client.post<{ closesAt: string; extensionMinutes: number }>(`/events/${eventId}/auction/${itemId}/extend`, { minutes, notify }),
      extendItems: (eventId, itemIds, minutes, notify = true) => client.post<{ extended: number }>(`/events/${eventId}/auction/extend-many`, { itemIds, minutes, notify }),
      reopenItem: (eventId, itemId, minutes) => client.post<{ closesAt: string; status: "open" }>(`/events/${eventId}/auction/${itemId}/reopen`, { minutes }),
      getPublicIntake: async (auctionToken, priorDonorToken) => {
        try {
          const query = priorDonorToken ? `?prior=${encodeURIComponent(priorDonorToken)}` : "";
          return await publicRequest<PublicItemIntakePayload>(`/public/auctions/${auctionToken}/intake${query}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      submitPublicItem: (auctionToken, draft) => publicRequest<PublicItemIntakePayload>(`/public/auctions/${auctionToken}/intake`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
      uploadPublicItemImage: async (auctionToken, file) =>
        (await publicUpload<{ url: string }>(`/public/auctions/${auctionToken}/intake/upload`, file)).url,
      reinvitePastDonors: (eventId) => client.post<{ sent: number; failed: number }>(`/events/${eventId}/item-donor-reinvites`),
      mergeItems: (eventId, itemIds, title) => client.post<{ packageItemId: string }>(`/events/${eventId}/auction-packages`, { itemIds, title }),
      buildBills: (eventId) => client.post<{ created: number; bills: PublicBidderBill[] }>(`/events/${eventId}/bidder-bills/build`),
      sendBills: (eventId) => client.post<{ sent: number; autoCharged: number; failed: number }>(`/events/${eventId}/bidder-bills/send`),
      refundBill: (eventId, billId) => client.post<PublicBidderBill>(`/events/${eventId}/bidder-bills/${billId}/refund`),
      getPublicBill: async (token) => {
        try { return await publicRequest<PublicBidderBill>(`/public/bills/${token}`); }
        catch (error) { if (error instanceof DataError && error.code === "not-found") return null; throw error; }
      },
      payPublicBill: (token, coverFees) => publicRequest<{ url: string }>(`/public/bills/${token}/checkout`, { method: "POST", body: JSON.stringify({ coverFees }) }),
      getPublicReceipt: async (token) => {
        try { return await publicRequest<{ receipt: FundraisingReceipt; organization: { legalName: string; ein: string; orgType: string }; eventTitle: string | null }>(`/public/receipts/${token}`); }
        catch (error) { if (error instanceof DataError && error.code === "not-found") return null; throw error; }
      },
      listCampaigns: (eventId) => client.get<DonationCampaign[]>(`/fundraising/campaigns${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`),
      createCampaign: (draft) => client.post<DonationCampaign>("/fundraising/campaigns", draft),
      getPublicCampaign: async (token) => {
        try { return await publicRequest<PublicDonationCampaign>(`/public/donations/${token}`); }
        catch (error) { if (error instanceof DataError && error.code === "not-found") return null; throw error; }
      },
      createDonationCheckout: (token, draft) => publicRequest<DonationCheckoutResult>(`/public/donations/${token}/checkout`, { method: "POST", body: JSON.stringify(draft) }),
      getDonationStatus: async (token, donationId) => {
        try { return await publicRequest<PublicDonationStatus>(`/public/donations/${token}/status/${encodeURIComponent(donationId)}`); }
        catch (error) { if (error instanceof DataError && error.code === "not-found") return null; throw error; }
      },
      getPublicCertificate: async (token) => {
        try { return await publicRequest<PublicExperienceCertificate>(`/public/certificates/${token}`); }
        catch (error) { if (error instanceof DataError && error.code === "not-found") return null; throw error; }
      },
      previewBroadcast: (eventId, draft) => client.post<{ recipients: number }>(`/events/${eventId}/fundraising-broadcasts/preview`, draft),
      sendBroadcast: (eventId, draft) => client.post<{ recipients: number; sent: number; failed: number }>(`/events/${eventId}/fundraising-broadcasts/send`, draft),
      recordLiveSale: (eventId, itemId, paddleNumbers, amountCents) => client.post<{ winners: number }>(`/events/${eventId}/auction/${itemId}/live-sale`, { paddleNumbers, amountCents }),
      undoLiveSale: (eventId, itemId) => client.post<{ reopened: true }>(`/events/${eventId}/auction/${itemId}/undo-sale`),
      reports: (eventId) => client.get<FundraisingReports>(`/events/${eventId}/fundraising-reports`),
      sendYearEndStatements: (taxYear) => client.post<{ sent: number; failed: number }>("/fundraising/year-end-statements/send", { taxYear }),
    },

    assistant: {
      plan: (brief: PlanningBrief) => client.post<PlanningSuggestions>("/assistant/plan", brief),
      preview: (brief: PlanningPreviewBrief) => client.post<PlanningSuggestions>("/assistant/preview", brief),
      chat: (input) => client.post<AssistantTurn>("/assistant/chat", input),
    },

    imports: {
      loadGoogleSheet: (url: string) => client.post<{ name: string; csv: string }>("/imports/google-sheet", { url }),
    },

    events: {
      list: (filter) => {
        const params = new URLSearchParams();
        if (filter?.experience) params.set("experience", filter.experience);
        if (filter?.status) params.set("status", filter.status);
        if (filter?.category) params.set("category", filter.category);
        if (filter?.locationId) params.set("locationId", filter.locationId);
        if (filter?.search) params.set("search", filter.search);
        const query = params.toString();
        return client.get<Event[]>(`/events${query ? `?${query}` : ""}`);
      },
      get: (id) => client.get<Event | null>(`/events/${id}`),
      create: (draft) => client.post<Event>("/events", draft),
      update: (id, patch) => client.patch<Event>(`/events/${id}`, patch),
      remove: async (id) => {
        await client.del(`/events/${id}`);
      },
      share: (id) => client.post<{ shareToken: string }>(`/events/${id}/share`),
      // The only read a guest makes, and the only one that needs no session — so it
      // deliberately skips the authenticated client.
      getByShareToken: async (token) => {
        try {
          return await publicRequest<PublicEventPayload>(`/public/events/${token}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      createFromTemplate: (templateId, draft) => client.post<Event>(`/templates/${templateId}/events`, draft),
      saveAsTemplate: (eventId, draft) => client.post<Template>(`/events/${eventId}/save-as-template`, draft),
      sendAssignmentSummaries: (eventId) =>
        client.post<AssignmentSummaryResult>(`/events/${eventId}/assignment-summaries`),
    },

    locations: {
      list: () => client.get<Location[]>("/locations"),
      get: (id) => client.get<Location | null>(`/locations/${id}`),
      create: (draft) => client.post<Location>("/locations", draft),
      update: (id, patch) => client.patch<Location>(`/locations/${id}`, patch),
      remove: async (id) => {
        await client.del(`/locations/${id}`);
      },
    },

    guests: {
      list: () => client.get<Guest[]>("/guests"),
      get: async (id) => (await client.get<Guest[]>("/guests")).find((row) => row.id === id) ?? null,
      create: (draft) => client.post<Guest>("/guests", draft),
      update: (id, patch) => client.patch<Guest>(`/guests/${id}`, patch),
      remove: async (id) => {
        await client.del(`/guests/${id}`);
      },
    },

    registrations: {
      list: () => client.get<RegistrationWithGuest[]>("/registrations"),
      listForEvent: (eventId) => client.get<RegistrationWithGuest[]>(`/events/${eventId}/registrations`),
      create: (draft) => client.post<Registration>("/registrations", draft),
      importGuests: (drafts) => client.post<RegistrationWithGuest[]>("/registrations/import", { rows: drafts }),
      registerPublic: (shareToken, draft) => publicRequest<PublicRegistrationResult>(`/public/events/${shareToken}/registrations`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
      createWalkIn: (eventId, draft) =>
        client.post<RegistrationWithGuest>(`/events/${eventId}/walk-ins`, draft),
      updateDetails: (id, patch) => client.patch<RegistrationWithGuest>(`/registrations/${id}`, patch),
      setStatus: (id, status) => client.patch<Registration>(`/registrations/${id}`, { status }),
      setSegment: (id, segment) => client.patch<Registration>(`/registrations/${id}`, { segment }),
      setOrganization: (id, organization) =>
        client.patch<Registration>(`/registrations/${id}`, { organization }),
      setCheckIn: (id, patch) => client.patch<Registration>(`/registrations/${id}`, patch),
      remove: async (id) => {
        await client.del(`/registrations/${id}`);
      },
    },

    vendors: {
      list: () => client.get<Vendor[]>("/vendors"),
      get: (id) => client.get<Vendor | null>(`/vendors/${id}`),
      create: (draft) => client.post<Vendor>("/vendors", draft),
      update: (id, patch) => client.patch<Vendor>(`/vendors/${id}`, patch),
      remove: async (id) => {
        await client.del(`/vendors/${id}`);
      },
    },

    vendorMessages: {
      list: (vendorId) => client.get<VendorMessage[]>(`/vendors/${vendorId}/messages`),
      send: (vendorId, draft) => client.post<VendorMessage>(`/vendors/${vendorId}/messages`, draft),
      markThreadRead: async (vendorId) => {
        await client.post(`/vendors/${vendorId}/read`);
      },
      getPublic: (token) => publicRequest<PublicVendorConversation | null>(`/public/vendor-conversations/${token}`),
      replyPublic: async (token, content) => {
        await publicRequest(`/public/vendor-conversations/${token}`, { method: "POST", body: JSON.stringify({ content }) });
      },
    },

    vendorEventPackets: {
      send: (eventId, draft) => client.post<VendorEventPacketResult>(`/events/${eventId}/vendor-packets`, draft),
    },

    eventVendors: eventScoped<EventVendor, never, never>(client, "vendors") as DataAdapter["eventVendors"],
    checkInStations: eventScoped<CheckInStation, never, never>(client, "check-in-stations") as DataAdapter["checkInStations"],
    checklist: eventScoped<ChecklistItem, never, never>(client, "checklist") as DataAdapter["checklist"],
    runOfShow: eventScoped<RunOfShowItem, never, never>(client, "run-of-show") as DataAdapter["runOfShow"],
    runOfShowDrafts: {
      list: (eventId) => client.get<RunOfShowSyncedDraft[]>(`/events/${eventId}/run-of-show-drafts`),
      save: (eventId, draftKey, draft: RunOfShowEditorDraft, clientUpdatedAt) =>
        client.put<RunOfShowSyncedDraft | null>(`/events/${eventId}/run-of-show-drafts/${encodeURIComponent(draftKey)}`, { draft, clientUpdatedAt }),
      discard: async (eventId, draftKey, clientUpdatedAt) => {
        await client.patch(`/events/${eventId}/run-of-show-drafts/${encodeURIComponent(draftKey)}`, { discarded: true, clientUpdatedAt });
      },
    },
    volunteerNeeds: {
      ...(eventScoped(client, "volunteer-needs") as DataAdapter["volunteerNeeds"]),
      signupPublic: (shareToken, draft) => publicRequest<VolunteerShift>(`/public/events/${shareToken}/volunteers`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    },
    volunteers: eventScoped<VolunteerShift, never, never>(client, "volunteers") as DataAdapter["volunteers"],
    budget: eventScoped<BudgetItem, never, never>(client, "budget") as DataAdapter["budget"],
    menu: eventScoped<MenuItem, never, never>(client, "menu") as DataAdapter["menu"],
    moodBoard: eventScoped<MoodBoardImage, never, never>(client, "mood-board") as DataAdapter["moodBoard"],
    auction: {
      ...(eventScoped<AuctionItem, never, never>(client, "auction") as DataAdapter["auction"]),
      listDonors: (eventId) => client.get<AuctionDonor[]>(`/events/${eventId}/auction-donors`),
      createDonor: (eventId, draft) => client.post<AuctionDonor>(`/events/${eventId}/auction-donors`, draft),
      updateDonor: (eventId, donorId, patch) => client.patch<AuctionDonor>(`/events/${eventId}/auction-donors/${donorId}`, patch),
      removeDonor: async (eventId, donorId) => {
        await client.del(`/events/${eventId}/auction-donors/${donorId}`);
      },
      sendDonorThankYou: (eventId, donorId) => client.post<AuctionDonor>(`/events/${eventId}/auction-donors/${donorId}/thank-you`),
      share: (eventId) => client.post<{ auctionPublicToken: string }>(`/events/${eventId}/auction-share`),
      updateSettings: (eventId, settings) => client.patch<AuctionPageSettings>(`/events/${eventId}/auction-settings`, settings),
      publishItem: (eventId, itemId, published) => client.post<AuctionItem>(`/events/${eventId}/auction/${itemId}/publish`, { published }),
      listBidders: (eventId) => client.get<AuctionBidder[]>(`/events/${eventId}/auction-bidders`),
      listBids: (eventId) => client.get<AuctionBid[]>(`/events/${eventId}/auction-bids`),
      getPublic: async (token) => {
        try {
          return await publicRequest<PublicAuctionPayload>(`/public/auctions/${token}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      registerPublic: (token, draft) => publicRequest<AuctionBidder>(`/public/auctions/${token}/bidders`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
      placePublicBid: (token, bidderToken, itemId, maximumAmountCents) =>
        publicRequest<PublicAuctionBidResult>(`/public/auctions/${token}/bidders/${bidderToken}/items/${itemId}/bids`, {
          method: "POST",
          body: JSON.stringify({ maximumAmountCents }),
        }),
      uploadImage: async (file) => {
        const form = new FormData();
        form.set("file", file);
        return (await client.upload<{ url: string }>("/uploads/auction-image", form)).url;
      },
      getPublicDonor: async (token) => {
        try {
          return await publicRequest<PublicAuctionDonorPayload>(`/public/auction-donors/${token}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      uploadPublicDonorImage: async (token, file) =>
        (await publicUpload<{ url: string }>(`/public/auction-donors/${token}/upload`, file)).url,
      submitPublicDonation: (token, draft) =>
        publicRequest<PublicAuctionDonorPayload>(`/public/auction-donors/${token}/donations`, {
          method: "POST",
          body: JSON.stringify(draft),
        }),
      closeItem: (eventId, itemId) => client.post<{ status: "closed-no-bids" | "winner-notified"; paymentUrl: string | null }>(`/events/${eventId}/auction/${itemId}/close`),
      offerSecondChance: (eventId, itemId) => client.post<{ status: "winner-notified"; paymentUrl: string | null }>(`/events/${eventId}/auction/${itemId}/second-chance`),
      listOrders: (eventId) => client.get<AuctionOrder[]>(`/events/${eventId}/auction-orders`),
      refundOrder: (eventId, orderId) => client.post<AuctionOrder>(`/events/${eventId}/auction-orders/${orderId}/refund`),
      getBidderProfile: async (token, bidderToken) => {
        try {
          return await publicRequest<PublicBidderProfile>(`/public/auctions/${token}/bidders/${bidderToken}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      setupBidderWallet: (token, bidderToken) => publicRequest<{ url: string }>(`/public/auctions/${token}/bidders/${bidderToken}/wallet`, { method: "POST" }),
      setWatch: (token, bidderToken, itemId, watched) => publicRequest<{ watched: boolean }>(`/public/auctions/${token}/bidders/${bidderToken}/watches/${itemId}`, { method: "POST", body: JSON.stringify({ watched }) }),
      createPledge: (token, bidderToken, amountCents, channel) => publicRequest<FundraisingPledge>(`/public/auctions/${token}/bidders/${bidderToken}/pledges`, { method: "POST", body: JSON.stringify({ amountCents, channel }) }),
      buyNow: (token, bidderToken, itemId) => publicRequest<{ won: true; amountCents: number }>(`/public/auctions/${token}/bidders/${bidderToken}/items/${itemId}/buy-now`, { method: "POST" }),
    },
    sponsorships: eventScoped<Sponsorship, never, never>(client, "sponsorships") as DataAdapter["sponsorships"],

    // `list` returns each RFP with its responses attached, matching the memory adapter,
    // so the tab never has to fetch replies per row.
    rfps: {
      ...(eventScoped<Rfp, never, never>(client, "rfps") as DataAdapter["rfps"]),
      list: (eventId) => client.get<RfpWithResponses[]>(`/events/${eventId}/rfps`),
      addResponse: (eventId, rfpId, draft) =>
        client.post<RfpResponse>(`/events/${eventId}/rfps/${rfpId}/responses`, draft),
      setResponseStatus: (eventId, rfpId, responseId, status) =>
        client.patch<RfpResponse>(`/events/${eventId}/rfps/${rfpId}/responses/${responseId}`, { status }),
      removeResponse: async (eventId, rfpId, responseId) => {
        await client.del(`/events/${eventId}/rfps/${rfpId}/responses/${responseId}`);
      },
      inviteVendor: (eventId, rfpId, vendorId) =>
        client.post<RfpInvitation>(`/events/${eventId}/rfps/${rfpId}/invitations`, { vendorId }),
      getPublic: (token) => publicRequest<PublicRfpPayload | null>(`/public/rfps/${token}`),
      respondPublic: (token, draft) => publicRequest<RfpResponse>(`/public/rfps/${token}/responses`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    },

    deposits: eventScoped<Deposit, never, never>(client, "deposits") as DataAdapter["deposits"],
    vendorPaymentPlans: eventScoped<VendorPaymentPlan, never, never>(client, "vendor-payment-plans") as DataAdapter["vendorPaymentPlans"],
    teamHours: eventScoped<TeamHoursEntry, never, never>(client, "team-hours") as DataAdapter["teamHours"],
    teamUpdates: {
      list: (eventId) => client.get<TeamUpdate[]>(`/events/${eventId}/updates`),
      create: (eventId, draft) => client.post<TeamUpdate>(`/events/${eventId}/updates`, draft),
    },

    tickets: {
      ...(eventScoped<TicketType, never, never>(client, "ticket-types") as DataAdapter["tickets"]),
      listAll: () => client.get<TicketTypeWithEvent[]>("/tickets"),
      purchase: (shareToken, ticketTypeId, buyer) =>
        publicRequest<TicketCheckoutResult>(`/public/events/${shareToken}/tickets/checkout`, {
          method: "POST",
          body: JSON.stringify({
            ticketTypeId,
            buyerName: buyer.name,
            buyerEmail: buyer.contact,
            buyerPhone: buyer.phone,
            gradeTags: buyer.grades ?? [],
            quantity: buyer.quantity,
            guestNames: buyer.guestNames ?? [],
            donationAddOnCents: buyer.donationAddOnCents ?? 0,
            benefitsDeclined: buyer.benefitsDeclined === true,
            autoChargeOptIn: buyer.autoChargeOptIn === true,
          }),
        }),
      listOrders: (eventId) => client.get<TicketOrder[]>(`/events/${eventId}/ticket-orders`),
      refundOrder: (eventId, orderId) =>
        client.post<TicketOrder>(`/events/${eventId}/ticket-orders/${orderId}/refund`),
      listInvitations: (eventId) => client.get<TicketInvitation[]>(`/events/${eventId}/ticket-invitations`),
      sendInvitations: (eventId, recipients, options) =>
        client.post<TicketInvitationBatchResult>(`/events/${eventId}/ticket-invitations`, { recipients, consentConfirmed: options.consentConfirmed, testOnly: options.testOnly === true }),
      getPublicOrderStatus: async (shareToken, orderId) => {
        try {
          return await publicRequest<PublicTicketOrderStatus>(`/public/events/${shareToken}/ticket-orders/${orderId}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
    },

    raffle: {
      ...(eventScoped<RaffleItem, never, never>(client, "raffle") as DataAdapter["raffle"]),
      listTickets: (eventId, raffleItemId) =>
        client.get<RaffleTicket[]>(`/events/${eventId}/raffle/${raffleItemId}/tickets`),
      sellTickets: (eventId, raffleItemId, buyer) =>
        client.post<RaffleTicket>(`/events/${eventId}/raffle/${raffleItemId}/tickets`, buyer),
      draw: (eventId, raffleItemId) => client.post<RaffleItem>(`/events/${eventId}/raffle/${raffleItemId}/draw`),
    },

    templates: {
      list: () => client.get<Template[]>("/templates"),
      get: (id) => client.get<TemplateDetail | null>(`/templates/${id}`),
      create: (draft) => client.post<Template>("/templates", draft),
      update: (id, patch) => client.patch<Template>(`/templates/${id}`, patch),
      replaceContents: (id, contents: TemplateContents) => client.put<TemplateDetail>(`/templates/${id}/contents`, contents),
      remove: async (id) => {
        await client.del(`/templates/${id}`);
      },
    },

    canvases: {
      list: () => client.get<Canvas[]>("/boards"),
      get: (id) => client.get<Canvas | null>(`/boards/${id}`),
      create: (draft) => client.post<Canvas>("/boards", draft),
      update: (id, patch) => client.patch<Canvas>(`/boards/${id}`, patch),
      replaceCards: (id, cards: CanvasCard[]) => client.put<Canvas>(`/boards/${id}/cards`, { cards }),
      remove: async (id) => {
        await client.del(`/boards/${id}`);
      },
    },

    floorplan: {
      list: (eventId) => client.get<Floorplan[]>(`/events/${eventId}/floorplans`),
      create: (eventId, draft) => client.post<Floorplan>(`/events/${eventId}/floorplans`, draft),
      save: (id, draft) => client.put<Floorplan>(`/floorplans/${id}`, draft),
      share: (eventId, id) => client.post<{ shareToken: string }>(`/events/${eventId}/floorplans/${id}/share`),
      getPublic: async (shareToken) => {
        try {
          return await publicRequest<PublicFloorplanPayload>(`/public/floorplans/${shareToken}`);
        } catch (error) {
          if (error instanceof DataError && error.code === "not-found") return null;
          throw error;
        }
      },
      remove: async (id) => {
        await client.del(`/floorplans/${id}`);
      },
    },

    members: {
      list: () => client.get<WorkspaceMember[]>("/members"),
      invite: (email, role, eventId) => client.post<InviteResult>("/invites", { email, role, eventId }),
      revokeInvite: async (email) => {
        await client.del(`/invites/${encodeURIComponent(email)}`);
      },
      setRole: (userId, role, changeId) => client.patch<MemberRoleChangeResult>(`/members/${userId}`, { role, changeId }),
      remove: async (userId) => {
        await client.del(`/members/${userId}`);
      },
    },

    feedback: {
      list: () => client.get<ProductFeedback[]>("/feedback"),
      listInbox: () => client.get<FeedbackInboxItem[]>("/feedback/inbox"),
      create: (draft) => client.post<ProductFeedback>("/feedback", draft),
      notify: (id) => client.post<FeedbackNotificationOutcome>(`/feedback/${id}/notify`, {}),
    },

    history: {
      list: (eventId) => client.get<EventHistoryEntry[]>(`/events/${eventId}/history`),
    },

    roi: {
      get: (eventId) => client.get<EventRoi | null>(`/events/${eventId}/roi`),
      save: (eventId, roi) => client.put<EventRoi>(`/events/${eventId}/roi`, roi),
    },

    settings: {
      get: () => client.get<UserSettings>("/settings"),
      update: (patch) => client.patch<UserSettings>("/settings", patch),
    },

    analytics: {
      customReport: () => client.get<CustomReportRow[]>("/analytics/custom-report"),
      portfolio: () => client.get<PortfolioSummary>("/analytics/portfolio"),
      health: (eventIds) =>
        client.get<EventHealth[]>(`/analytics/health${eventIds?.length ? `?eventIds=${eventIds.join(",")}` : ""}`),
      attention: () => client.get<AttentionItem[]>("/analytics/attention"),
      openTasks: () => client.get<OpenTask[]>("/analytics/open-tasks"),
    },
  };
}
