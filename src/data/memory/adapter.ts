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
  OwnedRepository,
  RaffleRepository,
  RegistrationsRepository,
  RoiRepository,
  SettingsRepository,
  TemplatesRepository,
  TicketsRepository,
  VendorMessagesRepository,
} from "../adapter";
import { DataError } from "../adapter";
import { buildAttention, computeEventHealth, computePortfolio, daysUntil } from "../derive";
import type {
  Attendee,
  AttendeeDraft,
  AttendeePatch,
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
  Event,
  EventFilter,
  EventHealth,
  EventInspiration,
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
  Registration,
  RegistrationStatus,
  RegistrationWithAttendee,
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
  Vendor,
  VendorDraft,
  VendorMessage,
  VendorPatch,
} from "../entities";
import { buildSeed, DEMO_OWNER_ID, type MemoryDb } from "./seed";

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
      return copy(row);
    },
    async update(eventId, id, patch) {
      await wait();
      const row = required(
        table().find((r) => r.id === id && r.eventId === eventId),
        `Record ${id} no longer exists.`,
      );
      Object.assign(row, patch);
      return copy(row);
    },
    async remove(eventId, id) {
      await wait();
      const table_ = table();
      const index = table_.findIndex((r) => r.id === id && r.eventId === eventId);
      if (index === -1) throw new DataError("not-found", `Record ${id} no longer exists.`);
      table_.splice(index, 1);
    },
  };
}

/* -------------------------------------------------------------------- events */

const EVENT_SUBCOLLECTIONS: Array<keyof MemoryDb> = [
  "checklist",
  "runOfShow",
  "budget",
  "menu",
  "inspirations",
  "tickets",
  "auction",
  "raffle",
  "raffleTickets",
  "sponsorships",
  "eventVendors",
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
    syncLocationCounts();
    return copy(event);
  },

  async update(id, patch) {
    await wait();
    const event = required(store().events.find((e) => e.id === id), `Event ${id} no longer exists.`);
    Object.assign(event, patch);
    if ("locationId" in patch) {
      const location = patch.locationId ? (store().locations.find((l) => l.id === patch.locationId) ?? null) : null;
      event.locationRecord = location;
      if (location) event.location = `${location.name}, ${location.city ?? ""}`.replace(/, $/, "");
      syncLocationCounts();
    }
    event.updatedAt = nowIso();
    return copy(event);
  },

  async remove(id) {
    await wait();
    const state = store();
    const index = state.events.findIndex((e) => e.id === id);
    if (index === -1) throw new DataError("not-found", `Event ${id} no longer exists.`);
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
  },

  async share(id) {
    await wait();
    const event = required(store().events.find((e) => e.id === id), `Event ${id} no longer exists.`);
    event.shareToken ??= newId("share");
    return { shareToken: event.shareToken };
  },

  async getByShareToken(token) {
    await wait();
    return copy(store().events.find((e) => e.shareToken === token) ?? null);
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
      state.runOfShow.push({ ...copy(item), id: newId("ros"), eventId: event.id, createdAt: nowIso() });
    }
    for (const item of template.budgetItems) {
      state.budget.push({ ...copy(item), id: newId("bud"), eventId: event.id, createdAt: nowIso() });
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

/* ----------------------------------------------------------------- attendees */

const attendees: OwnedRepository<Attendee, AttendeeDraft, AttendeePatch> = {
  async list() {
    await wait();
    return copy(store().attendees.slice().sort((a, b) => a.name.localeCompare(b.name)));
  },
  async get(id) {
    await wait();
    return copy(store().attendees.find((a) => a.id === id) ?? null);
  },
  async create(draft) {
    await wait();
    const attendee: Attendee = {
      id: newId("att"),
      ownerId: DEMO_OWNER_ID,
      name: draft.name,
      contact: draft.contact,
      notes: draft.notes ?? null,
      createdAt: nowIso(),
    };
    store().attendees.push(attendee);
    return copy(attendee);
  },
  async update(id, patch) {
    await wait();
    const attendee = required(store().attendees.find((a) => a.id === id), `Attendee ${id} no longer exists.`);
    Object.assign(attendee, patch, { updatedAt: nowIso() });
    return copy(attendee);
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.attendees.findIndex((a) => a.id === id);
    if (index === -1) throw new DataError("not-found", `Attendee ${id} no longer exists.`);
    state.attendees.splice(index, 1);
    const affected = new Set(state.registrations.filter((r) => r.attendeeId === id).map((r) => r.eventId));
    state.registrations = state.registrations.filter((r) => r.attendeeId !== id);
    affected.forEach(syncRegistrationCount);
  },
};

/* ------------------------------------------------------------- registrations */

function joinAttendee(registration: Registration): RegistrationWithAttendee {
  return { ...registration, attendee: store().attendees.find((a) => a.id === registration.attendeeId) ?? null };
}

const registrations: RegistrationsRepository = {
  async list() {
    await wait();
    return copy(
      store()
        .registrations.slice()
        .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
        .map(joinAttendee),
    );
  },
  async listForEvent(eventId) {
    await wait();
    return copy(
      store()
        .registrations.filter((r) => r.eventId === eventId)
        .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
        .map(joinAttendee),
    );
  },
  async create(draft) {
    await wait();
    const event = requireEvent(draft.eventId);
    const state = store();
    if (!state.attendees.some((a) => a.id === draft.attendeeId)) {
      throw new DataError("not-found", "That attendee no longer exists.");
    }
    const duplicate = state.registrations.find(
      (r) => r.eventId === draft.eventId && r.attendeeId === draft.attendeeId && r.status !== "cancelled",
    );
    if (duplicate) throw new DataError("conflict", "That attendee is already registered for this event.");
    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }
    const registration: Registration = {
      id: newId("reg"),
      ownerId: DEMO_OWNER_ID,
      eventId: draft.eventId,
      eventTitle: event.title,
      attendeeId: draft.attendeeId,
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

const inspirations = eventScoped<EventInspiration, { url: string; caption?: string | null }, { caption?: string | null; sortOrder?: number }>(
  () => store().inspirations,
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

    // Public checkout creates the attendee too, matching the Firestore adapter.
    let attendee = state.attendees.find((a) => a.contact.toLowerCase() === buyer.contact.toLowerCase());
    if (!attendee) {
      attendee = {
        id: newId("att"),
        ownerId: event.ownerId,
        name: buyer.name,
        contact: buyer.contact,
        notes: null,
        createdAt: nowIso(),
      };
      state.attendees.push(attendee);
    }
    state.registrations.push({
      id: newId("reg"),
      ownerId: event.ownerId,
      eventId: event.id,
      eventTitle: event.title,
      attendeeId: attendee.id,
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
    requireEvent(eventId);
    const state = store();
    const record: Floorplan = { eventId, name: draft.name, items: copy(draft.items), updatedAt: nowIso() };
    const existing = state.floorplans.find((plan) => plan.eventId === eventId);
    if (existing) Object.assign(existing, record);
    else state.floorplans.push(record);
    return copy(record);
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
      attendeeCount: state.attendees.length,
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
  events,
  locations,
  attendees,
  registrations,
  vendors,
  vendorMessages,
  eventVendors,
  checklist,
  runOfShow,
  budget,
  menu,
  inspirations,
  tickets,
  auction,
  raffle,
  sponsorships,
  templates,
  canvases,
  settings,
  floorplan,
  roi,
  analytics,
};
