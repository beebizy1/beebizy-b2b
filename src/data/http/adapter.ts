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
  BudgetItem,
  Canvas,
  CanvasCard,
  ChecklistItem,
  Deposit,
  Event,
  EventHealth,
  EventHistoryEntry,
  MoodBoardImage,
  EventRoi,
  EventVendor,
  Floorplan,
  Location,
  MenuItem,
  OpenTask,
  PortfolioSummary,
  PublicEventPayload,
  RaffleItem,
  RaffleTicket,
  Registration,
  RegistrationWithGuest,
  Rfp,
  RfpResponse,
  RfpWithResponses,
  RunOfShowItem,
  Sponsorship,
  TeamHoursEntry,
  Template,
  TemplateContents,
  TemplateDetail,
  TicketType,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
  VendorMessage,
} from "../entities";
import type { PlanningBrief, PlanningSuggestions } from "../planner";
import type { AssistantTurn } from "../assistantChat";

export interface HttpAdapterOptions {
  /** Resolves the current Clerk session token, or null when signed out. */
  getToken: () => Promise<string | null>;
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
          "content-type": "application/json",
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

  return {
    kind: "postgres",

    me: () => client.get<Identity>("/me"),

    assistant: {
      plan: (brief: PlanningBrief) => client.post<PlanningSuggestions>("/assistant/plan", brief),
      chat: (input) => client.post<AssistantTurn>("/assistant/chat", input),
    },

    imports: {
      loadGoogleSheet: (url: string) => client.post<{ name: string; csv: string }>("/imports/google-sheet", { url }),
    },

    events: {
      list: (filter) => {
        const params = new URLSearchParams();
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
        const response = await fetch(`${options.baseUrl ?? "/api"}/public/events/${token}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new DataError("unavailable", "Couldn't load this event.");
        return (await response.json()) as PublicEventPayload;
      },
      createFromTemplate: (templateId, draft) => client.post<Event>(`/templates/${templateId}/events`, draft),
      saveAsTemplate: (eventId, draft) => client.post<Template>(`/events/${eventId}/save-as-template`, draft),
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
      setStatus: (id, status) => client.patch<Registration>(`/registrations/${id}`, { status }),
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
    },

    eventVendors: eventScoped<EventVendor, never, never>(client, "vendors") as DataAdapter["eventVendors"],
    checklist: eventScoped<ChecklistItem, never, never>(client, "checklist") as DataAdapter["checklist"],
    runOfShow: eventScoped<RunOfShowItem, never, never>(client, "run-of-show") as DataAdapter["runOfShow"],
    budget: eventScoped<BudgetItem, never, never>(client, "budget") as DataAdapter["budget"],
    menu: eventScoped<MenuItem, never, never>(client, "menu") as DataAdapter["menu"],
    moodBoard: eventScoped<MoodBoardImage, never, never>(client, "mood-board") as DataAdapter["moodBoard"],
    auction: eventScoped<AuctionItem, never, never>(client, "auction") as DataAdapter["auction"],
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
    },

    deposits: eventScoped<Deposit, never, never>(client, "deposits") as DataAdapter["deposits"],
    teamHours: eventScoped<TeamHoursEntry, never, never>(client, "team-hours") as DataAdapter["teamHours"],

    tickets: {
      ...(eventScoped<TicketType, never, never>(client, "ticket-types") as DataAdapter["tickets"]),
      listAll: () => client.get<TicketTypeWithEvent[]>("/tickets"),
      purchase: async () => {
        // Paid checkout goes through Stripe on the server, not from the browser. Until that
        // route exists there is nothing honest for this to do, and silently registering a
        // free seat for a paid ticket would be worse than failing.
        throw new DataError("unavailable", "Ticket checkout isn't connected yet.");
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
      get: (eventId) => client.get<Floorplan | null>(`/events/${eventId}/floorplan`),
      save: (eventId, draft) => client.put<Floorplan>(`/events/${eventId}/floorplan`, draft),
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
      portfolio: () => client.get<PortfolioSummary>("/analytics/portfolio"),
      health: (eventIds) =>
        client.get<EventHealth[]>(`/analytics/health${eventIds?.length ? `?eventIds=${eventIds.join(",")}` : ""}`),
      attention: () => client.get<AttentionItem[]>("/analytics/attention"),
      openTasks: () => client.get<OpenTask[]>("/analytics/open-tasks"),
    },
  };
}
