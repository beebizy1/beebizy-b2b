/**
 * In-memory implementation of `DataAdapter`.
 *
 * Runs with zero configuration, which is what lets the app be demoed, screenshotted
 * and tested without a Firebase project. It enforces the same invariants the real
 * backend does — denormalized counters stay in sync, cascade deletes happen, ticket
 * allocations can be exhausted — so a screen that works here works against Firestore.
 *
 * State lives for the lifetime of the tab. Reloading resets to the seed.
 */

import type {
  AnalyticsRepository,
  CanvasesRepository,
  DataAdapter,
  EventScopedRepository,
  EventsRepository,
  FloorplanRepository,
  EventHistoryRepository,
  OwnedRepository,
  RaffleRepository,
  RegistrationsRepository,
  RfpsRepository,
  RoiRepository,
  SettingsRepository,
  TemplatesRepository,
  TicketsRepository,
  VendorMessagesRepository,
} from "../adapter";
import { DataError } from "../adapter";
import { buildAttention, computeEventHealth, computePortfolio, daysUntil } from "../derive";
import type {
  Guest,
  GuestDraft,
  GuestPatch,
  AuctionItem,
  AuctionItemDraft,
  AuctionItemPatch,
  BudgetItem,
  BudgetItemDraft,
  BudgetItemPatch,
  Canvas,
  CanvasCard,
  CanvasDraft,
  CanvasPatch,
  ChecklistItem,
  ChecklistItemDraft,
  ChecklistItemPatch,
  Deposit,
  DepositDraft,
  DepositPatch,
  Event,
  EventFilter,
  EventHealth,
  EventHistoryChange,
  MoodBoardImage,
  EventRoi,
  EventVendor,
  EventVendorDraft,
  EventVendorPatch,
  Floorplan,
  FloorplanDraft,
  Location,
  LocationDraft,
  LocationPatch,
  MenuItem,
  MenuItemDraft,
  MenuItemPatch,
  RaffleItem,
  RaffleItemDraft,
  RaffleItemPatch,
  RaffleTicket,
  Rfp,
  RfpDraft,
  RfpPatch,
  RfpResponse,
  TeamHoursEntry,
  TeamHoursDraft,
  TeamHoursPatch,
  Registration,
  RegistrationStatus,
  RegistrationWithGuest,
  RunOfShowItem,
  RunOfShowItemDraft,
  RunOfShowItemPatch,
  Sponsorship,
  SponsorshipDraft,
  SponsorshipPatch,
  Template,
  TemplateContents,
  TemplateDetail,
  TicketType,
  TicketTypeDraft,
  TicketTypePatch,
  TicketTypeWithEvent,
  UserSettings,
  HistoryResource,
  Vendor,
  VendorDraft,
  VendorMessage,
  VendorPatch,
} from "../entities";
import { buildSeed, DEMO_OWNER_ID, type MemoryDb } from "./seed";
import { describeHistoryChange } from "../history";
import { buildRuleBasedSuggestions, type PastEventPlanningRecord } from "../planner";
import { nextTurn } from "../assistantChat";
import { googleSheetCsvUrl } from "../import";

/**
 * A short artificial delay so loading states, skeletons and optimistic updates are
 * exercised in the demo instead of resolving in the same tick. Zero under test.
 */
const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 140;

const wait = (ms = LATENCY_MS) => (ms === 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** Detached copy, so a caller mutating a rendered object can't corrupt the store. */
function copy<T>(value: T): T {
  return structuredClone(value);
}

let db: MemoryDb | null = null;
function store(): MemoryDb {
  if (!db) db = buildSeed();
  return db;
}

/** Test seam: drop all state so the next read re-seeds. */
export function resetMemoryStore(): void {
  db = null;
}

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}${idSeq.toString(36)}`;
}

const nowIso = () => new Date().toISOString();

function appendHistory(input: EventHistoryChange): void {
  store().history.push({
    id: newId("hist"),
    actorId: DEMO_OWNER_ID,
    summary: describeHistoryChange(input),
    createdAt: nowIso(),
    ...input,
  });
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new DataError("not-found", message);
  return value;
}

/* ------------------------------------------------------------------- helpers */

function requireEvent(eventId: string): Event {
  return required(
    store().events.find((e) => e.id === eventId),
    `Event ${eventId} no longer exists.`,
  );
}

/** Recomputes the denormalized `registrationCount` the events list and capacity bars read. */
function syncRegistrationCount(eventId: string): void {
  const event = store().events.find((e) => e.id === eventId);
  if (!event) return;
  event.registrationCount = store().registrations.filter((r) => r.eventId === eventId && r.status !== "cancelled").length;
}

/** Recomputes the denormalized `eventCount` the locations list reads. */
function syncLocationCounts(): void {
  for (const location of store().locations) {
    location.eventCount = store().events.filter((e) => e.locationId === location.id).length;
  }
}

/** Keeps the location snapshot embedded in each event honest after a location edit. */
function syncLocationSnapshots(location: Location): void {
  for (const event of store().events) {
    if (event.locationId === location.id) {
      event.locationRecord = location;
      event.location = `${location.name}, ${location.city ?? ""}`.replace(/, $/, "");
    }
  }
}

/** Recomputes a vendor's denormalized thread summary after any message write. */
function syncVendorThread(vendorId: string): void {
  const vendor = store().vendors.find((v) => v.id === vendorId);
  if (!vendor) return;
  const thread = store()
    .vendorMessages.filter((m) => m.vendorId === vendorId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = thread.at(-1);
  vendor.lastMessage = last?.content ?? null;
  vendor.lastMessageAt = last?.createdAt ?? null;
  vendor.lastDirection = last?.direction ?? null;
  vendor.unreadCount = thread.filter((m) => m.direction === "inbound" && !m.isRead).length;
}

/**
 * Generic CRUD over an event subcollection. Every workspace collection has the same
 * shape — list by event, append with a sort order, patch in place, remove — so they
 * share one implementation instead of eleven near-identical ones.
 */
function eventScoped<T extends { id: string; eventId: string; sortOrder?: number; createdAt: string }, TDraft, TPatch>(
  table: () => T[],
  idPrefix: string,
  build: (eventId: string, draft: TDraft, sortOrder: number) => T,
  historyResource?: HistoryResource,
  sort?: (a: T, b: T) => number,
): EventScopedRepository<T, TDraft, TPatch> {
  const defaultSort = (a: T, b: T) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  return {
    async list(eventId) {
      await wait();
      return copy(table().filter((row) => row.eventId === eventId).sort(sort ?? defaultSort));
    },
    async create(eventId, draft) {
      await wait();
      requireEvent(eventId);
      const siblings = table().filter((row) => row.eventId === eventId);
      const nextOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), 0) + 1;
      const row = build(eventId, draft, nextOrder);
      row.id = newId(idPrefix);
      table().push(row);
      if (historyResource) {
        appendHistory({
          eventId,
          resource: historyResource,
          resourceId: row.id,
          action: "created",
          before: null,
          after: copy(row) as Record<string, unknown>,
        });
      }
      return copy(row);
    },
    async update(eventId, id, patch) {
      await wait();
      const row = required(
        table().find((r) => r.id === id && r.eventId === eventId),
        `Record ${id} no longer exists.`,
      );
      const before = copy(row) as Record<string, unknown>;
      Object.assign(row, patch);
      if (historyResource) {
        appendHistory({
          eventId,
          resource: historyResource,
          resourceId: row.id,
          action: "updated",
          before,
          after: copy(row) as Record<string, unknown>,
        });
      }
      return copy(row);
    },
    async remove(eventId, id) {
      await wait();
      const table_ = table();
      const index = table_.findIndex((r) => r.id === id && r.eventId === eventId);
      if (index === -1) throw new DataError("not-found", `Record ${id} no longer exists.`);
      const before = copy(table_[index]!) as Record<string, unknown>;
      table_.splice(index, 1);
      if (historyResource) {
        appendHistory({
          eventId,
          resource: historyResource,
          resourceId: id,
          action: "deleted",
          before,
          after: null,
        });
      }
    },
  };
}

/* -------------------------------------------------------------------- events */

const EVENT_SUBCOLLECTIONS: Array<keyof MemoryDb> = [
  "checklist",
  "runOfShow",
  "budget",
  "menu",
  "moodBoard",
  "tickets",
  "auction",
  "raffle",
  "raffleTickets",
  "sponsorships",
  "eventVendors",
  "rfps",
  "deposits",
  "teamHours",
];

const events: EventsRepository = {
  async list(filter?: EventFilter) {
    await wait();
    let rows = store().events.slice();
    if (filter?.status) rows = rows.filter((e) => e.status === filter.status);
    if (filter?.category) rows = rows.filter((e) => e.category === filter.category);
    if (filter?.locationId) rows = rows.filter((e) => e.locationId === filter.locationId);
    if (filter?.search) {
      const needle = filter.search.trim().toLowerCase();
      rows = rows.filter((e) =>
        [e.title, e.category, e.location ?? "", e.locationRecord?.name ?? ""].some((field) =>
          field.toLowerCase().includes(needle),
        ),
      );
    }
    return copy(rows.sort((a, b) => b.date.localeCompare(a.date)));
  },

  async get(id) {
    await wait();
    return copy(store().events.find((e) => e.id === id) ?? null);
  },

  async create(draft) {
    await wait();
    const location = draft.locationId ? (store().locations.find((l) => l.id === draft.locationId) ?? null) : null;
    const event: Event = {
      id: newId("evt"),
      ownerId: DEMO_OWNER_ID,
      title: draft.title,
      description: draft.description ?? null,
      date: draft.date,
      endDate: draft.endDate ?? null,
      location: draft.location ?? (location ? `${location.name}, ${location.city ?? ""}`.replace(/, $/, "") : null),
      locationId: draft.locationId ?? null,
      locationRecord: location,
      capacity: draft.capacity ?? null,
      status: draft.status,
      category: draft.category,
      imageUrl: draft.imageUrl ?? null,
      registrationCount: 0,
      shareToken: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store().events.push(event);
    appendHistory({
      eventId: event.id,
      resource: "event",
      resourceId: event.id,
      action: "created",
      before: null,
      after: copy(event) as unknown as Record<string, unknown>,
    });
    syncLocationCounts();
    return copy(event);
  },

  async update(id, patch) {
    await wait();
    const event = required(store().events.find((e) => e.id === id), `Event ${id} no longer exists.`);
    const before = copy(event) as unknown as Record<string, unknown>;
    Object.assign(event, patch);
    if ("locationId" in patch) {
      const location = patch.locationId ? (store().locations.find((l) => l.id === patch.locationId) ?? null) : null;
      event.locationRecord = location;
      if (location) event.location = `${location.name}, ${location.city ?? ""}`.replace(/, $/, "");
      syncLocationCounts();
    }
    event.updatedAt = nowIso();
    appendHistory({
      eventId: id,
      resource: "event",
      resourceId: id,
      action: "updated",
      before,
      after: copy(event) as unknown as Record<string, unknown>,
    });
    return copy(event);
  },

  async remove(id) {
    await wait();
    const state = store();
    const index = state.events.findIndex((e) => e.id === id);
    if (index === -1) throw new DataError("not-found", `Event ${id} no longer exists.`);
    const before = copy(state.events[index]!) as unknown as Record<string, unknown>;
    state.events.splice(index, 1);
    // Firestore does not cascade — the real adapter deletes these explicitly too.
    for (const key of EVENT_SUBCOLLECTIONS) {
      const table = state[key] as Array<{ eventId?: string }>;
      for (let i = table.length - 1; i >= 0; i -= 1) {
        if (table[i]!.eventId === id) table.splice(i, 1);
      }
    }
    for (let i = state.registrations.length - 1; i >= 0; i -= 1) {
      if (state.registrations[i]!.eventId === id) state.registrations.splice(i, 1);
    }
    state.roi = state.roi.filter((r) => r.eventId !== id);
    state.floorplans = state.floorplans.filter((plan) => plan.eventId !== id);
    // Boards outlive their event — they were concepting work before it existed — so
    // detach rather than delete.
    for (const board of state.canvases) {
      if (board.eventId === id) board.eventId = null;
    }
    syncLocationCounts();
    appendHistory({ eventId: id, resource: "event", resourceId: id, action: "deleted", before, after: null });
  },

  async share(id) {
    await wait();
    const event = required(store().events.find((e) => e.id === id), `Event ${id} no longer exists.`);
    event.shareToken ??= newId("share");
    return { shareToken: event.shareToken };
  },

  async getByShareToken(token) {
    await wait();
    const event = store().events.find((e) => e.shareToken === token);
    if (!event) return null;
    // Assembled exactly like the server's public payload, so the guest page is exercised
    // by the demo rather than only in production.
    return copy({
      event,
      agenda: store()
        .runOfShow.filter((item) => item.eventId === event.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      tickets: store().tickets.filter((ticket) => ticket.eventId === event.id && ticket.isActive),
      timeZone: store().settings.timeZone,
    });
  },

  async createFromTemplate(templateId, draft) {
    const template = required(
      store().templates.find((t) => t.id === templateId),
      `Template ${templateId} no longer exists.`,
    );
    const event = await this.create(draft);
    const state = store();
    for (const item of template.checklistItems) {
      state.checklist.push({ ...copy(item), id: newId("cl"), eventId: event.id, createdAt: nowIso() });
    }
    for (const item of template.runOfShowItems) {
      const row = { ...copy(item), id: newId("ros"), eventId: event.id, createdAt: nowIso() };
      state.runOfShow.push(row);
      appendHistory({
        eventId: event.id,
        resource: "run-of-show",
        resourceId: row.id,
        action: "created",
        before: null,
        after: copy(row) as Record<string, unknown>,
      });
    }
    for (const item of template.budgetItems) {
      const row = { ...copy(item), id: newId("bud"), eventId: event.id, createdAt: nowIso() };
      state.budget.push(row);
      appendHistory({
        eventId: event.id,
        resource: "budget",
        resourceId: row.id,
        action: "created",
        before: null,
        after: copy(row) as Record<string, unknown>,
      });
    }
    return copy(event);
  },

  async saveAsTemplate(eventId, draft) {
    await wait();
    const event = requireEvent(eventId);
    const state = store();
    const strip = <T extends { eventId: string }>(row: T): Omit<T, "eventId"> => {
      const { eventId: _omitted, ...rest } = copy(row);
      return rest;
    };
    const contents: TemplateContents = {
      checklistItems: state.checklist.filter((c) => c.eventId === eventId).map((c) => ({ ...strip(c), completed: false, dueDate: null })),
      runOfShowItems: state.runOfShow.filter((r) => r.eventId === eventId).map(strip),
      budgetItems: state.budget.filter((b) => b.eventId === eventId).map((b) => ({ ...strip(b), actualCents: null })),
    };
    const template: Template & TemplateContents = {
      id: newId("tpl"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      description: draft.description ?? null,
      category: event.category,
      defaultCapacity: event.capacity,
      checklistCount: contents.checklistItems.length,
      runOfShowCount: contents.runOfShowItems.length,
      budgetCount: contents.budgetItems.length,
      createdAt: nowIso(),
      ...contents,
    };
    state.templates.push(template);
    return copy(template);
  },
};

/* ----------------------------------------------------------------- locations */

const locations: OwnedRepository<Location, LocationDraft, LocationPatch> = {
  async list() {
    await wait();
    return copy(store().locations.slice().sort((a, b) => a.name.localeCompare(b.name)));
  },
  async get(id) {
    await wait();
    return copy(store().locations.find((l) => l.id === id) ?? null);
  },
  async create(draft) {
    await wait();
    const location: Location = {
      id: newId("loc"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      corporationName: draft.corporationName,
      address: draft.address ?? null,
      city: draft.city ?? null,
      state: draft.state ?? null,
      country: draft.country ?? "USA",
      phone: draft.phone ?? null,
      eventCount: 0,
      createdAt: nowIso(),
    };
    store().locations.push(location);
    return copy(location);
  },
  async update(id, patch) {
    await wait();
    const location = required(store().locations.find((l) => l.id === id), `Location ${id} no longer exists.`);
    Object.assign(location, patch, { updatedAt: nowIso() });
    syncLocationSnapshots(location);
    return copy(location);
  },
  async remove(id) {
    await wait();
    const state = store();
    if (state.events.some((e) => e.locationId === id)) {
      throw new DataError("conflict", "This location still has events. Move or delete them first.");
    }
    const index = state.locations.findIndex((l) => l.id === id);
    if (index === -1) throw new DataError("not-found", `Location ${id} no longer exists.`);
    state.locations.splice(index, 1);
  },
};

/* ----------------------------------------------------------------- guests */

const guests: OwnedRepository<Guest, GuestDraft, GuestPatch> = {
  async list() {
    await wait();
    return copy(store().guests.slice().sort((a, b) => a.name.localeCompare(b.name)));
  },
  async get(id) {
    await wait();
    return copy(store().guests.find((a) => a.id === id) ?? null);
  },
  async create(draft) {
    await wait();
    const guest: Guest = {
      id: newId("att"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      contact: draft.contact,
      notes: draft.notes ?? null,
      createdAt: nowIso(),
    };
    store().guests.push(guest);
    return copy(guest);
  },
  async update(id, patch) {
    await wait();
    const guest = required(store().guests.find((a) => a.id === id), `Guest ${id} no longer exists.`);
    Object.assign(guest, patch, { updatedAt: nowIso() });
    return copy(guest);
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.guests.findIndex((a) => a.id === id);
    if (index === -1) throw new DataError("not-found", `Guest ${id} no longer exists.`);
    state.guests.splice(index, 1);
    const affected = new Set(state.registrations.filter((r) => r.guestId === id).map((r) => r.eventId));
    state.registrations = state.registrations.filter((r) => r.guestId !== id);
    affected.forEach(syncRegistrationCount);
  },
};

/* ------------------------------------------------------------- registrations */

function joinGuest(registration: Registration): RegistrationWithGuest {
  return { ...registration, guest: store().guests.find((a) => a.id === registration.guestId) ?? null };
}

const registrations: RegistrationsRepository = {
  async list() {
    await wait();
    return copy(
      store()
        .registrations.slice()
        .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
        .map(joinGuest),
    );
  },
  async listForEvent(eventId) {
    await wait();
    return copy(
      store()
        .registrations.filter((r) => r.eventId === eventId)
        .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
        .map(joinGuest),
    );
  },
  async create(draft) {
    await wait();
    const event = requireEvent(draft.eventId);
    const state = store();
    if (!state.guests.some((a) => a.id === draft.guestId)) {
      throw new DataError("not-found", "That guest no longer exists.");
    }
    const duplicate = state.registrations.find(
      (r) => r.eventId === draft.eventId && r.guestId === draft.guestId && r.status !== "cancelled",
    );
    if (duplicate) throw new DataError("conflict", "That guest is already registered for this event.");
    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }
    const registration: Registration = {
      id: newId("reg"),
      ownerId: DEMO_OWNER_ID,
      eventId: draft.eventId,
      eventTitle: event.title,
      guestId: draft.guestId,
      status: draft.status ?? "pending",
      registeredAt: nowIso(),
      createdAt: nowIso(),
    };
    state.registrations.push(registration);
    syncRegistrationCount(draft.eventId);
    return copy(registration);
  },
  async setStatus(id, status: RegistrationStatus) {
    await wait();
    const registration = required(
      store().registrations.find((r) => r.id === id),
      `Registration ${id} no longer exists.`,
    );
    registration.status = status;
    registration.updatedAt = nowIso();
    syncRegistrationCount(registration.eventId);
    return copy(registration);
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.registrations.findIndex((r) => r.id === id);
    if (index === -1) throw new DataError("not-found", `Registration ${id} no longer exists.`);
    const [removed] = state.registrations.splice(index, 1);
    if (removed) syncRegistrationCount(removed.eventId);
  },
};

/* ------------------------------------------------------------------- vendors */

const vendors: OwnedRepository<Vendor, VendorDraft, VendorPatch> = {
  async list() {
    await wait();
    return copy(store().vendors.slice().sort((a, b) => a.name.localeCompare(b.name)));
  },
  async get(id) {
    await wait();
    return copy(store().vendors.find((v) => v.id === id) ?? null);
  },
  async create(draft) {
    await wait();
    const vendor: Vendor = {
      id: newId("ven"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      category: draft.category,
      description: draft.description ?? null,
      contactEmail: draft.contactEmail ?? null,
      contactPhone: draft.contactPhone ?? null,
      website: draft.website ?? null,
      logoUrl: draft.logoUrl ?? null,
      rating: draft.rating ?? null,
      city: draft.city ?? null,
      state: draft.state ?? null,
      country: draft.country ?? null,
      lastMessage: null,
      lastMessageAt: null,
      lastDirection: null,
      unreadCount: 0,
      createdAt: nowIso(),
    };
    store().vendors.push(vendor);
    return copy(vendor);
  },
  async update(id, patch) {
    await wait();
    const vendor = required(store().vendors.find((v) => v.id === id), `Vendor ${id} no longer exists.`);
    Object.assign(vendor, patch, { updatedAt: nowIso() });
    for (const booking of store().eventVendors) {
      if (booking.vendorId === id) booking.vendor = vendor;
    }
    return copy(vendor);
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.vendors.findIndex((v) => v.id === id);
    if (index === -1) throw new DataError("not-found", `Vendor ${id} no longer exists.`);
    state.vendors.splice(index, 1);
    state.eventVendors = state.eventVendors.filter((booking) => booking.vendorId !== id);
    state.vendorMessages = state.vendorMessages.filter((m) => m.vendorId !== id);
  },
};

const vendorMessages: VendorMessagesRepository = {
  async list(vendorId) {
    await wait();
    return copy(
      store()
        .vendorMessages.filter((m) => m.vendorId === vendorId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  },
  async send(vendorId, draft) {
    await wait();
    if (!store().vendors.some((v) => v.id === vendorId)) {
      throw new DataError("not-found", "That vendor no longer exists.");
    }
    const message: VendorMessage = {
      id: newId("vm"),
      vendorId,
      eventId: draft.eventId ?? null,
      direction: "outbound",
      senderName: draft.senderName,
      subject: draft.subject ?? null,
      content: draft.content,
      isRead: true,
      createdAt: nowIso(),
    };
    store().vendorMessages.push(message);
    syncVendorThread(vendorId);
    return copy(message);
  },
  async markThreadRead(vendorId) {
    await wait();
    for (const message of store().vendorMessages) {
      if (message.vendorId === vendorId) message.isRead = true;
    }
    syncVendorThread(vendorId);
  },
};

/* -------------------------------------------------------- workspace records */

const eventVendors = eventScoped<EventVendor, EventVendorDraft, EventVendorPatch>(
  () => store().eventVendors,
  "ev",
  (eventId, draft) => ({
    id: "",
    eventId,
    vendorId: draft.vendorId,
    notes: draft.notes ?? null,
    status: draft.status ?? "pending",
    feeCents: draft.feeCents ?? null,
    vendor: store().vendors.find((v) => v.id === draft.vendorId) ?? null,
    createdAt: nowIso(),
  }),
  "vendor-booking",
  (a, b) => a.createdAt.localeCompare(b.createdAt),
);

const checklist = eventScoped<ChecklistItem, ChecklistItemDraft, ChecklistItemPatch>(
  () => store().checklist,
  "cl",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    title: draft.title,
    description: draft.description ?? null,
    completed: draft.completed ?? false,
    dueDate: draft.dueDate ?? null,
    assignedTo: draft.assignedTo ?? null,
    category: draft.category ?? "General",
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
);

const runOfShow = eventScoped<RunOfShowItem, RunOfShowItemDraft, RunOfShowItemPatch>(
  () => store().runOfShow,
  "ros",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    startTime: draft.startTime,
    duration: draft.duration ?? null,
    title: draft.title,
    description: draft.description ?? null,
    responsible: draft.responsible ?? null,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "run-of-show",
  (a, b) => a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder,
);

const budget = eventScoped<BudgetItem, BudgetItemDraft, BudgetItemPatch>(
  () => store().budget,
  "bud",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    name: draft.name,
    category: draft.category ?? "General",
    type: draft.type,
    estimatedCents: draft.estimatedCents,
    actualCents: draft.actualCents ?? null,
    notes: draft.notes ?? null,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "budget",
);

const menu = eventScoped<MenuItem, MenuItemDraft, MenuItemPatch>(
  () => store().menu,
  "menu",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    name: draft.name,
    description: draft.description ?? null,
    course: draft.course ?? "Main",
    dietaryTags: draft.dietaryTags ?? [],
    priceCents: draft.priceCents ?? null,
    serves: draft.serves ?? null,
    notes: draft.notes ?? null,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
);

const moodBoard = eventScoped<MoodBoardImage, { url: string; caption?: string | null }, { caption?: string | null; sortOrder?: number }>(
  () => store().moodBoard,
  "insp",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    url: draft.url,
    caption: draft.caption ?? null,
    sortOrder,
    createdAt: nowIso(),
  }),
);

const auction = eventScoped<AuctionItem, AuctionItemDraft, AuctionItemPatch>(
  () => store().auction,
  "auc",
  (eventId, draft) => ({
    id: "",
    eventId,
    title: draft.title,
    description: draft.description ?? null,
    imageUrl: draft.imageUrl ?? null,
    startingBidCents: draft.startingBidCents ?? null,
    currentBidCents: draft.currentBidCents ?? null,
    fairMarketValueCents: draft.fairMarketValueCents ?? null,
    winnerName: draft.winnerName ?? null,
    donorName: draft.donorName ?? null,
    paymentMethod: draft.paymentMethod ?? null,
    paymentLink: draft.paymentLink ?? null,
    paymentReceivedAt: draft.paymentReceivedAt ?? null,
    status: draft.status ?? "open",
    auctionType: draft.auctionType ?? "silent",
    lotNumber: draft.lotNumber ?? null,
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => (a.lotNumber ?? 999) - (b.lotNumber ?? 999),
);

const sponsorships = eventScoped<Sponsorship, SponsorshipDraft, SponsorshipPatch>(
  () => store().sponsorships,
  "spo",
  (eventId, draft) => ({
    id: "",
    eventId,
    companyName: draft.companyName,
    tier: draft.tier ?? "custom",
    amountCents: draft.amountCents ?? null,
    logoUrl: draft.logoUrl ?? null,
    contactEmail: draft.contactEmail ?? null,
    contactName: draft.contactName ?? null,
    notes: draft.notes ?? null,
    status: draft.status ?? "pending",
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0),
);

/* ------------------------------------------------------------------- tickets */

const ticketsBase = eventScoped<TicketType, TicketTypeDraft, TicketTypePatch>(
  () => store().tickets,
  "tt",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    name: draft.name,
    description: draft.description ?? null,
    priceCents: draft.priceCents,
    quantityTotal: draft.quantityTotal,
    quantitySold: 0,
    isActive: draft.isActive ?? true,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
);

const tickets: TicketsRepository = {
  ...ticketsBase,
  async update(eventId, id, patch) {
    const row = store().tickets.find((t) => t.id === id && t.eventId === eventId);
    if (row && patch.quantityTotal !== undefined && patch.quantityTotal !== 0 && patch.quantityTotal < row.quantitySold) {
      throw new DataError("invalid", `${row.quantitySold} of these are already sold — the allocation can't go below that.`);
    }
    return ticketsBase.update(eventId, id, patch);
  },
  async listAll() {
    await wait();
    const state = store();
    const rows: TicketTypeWithEvent[] = [];
    for (const ticket of state.tickets) {
      const event = state.events.find((e) => e.id === ticket.eventId);
      if (!event) continue;
      rows.push({
        ...copy(ticket),
        eventTitle: event.title,
        eventDate: event.date,
        eventStatus: event.status,
        eventCategory: event.category,
      });
    }
    return rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.sortOrder - b.sortOrder);
  },
  async purchase(shareToken, ticketTypeId, buyer) {
    await wait();
    const state = store();
    const event = state.events.find((e) => e.shareToken === shareToken);
    if (!event) throw new DataError("not-found", "This ticket link is no longer active.");
    const ticket = state.tickets.find((t) => t.id === ticketTypeId && t.eventId === event.id);
    if (!ticket) throw new DataError("not-found", "That ticket type is no longer available.");
    if (!ticket.isActive) throw new DataError("conflict", `${ticket.name} is not on sale.`);
    const remaining = ticket.quantityTotal === 0 ? Number.POSITIVE_INFINITY : ticket.quantityTotal - ticket.quantitySold;
    if (buyer.quantity > remaining) {
      throw new DataError("conflict", remaining <= 0 ? `${ticket.name} is sold out.` : `Only ${remaining} left of ${ticket.name}.`);
    }

    ticket.quantitySold += buyer.quantity;
    ticket.updatedAt = nowIso();

    // Public checkout creates the guest too, matching the Firestore adapter.
    let guest = state.guests.find((a) => a.contact.toLowerCase() === buyer.contact.toLowerCase());
    if (!guest) {
      guest = {
        id: newId("att"),
        ownerId: event.ownerId,
        name: buyer.name,
        contact: buyer.contact,
        notes: null,
        createdAt: nowIso(),
      };
      state.guests.push(guest);
    }
    state.registrations.push({
      id: newId("reg"),
      ownerId: event.ownerId,
      eventId: event.id,
      eventTitle: event.title,
      guestId: guest.id,
      status: "confirmed",
      registeredAt: nowIso(),
      createdAt: nowIso(),
    });
    syncRegistrationCount(event.id);
  },
};

/* -------------------------------------------------------------------- raffle */

const raffleBase = eventScoped<RaffleItem, RaffleItemDraft, RaffleItemPatch>(
  () => store().raffle,
  "raf",
  (eventId, draft) => ({
    id: "",
    eventId,
    name: draft.name,
    description: draft.description ?? null,
    imageUrl: draft.imageUrl ?? null,
    ticketPriceCents: draft.ticketPriceCents ?? 0,
    totalTickets: draft.totalTickets ?? 0,
    soldTickets: 0,
    winnerName: null,
    winnerEmail: null,
    winnerTicketId: null,
    drawnAt: null,
    status: draft.status ?? "open",
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => a.createdAt.localeCompare(b.createdAt),
);

const raffle: RaffleRepository = {
  ...raffleBase,
  async remove(eventId, id) {
    const state = store();
    state.raffleTickets = state.raffleTickets.filter((t) => t.raffleItemId !== id);
    return raffleBase.remove(eventId, id);
  },
  async listTickets(eventId, raffleItemId) {
    await wait();
    return copy(
      store()
        .raffleTickets.filter((t) => t.eventId === eventId && t.raffleItemId === raffleItemId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },
  async sellTickets(eventId, raffleItemId, buyer) {
    await wait();
    const state = store();
    const item = required(
      state.raffle.find((r) => r.id === raffleItemId && r.eventId === eventId),
      "That raffle no longer exists.",
    );
    if (item.status !== "open") throw new DataError("conflict", `${item.name} is closed.`);
    const remaining = item.totalTickets === 0 ? Number.POSITIVE_INFINITY : item.totalTickets - item.soldTickets;
    if (buyer.quantity > remaining) {
      throw new DataError("conflict", `Only ${remaining} tickets left for ${item.name}.`);
    }
    const ticket: RaffleTicket = {
      id: newId("rt"),
      raffleItemId,
      eventId,
      buyerName: buyer.buyerName,
      buyerEmail: buyer.buyerEmail,
      quantity: buyer.quantity,
      createdAt: nowIso(),
    };
    state.raffleTickets.push(ticket);
    item.soldTickets += buyer.quantity;
    item.updatedAt = nowIso();
    return copy(ticket);
  },
  async draw(eventId, raffleItemId) {
    await wait();
    const state = store();
    const item = required(
      state.raffle.find((r) => r.id === raffleItemId && r.eventId === eventId),
      "That raffle no longer exists.",
    );
    const entries = state.raffleTickets.filter((t) => t.raffleItemId === raffleItemId);
    if (entries.length === 0) throw new DataError("conflict", "No tickets have been sold yet.");
    // Weighted by quantity: buying ten tickets is ten chances, not one.
    const pool = entries.flatMap((entry) => Array.from({ length: entry.quantity }, () => entry));
    const winner = pool[Math.floor(Math.random() * pool.length)]!;
    item.winnerName = winner.buyerName;
    item.winnerEmail = winner.buyerEmail;
    item.winnerTicketId = winner.id;
    item.drawnAt = nowIso();
    item.status = "drawn";
    item.updatedAt = nowIso();
    return copy(item);
  },
};

/* ----------------------------------------------------------------- templates */

/* ---------------------------------------------------------------------- rfps */

const rfpsBase = eventScoped<Rfp, RfpDraft, RfpPatch>(
  () => store().rfps,
  "rfp",
  (eventId, draft) => ({
    id: "",
    eventId,
    title: draft.title,
    vendorCategory: draft.vendorCategory,
    description: draft.description ?? null,
    budgetMinCents: draft.budgetMinCents ?? null,
    budgetMaxCents: draft.budgetMaxCents ?? null,
    headcount: draft.headcount ?? null,
    deadline: draft.deadline ?? null,
    requirements: draft.requirements ?? null,
    status: draft.status ?? "draft",
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => b.createdAt.localeCompare(a.createdAt),
);

/** The RFP has to belong to the event before its responses can be touched. */
function requireRfp(eventId: string, rfpId: string): Rfp {
  return required(
    store().rfps.find((row) => row.id === rfpId && row.eventId === eventId),
    `RFP ${rfpId} no longer exists.`,
  );
}

const rfps: RfpsRepository = {
  ...rfpsBase,

  async list(eventId) {
    await wait();
    const responses = store().rfpResponses;
    return copy(
      store()
        .rfps.filter((row) => row.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((rfp) => ({
          ...rfp,
          responses: responses
            .filter((response) => response.rfpId === rfp.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        })),
    );
  },

  async remove(eventId, id) {
    await rfpsBase.remove(eventId, id);
    // Responses are owned by the RFP, so they go with it.
    const responses = store().rfpResponses;
    for (let i = responses.length - 1; i >= 0; i -= 1) {
      if (responses[i]!.rfpId === id) responses.splice(i, 1);
    }
  },

  async addResponse(eventId, rfpId, draft) {
    await wait();
    requireRfp(eventId, rfpId);
    const response: RfpResponse = {
      id: newId("rfpres"),
      rfpId,
      vendorName: draft.vendorName,
      contactName: draft.contactName ?? null,
      contactEmail: draft.contactEmail ?? null,
      contactPhone: draft.contactPhone ?? null,
      quotedAmountCents: draft.quotedAmountCents ?? null,
      notes: draft.notes ?? null,
      status: draft.status ?? "pending",
      createdAt: nowIso(),
    };
    store().rfpResponses.push(response);
    return copy(response);
  },

  async setResponseStatus(eventId, rfpId, responseId, status) {
    await wait();
    requireRfp(eventId, rfpId);
    const response = required(
      store().rfpResponses.find((row) => row.id === responseId && row.rfpId === rfpId),
      `Response ${responseId} no longer exists.`,
    );
    response.status = status;
    return copy(response);
  },

  async removeResponse(eventId, rfpId, responseId) {
    await wait();
    requireRfp(eventId, rfpId);
    const responses = store().rfpResponses;
    const index = responses.findIndex((row) => row.id === responseId && row.rfpId === rfpId);
    if (index === -1) throw new DataError("not-found", `Response ${responseId} no longer exists.`);
    responses.splice(index, 1);
  },
};

/* ------------------------------------------------------------------ deposits */

const deposits = eventScoped<Deposit, DepositDraft, DepositPatch>(
  () => store().deposits,
  "dep",
  (eventId, draft) => ({
    id: "",
    eventId,
    vendorName: draft.vendorName,
    amountCents: draft.amountCents,
    dueDate: draft.dueDate ?? null,
    paidDate: draft.paidDate ?? null,
    paidBy: draft.paidBy ?? null,
    paymentMethod: draft.paymentMethod ?? null,
    status: draft.status ?? "pending",
    notes: draft.notes ?? null,
    createdAt: nowIso(),
  }),
  undefined,
  // Soonest due first; deposits with no due date sink to the bottom.
  (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
);

/* ---------------------------------------------------------------- team hours */

const teamHours = eventScoped<TeamHoursEntry, TeamHoursDraft, TeamHoursPatch>(
  () => store().teamHours,
  "hrs",
  (eventId, draft) => ({
    id: "",
    eventId,
    staffMember: draft.staffMember,
    role: draft.role,
    hours: draft.hours,
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => b.hours - a.hours,
);

const templates: TemplatesRepository = {
  async list() {
    await wait();
    return copy(
      store()
        .templates.map(({ checklistItems: _c, runOfShowItems: _r, budgetItems: _b, ...template }) => template)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  },
  async get(id) {
    await wait();
    const template = store().templates.find((t) => t.id === id);
    return template ? (copy(template) as TemplateDetail) : null;
  },
  async create(draft) {
    await wait();
    const template: Template & TemplateContents = {
      id: newId("tpl"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      description: draft.description ?? null,
      category: draft.category,
      defaultCapacity: draft.defaultCapacity ?? null,
      checklistCount: 0,
      runOfShowCount: 0,
      budgetCount: 0,
      createdAt: nowIso(),
      checklistItems: [],
      runOfShowItems: [],
      budgetItems: [],
    };
    store().templates.push(template);
    return copy(template);
  },
  async update(id, patch) {
    await wait();
    const template = required(store().templates.find((t) => t.id === id), `Template ${id} no longer exists.`);
    Object.assign(template, patch, { updatedAt: nowIso() });
    return copy(template);
  },
  async replaceContents(id, contents: TemplateContents) {
    await wait();
    const template = required(store().templates.find((t) => t.id === id), `Template ${id} no longer exists.`);
    template.checklistItems = copy(contents.checklistItems);
    template.runOfShowItems = copy(contents.runOfShowItems);
    template.budgetItems = copy(contents.budgetItems);
    template.checklistCount = template.checklistItems.length;
    template.runOfShowCount = template.runOfShowItems.length;
    template.budgetCount = template.budgetItems.length;
    template.updatedAt = nowIso();
    return copy(template) as TemplateDetail;
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.templates.findIndex((t) => t.id === id);
    if (index === -1) throw new DataError("not-found", `Template ${id} no longer exists.`);
    state.templates.splice(index, 1);
  },
};

/* ------------------------------------------------------------------ settings */

const settings: SettingsRepository = {
  async get() {
    await wait(0);
    return copy(store().settings);
  },
  async update(patch: Partial<UserSettings>) {
    await wait(0);
    Object.assign(store().settings, patch);
    return copy(store().settings);
  },
};

/* ----------------------------------------------------------------------- roi */

/* ------------------------------------------------------------------ boards */

const canvases: CanvasesRepository = {
  async list() {
    await wait();
    return copy(store().canvases.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async get(id) {
    await wait();
    return copy(store().canvases.find((board) => board.id === id) ?? null);
  },
  async create(draft: CanvasDraft) {
    await wait();
    const board: Canvas = {
      id: newId("cvs"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      description: draft.description ?? null,
      eventId: draft.eventId ?? null,
      cards: [],
      createdAt: nowIso(),
    };
    store().canvases.push(board);
    return copy(board);
  },
  async update(id, patch: CanvasPatch) {
    await wait();
    const board = required(store().canvases.find((row) => row.id === id), `Board ${id} no longer exists.`);
    Object.assign(board, patch, { updatedAt: nowIso() });
    return copy(board);
  },
  async replaceCards(id, cards: CanvasCard[]) {
    await wait();
    const board = required(store().canvases.find((row) => row.id === id), `Board ${id} no longer exists.`);
    board.cards = copy(cards);
    board.updatedAt = nowIso();
    return copy(board);
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.canvases.findIndex((row) => row.id === id);
    if (index === -1) throw new DataError("not-found", `Board ${id} no longer exists.`);
    state.canvases.splice(index, 1);
  },
};

/* --------------------------------------------------------------- floorplan */

const floorplan: FloorplanRepository = {
  async get(eventId) {
    await wait();
    return copy(store().floorplans.find((plan) => plan.eventId === eventId) ?? null);
  },
  async save(eventId, draft: FloorplanDraft) {
    await wait();
    const event = requireEvent(eventId);
    const state = store();
    const record: Floorplan = { eventId, name: draft.name, items: copy(draft.items), updatedAt: nowIso() };
    const existing = state.floorplans.find((plan) => plan.eventId === eventId);
    const before = existing ? (copy(existing) as unknown as Record<string, unknown>) : null;
    if (existing) Object.assign(existing, record);
    else state.floorplans.push(record);
    appendHistory({
      eventId,
      resource: "floorplan",
      resourceId: eventId,
      action: before ? "updated" : "created",
      before,
      after: {
        ...copy(record),
        locationId: event.locationId,
        location: event.location,
        guestCount: event.registrationCount,
        capacity: event.capacity,
      } as unknown as Record<string, unknown>,
    });
    return copy(record);
  },
};

const history: EventHistoryRepository = {
  async list(eventId) {
    await wait();
    return copy(
      store()
        .history.filter((entry) => entry.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },
};

const roi: RoiRepository = {
  async get(eventId) {
    await wait();
    return copy(store().roi.find((r) => r.eventId === eventId) ?? null);
  },
  async save(eventId, input) {
    await wait();
    const state = store();
    const existing = state.roi.find((r) => r.eventId === eventId);
    const record: EventRoi = { eventId, ...input, updatedAt: nowIso() };
    if (existing) Object.assign(existing, record);
    else state.roi.push(record);
    return copy(record);
  },
};

/* ----------------------------------------------------------------- analytics */

/** Groups a table by `eventId` in one pass, so health for N events costs one scan. */
function groupByEvent<T extends { eventId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.eventId);
    if (bucket) bucket.push(row);
    else grouped.set(row.eventId, [row]);
  }
  return grouped;
}

function healthFor(eventIds?: string[]): EventHealth[] {
  const state = store();
  const targets = eventIds ? state.events.filter((e) => eventIds.includes(e.id)) : state.events;
  const checklistByEvent = groupByEvent(state.checklist);
  const vendorsByEvent = groupByEvent(state.eventVendors);
  const budgetByEvent = groupByEvent(state.budget);
  const ticketsByEvent = groupByEvent(state.tickets);
  const sponsorshipsByEvent = groupByEvent(state.sponsorships);
  const auctionByEvent = groupByEvent(state.auction);
  const raffleByEvent = groupByEvent(state.raffle);

  return targets.map((event) =>
    computeEventHealth({
      event,
      checklist: checklistByEvent.get(event.id) ?? [],
      vendors: vendorsByEvent.get(event.id) ?? [],
      budget: budgetByEvent.get(event.id) ?? [],
      tickets: ticketsByEvent.get(event.id) ?? [],
      sponsorships: sponsorshipsByEvent.get(event.id) ?? [],
      auction: auctionByEvent.get(event.id) ?? [],
      raffle: raffleByEvent.get(event.id) ?? [],
    }),
  );
}

const analytics: AnalyticsRepository = {
  async portfolio() {
    await wait();
    const state = store();
    return computePortfolio({
      events: state.events,
      registrations: state.registrations,
      guestCount: state.guests.length,
      locationCount: state.locations.length,
      vendorCount: state.vendors.length,
      budget: state.budget,
      tickets: state.tickets,
      sponsorships: state.sponsorships,
      auction: state.auction,
      raffle: state.raffle,
    });
  },
  async health(eventIds) {
    await wait();
    return healthFor(eventIds);
  },
  async attention() {
    await wait();
    return buildAttention(store().events, healthFor());
  },
  async openTasks() {
    await wait();
    const state = store();
    const now = new Date();
    const eventById = new Map(state.events.map((event) => [event.id, event]));

    return state.checklist
      .filter((item) => !item.completed)
      .flatMap((item) => {
        const event = eventById.get(item.eventId);
        // Completed and cancelled events aren't work any more.
        if (!event || event.status === "completed" || event.status === "cancelled") return [];
        return [
          {
            ...copy(item),
            eventTitle: event.title,
            eventDate: event.date,
            eventStatus: event.status,
            daysUntilEvent: daysUntil(event.date, now),
            overdue: item.dueDate !== null && new Date(item.dueDate) < now,
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          (a.daysUntilEvent ?? 9999) - (b.daysUntilEvent ?? 9999) ||
          a.sortOrder - b.sortOrder,
      );
  },
};

export const memoryAdapter: DataAdapter = {
  kind: "memory",

  // The demo has a single implicit workspace and no roles to speak of.
  me: async () => {
    const started = new Date();
    const ends = new Date(started);
    ends.setMonth(ends.getMonth() + 3);
    return {
      userId: DEMO_OWNER_ID,
      workspaceId: DEMO_OWNER_ID,
      role: "owner",
      access: { status: "beta", betaStartedAt: started.toISOString(), betaEndsAt: ends.toISOString() },
    };
  },
  assistant: {
    chat: async ({ messages }) => {
      await wait();
      return nextTurn(messages);
    },
    plan: async (brief) => {
      await wait();
      const event = requireEvent(brief.eventId);
      const current = store();
      const memory: PastEventPlanningRecord[] = current.events
        .filter((candidate) => candidate.status === "completed" && candidate.id !== event.id)
        .map((candidate) => ({
          event: candidate,
          budget: current.budget.filter((line) => line.eventId === candidate.id).map((line) => ({
            name: line.name,
            category: line.category,
            type: line.type,
            estimatedCents: line.estimatedCents,
            actualCents: line.actualCents,
            notes: line.notes,
            sortOrder: line.sortOrder,
          })),
          checklist: current.checklist.filter((item) => item.eventId === candidate.id).map((item) => ({
            title: item.title,
            description: item.description,
            completed: item.completed,
            assignedTo: item.assignedTo,
            category: item.category,
            sortOrder: item.sortOrder,
            dueDaysBefore: item.dueDate
              ? Math.max(0, Math.round((new Date(candidate.date).getTime() - new Date(item.dueDate).getTime()) / 86_400_000))
              : 14,
          })),
          runOfShow: current.runOfShow.filter((cue) => cue.eventId === candidate.id).map((cue) => ({
            startTime: cue.startTime,
            duration: cue.duration,
            title: cue.title,
            description: cue.description,
            responsible: cue.responsible,
            sortOrder: cue.sortOrder,
          })),
          moodCaptions: current.moodBoard
            .filter((image) => image.eventId === candidate.id && image.caption)
            .map((image) => image.caption!),
          floorplanShapes: current.floorplans
            .find((plan) => plan.eventId === candidate.id)?.items.map((item) => item.shape) ?? [],
        }));
      return buildRuleBasedSuggestions(event, brief, memory);
    },
  },
  imports: {
    loadGoogleSheet: async (url) => {
      const response = await fetch(googleSheetCsvUrl(url));
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!response.ok || contentType.includes("text/html")) {
        throw new DataError("invalid", 'Set Google Sheets sharing to "Anyone with the link can view," then try again.');
      }
      const csv = await response.text();
      if (csv.length > 2 * 1024 * 1024) throw new DataError("invalid", "This sheet is larger than the 2 MB import limit.");
      return { name: "Google Sheet", csv };
    },
  },
  events,
  locations,
  guests,
  registrations,
  vendors,
  vendorMessages,
  eventVendors,
  checklist,
  runOfShow,
  budget,
  menu,
  moodBoard,
  tickets,
  auction,
  raffle,
  sponsorships,
  rfps,
  deposits,
  teamHours,
  templates,
  canvases,
  settings,
  floorplan,
  history,
  roi,
  analytics,
};
