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
  AuctionRepository,
  CanvasesRepository,
  DataAdapter,
  EventScopedRepository,
  EventsRepository,
  FloorplanRepository,
  MembersRepository,
  EventHistoryRepository,
  TeamUpdatesRepository,
  FeedbackRepository,
  OwnedRepository,
  RaffleRepository,
  RegistrationsRepository,
  VolunteerNeedsRepository,
  RfpsRepository,
  RunOfShowDraftRepository,
  RunOfShowRepository,
  RoiRepository,
  SettingsRepository,
  TemplatesRepository,
  TicketsRepository,
  VendorMessagesRepository,
  VendorEventPacketsRepository,
} from "../adapter";
import { DataError } from "../adapter";
import { calculateProxyBid, platformFeeCents } from "../commerce";
import { normalizeAuctionPageSettings } from "../auctionSettings";
import { buildAttention, computeEventHealth, computePortfolio, daysUntil } from "../derive";
import { compareRunOfShowItems } from "../eventDays";
import { validRunOfShowOrder } from "../runOfShowOrder";
import { teamUpdateFromHistory } from "../teamUpdates";
import type {
  Guest,
  GuestDraft,
  GuestPatch,
  AuctionItem,
  AuctionItemDraft,
  AuctionItemPatch,
  AuctionDonor,
  AuctionBidder,
  AuctionBid,
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
  CheckInStation,
  CheckInStationDraft,
  CheckInStationPatch,
  Deposit,
  DepositDraft,
  DepositPatch,
  VendorPaymentPlan,
  VendorPaymentPlanDraft,
  VendorPaymentPlanPatch,
  Event,
  EventFilter,
  EventHealth,
  EventHistoryChange,
  FeedbackInboxItem,
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
  TeamUpdate,
  TeamUpdateDraft,
  Registration,
  RegistrationDetailsPatch,
  RegistrationStatus,
  RegistrationWithGuest,
  PublicRegistrationDraft,
  PublicFloorplanPayload,
  WalkInRegistrationDraft,
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
  VolunteerShift,
  VolunteerShiftDraft,
  VolunteerShiftPatch,
  VolunteerNeed,
  VolunteerNeedDraft,
  VolunteerNeedPatch,
  PublicVolunteerSignupDraft,
  WorkspaceMember,
} from "../entities";
import { buildSeed, DEMO_OWNER_ID, type MemoryDb } from "./seed";
import { describeHistoryChange } from "../history";
import { buildRuleBasedSuggestions, type PastEventPlanningRecord } from "../planner";
import { nextTurn } from "../assistantChat";
import { googleSheetCsvUrl } from "../import";
import { assignmentSummaryCounts } from "../assignmentSummary";
import { feedbackDraftSchema, feedbackValidationMessage } from "../feedback";
import { volunteerCoverage } from "../santaClara";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage, normalizeRegistrationPagePatch } from "../registrationPage";
import { normalizeEventNavigation } from "../eventNavigation";
import { buildPostEventCopyFallback, buildRegistrationCopyFallback } from "../eventCopy";
import { buildUniqueAttendanceReport, normalizeAttendeeName } from "../attendanceReport";
import { isVendorPacketEmail, vendorPacketContentKey, vendorPacketFileSlug, type VendorEventPacketDelivery } from "../vendorEventPackets";
import type { RunOfShowSyncedDraft } from "../runOfShowRecovery";

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
  event.registrationCount = store().registrations
    .filter((r) => r.eventId === eventId && r.status !== "cancelled")
    .reduce((total, registration) => total + registration.quantity, 0);
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
  "checkInStations",
  "runOfShow",
  "volunteerNeeds",
  "volunteers",
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
  "vendorPaymentPlans",
  "teamHours",
];

const events: EventsRepository = {
  async list(filter?: EventFilter) {
    await wait();
    let rows = store().events.slice();
    if (filter?.experience) rows = rows.filter((e) => (e.experience ?? "standard") === filter.experience);
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
      experience: draft.experience ?? "standard",
      title: draft.title,
      description: draft.description ?? null,
      date: draft.date,
      endDate: draft.endDate ?? null,
      timeZone: draft.timeZone ?? null,
      location: draft.location ?? (location ? `${location.name}, ${location.city ?? ""}`.replace(/, $/, "") : null),
      locationId: draft.locationId ?? null,
      locationRecord: location,
      capacity: draft.capacity ?? null,
      status: draft.status,
      category: draft.category,
      imageUrl: draft.imageUrl ?? null,
      registrationCount: 0,
      shareToken: null,
      registrationPage: draft.registrationPage ?? { ...DEFAULT_REGISTRATION_PAGE },
      navigation: normalizeEventNavigation(draft.navigation),
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
    if ("navigation" in patch) event.navigation = normalizeEventNavigation(patch.navigation);
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

  async updateRegistrationPage(id, patch) {
    await wait();
    const event = required(store().events.find((candidate) => candidate.id === id), `Event ${id} no longer exists.`);
    event.registrationPage = normalizeRegistrationPage({
      ...event.registrationPage,
      ...normalizeRegistrationPagePatch(patch),
    });
    event.updatedAt = nowIso();
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
    for (const key of memoryRunOfShowDrafts.keys()) {
      if (key.startsWith(`${id}:`)) memoryRunOfShowDrafts.delete(key);
    }
    for (const key of memoryRunOfShowDraftRevisions.keys()) {
      if (key.startsWith(`${id}:`)) memoryRunOfShowDraftRevisions.delete(key);
    }
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
        .runOfShow.filter((item) => item.eventId === event.id && normalizeRegistrationPage(event.registrationPage).showAgenda)
        .sort(compareRunOfShowItems)
        .map(({ assignedEmail: _assignedEmail, completed: _completed, ...publicCue }) => publicCue),
      tickets: store().tickets.filter((ticket) => ticket.eventId === event.id && ticket.isActive),
      sponsors: normalizeRegistrationPage(event.registrationPage).showSponsors
        ? store().sponsorships
            .filter((sponsor) => sponsor.eventId === event.id && sponsor.status === "confirmed")
            .map(({ companyName, tier, logoUrl }) => ({ companyName, tier, logoUrl }))
        : [],
      volunteerNeeds: volunteerCoverage(
        store().volunteerNeeds.filter((need) => need.eventId === event.id && normalizeRegistrationPage(event.registrationPage).showVolunteerSignup),
        store().volunteers.filter((shift) => shift.eventId === event.id),
      ),
      timeZone: event.timeZone ?? store().settings.timeZone,
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
      runOfShowItems: state.runOfShow.filter((r) => r.eventId === eventId).map((r) => ({ ...strip(r), assignedEmail: null, completed: false })),
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

  async sendAssignmentSummaries(eventId) {
    await wait();
    requireEvent(eventId);
    const state = store();
    const assignments = [
      ...state.checklist
        .filter((item) => item.eventId === eventId && !item.completed && Boolean(item.assignedTo || item.assignedEmail))
        .map((item) => ({ email: item.assignedEmail })),
      ...state.runOfShow
        .filter((item) => item.eventId === eventId && !item.completed && Boolean(item.responsible || item.assignedEmail))
        .map((item) => ({ email: item.assignedEmail })),
      ...state.volunteers
        .filter((item) => item.eventId === eventId && item.status !== "completed" && item.status !== "cancelled")
        .map((item) => ({ email: item.email })),
    ];
    const counts = assignmentSummaryCounts(assignments);
    return {
      ...counts,
      sent: counts.recipients,
      failed: 0,
    };
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
    const quantity = draft.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) {
      throw new DataError("invalid", "Attendee count must be between 1 and 10,000.");
    }
    if (event.capacity !== null && event.registrationCount + quantity > event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }
    const registration: Registration = {
      id: newId("reg"),
      ownerId: DEMO_OWNER_ID,
      eventId: draft.eventId,
      eventTitle: event.title,
      guestId: draft.guestId,
      status: draft.status ?? "pending",
      segment: draft.segment?.trim() || null,
      organization: draft.organization?.trim() || null,
      quantity,
      registeredAt: nowIso(),
      checkedInAt: null,
      checkInStation: null,
      checkInNotes: null,
      importedFields: draft.importedFields?.map((field) => ({ ...field })) ?? [],
      createdAt: nowIso(),
    };
    state.registrations.push(registration);
    syncRegistrationCount(draft.eventId);
    return copy(registration);
  },
  async importGuests(drafts) {
    const snapshot = copy(store());
    const imported: RegistrationWithGuest[] = [];
    try {
      for (const draft of drafts) {
        const guest = await guests.create({ name: draft.name, contact: draft.contact, notes: draft.notes });
        const registration = await registrations.create({
          eventId: draft.eventId,
          guestId: guest.id,
          status: draft.status,
          segment: draft.segment,
          organization: draft.organization,
          quantity: draft.quantity,
          importedFields: draft.importedFields,
        });
        imported.push({ ...registration, guest });
      }
      return imported;
    } catch (error) {
      db = snapshot;
      throw error;
    }
  },
  async registerPublic(shareToken: string, draft: PublicRegistrationDraft) {
    await wait();
    const state = store();
    const event = required(
      state.events.find((candidate) => candidate.shareToken === shareToken),
      "This registration link is no longer available.",
    );
    const name = draft.name.trim();
    const email = draft.email.trim().toLowerCase();
    const segment = draft.segment.trim();
    const page = normalizeRegistrationPage(event.registrationPage);
    if (!name) throw new DataError("invalid", "Name is required.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new DataError("invalid", "Enter a valid email address.");
    if (!segment) throw new DataError("invalid", "Guest type is required.");
    if (!page.registrationTypes.includes(segment)) throw new DataError("invalid", "That guest type is not available for this event.");
    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }

    const guest = state.guests.find((candidate) => candidate.contact?.toLowerCase() === email) ?? {
      id: newId("att"),
      ownerId: DEMO_OWNER_ID,
      name,
      contact: email,
      notes: "Registered through the public event page.",
      createdAt: nowIso(),
    };
    if (!state.guests.some((candidate) => candidate.id === guest.id)) state.guests.push(guest);
    if (state.registrations.some((row) => row.eventId === event.id && row.guestId === guest.id && row.status !== "cancelled")) {
      throw new DataError("conflict", "This email is already registered for the event.");
    }
    const now = nowIso();
    const registration: Registration = {
      id: newId("reg"), ownerId: DEMO_OWNER_ID, eventId: event.id, eventTitle: event.title,
      guestId: guest.id, status: "confirmed", segment,
      organization: page.collectOrganization ? draft.organization?.trim() || null : null, registeredAt: now,
      quantity: 1,
      checkedInAt: null, checkInStation: null, checkInNotes: null, createdAt: now,
    };
    state.registrations.push(registration);
    syncRegistrationCount(event.id);
    // Demo mode has no email provider, so never claim that a message was delivered.
    return { ...copy(registration), confirmationEmailStatus: "skipped" as const };
  },
  async createWalkIn(eventId: string, draft: WalkInRegistrationDraft) {
    await wait();
    const event = requireEvent(eventId);
    const state = store();
    const name = draft.name.trim();
    const contact = draft.contact.trim();
    if (!name) throw new DataError("invalid", "name is required.");
    if (!contact) throw new DataError("invalid", "contact is required.");
    if (state.guests.some((candidate) => candidate.contact?.toLowerCase() === contact.toLowerCase())) {
      throw new DataError("conflict", "That email is already in the people list. Search for the guest and check them in instead.");
    }
    const normalizedName = normalizeAttendeeName(name);
    const duplicateName = state.registrations.some((registration) => {
      if (registration.eventId !== eventId || registration.status === "cancelled") return false;
      const guest = state.guests.find((candidate) => candidate.id === registration.guestId);
      return guest ? normalizeAttendeeName(guest.name) === normalizedName : false;
    });
    if (duplicateName) {
      throw new DataError("conflict", "That name is already on this guest list. Search for the existing guest and check them in instead.");
    }
    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }

    const now = nowIso();
    const guest: Guest = {
      id: newId("att"),
      ownerId: DEMO_OWNER_ID,
      name,
      contact,
      notes: "Registered at event check-in.",
      createdAt: now,
    };
    const registration: Registration = {
      id: newId("reg"),
      ownerId: DEMO_OWNER_ID,
      eventId,
      eventTitle: event.title,
      guestId: guest.id,
      status: "confirmed",
      segment: draft.segment?.trim() || "Walk-in",
      organization: draft.organization?.trim() || null,
      quantity: 1,
      registeredAt: now,
      checkedInAt: now,
      checkInStation: draft.checkInStation?.trim() || null,
      checkInNotes: draft.checkInNotes?.trim() || "Registered on site.",
      createdAt: now,
    };
    state.guests.push(guest);
    state.registrations.push(registration);
    syncRegistrationCount(eventId);
    return copy({ ...registration, guest });
  },
  async updateDetails(id: string, patch: RegistrationDetailsPatch) {
    await wait();
    const state = store();
    const registration = required(
      state.registrations.find((candidate) => candidate.id === id),
      `Registration ${id} no longer exists.`,
    );
    const guest = required(
      state.guests.find((candidate) => candidate.id === registration.guestId),
      "That guest no longer exists.",
    );
    const event = requireEvent(registration.eventId);
    const name = patch.name.trim();
    const contact = patch.contact?.trim().toLowerCase() || null;

    if (!name) throw new DataError("invalid", "Name is required.");
    if (contact && !/^\S+@\S+\.\S+$/.test(contact)) {
      throw new DataError("invalid", "Enter a valid email address.");
    }
    if (
      contact &&
      state.guests.some((candidate) => candidate.id !== guest.id && candidate.contact?.toLowerCase() === contact)
    ) {
      throw new DataError("conflict", "That email address is already in your people list.");
    }
    if (!Number.isSafeInteger(patch.quantity) || patch.quantity < 1 || patch.quantity > 10_000) {
      throw new DataError("invalid", "Attendee count must be between 1 and 10,000.");
    }

    const currentContribution = registration.status === "cancelled" ? 0 : registration.quantity;
    const nextContribution = patch.status === "cancelled" ? 0 : patch.quantity;
    if (event.capacity !== null && event.registrationCount - currentContribution + nextContribution > event.capacity) {
      throw new DataError("conflict", `${event.title} is at capacity (${event.capacity}).`);
    }

    const updatedAt = nowIso();
    Object.assign(guest, {
      name,
      contact,
      notes: patch.notes?.trim() || null,
      updatedAt,
    });
    Object.assign(registration, {
      status: patch.status,
      segment: patch.segment?.trim() || null,
      organization: patch.organization?.trim() || null,
      quantity: patch.quantity,
      importedFields: patch.importedFields.map((field) => ({ ...field })),
      updatedAt,
    });
    syncRegistrationCount(registration.eventId);
    return copy({ ...registration, guest });
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
  async setSegment(id, segment) {
    await wait();
    const registration = required(
      store().registrations.find((r) => r.id === id),
      `Registration ${id} no longer exists.`,
    );
    registration.segment = segment?.trim() || null;
    registration.updatedAt = nowIso();
    return copy(registration);
  },
  async setOrganization(id, organization) {
    await wait();
    const registration = required(
      store().registrations.find((r) => r.id === id),
      `Registration ${id} no longer exists.`,
    );
    registration.organization = organization?.trim() || null;
    registration.updatedAt = nowIso();
    return copy(registration);
  },
  async setCheckIn(id, patch) {
    await wait();
    const registration = required(
      store().registrations.find((r) => r.id === id),
      `Registration ${id} no longer exists.`,
    );
    registration.checkedInAt = patch.checkedInAt;
    if (patch.checkedInAt && registration.status === "pending") {
      registration.status = "confirmed";
      syncRegistrationCount(registration.eventId);
    }
    if ("checkInStation" in patch) registration.checkInStation = patch.checkInStation?.trim() || null;
    if ("checkInNotes" in patch) registration.checkInNotes = patch.checkInNotes?.trim() || null;
    registration.updatedAt = nowIso();
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
  async getPublic(token) {
    const vendor = store().vendors.find((row) => row.id === token);
    return vendor ? { vendorName: vendor.name, messages: await vendorMessages.list(token) } : null;
  },
  async replyPublic(token, content) {
    const vendor = required(store().vendors.find((row) => row.id === token), "That conversation is not available.");
    store().vendorMessages.push({
      id: newId("vm"), vendorId: vendor.id, eventId: null, direction: "inbound",
      senderName: vendor.name, subject: null, content, isRead: false, createdAt: nowIso(),
    });
    syncVendorThread(vendor.id);
  },
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

const vendorEventPackets: VendorEventPacketsRepository = {
  async send(eventId, draft) {
    await wait();
    const event = requireEvent(eventId);
    const selectedPlans = store().floorplans.filter((plan) => plan.eventId === eventId && draft.floorplanIds.includes(plan.id));
    const attachmentNames = [
      ...(draft.includeRunOfShow && store().runOfShow.some((cue) => cue.eventId === eventId) ? [`${vendorPacketFileSlug(event.title)}-run-of-show.pdf`] : []),
      ...(selectedPlans.length ? [`${vendorPacketFileSlug(event.title)}-floorplans.pdf`] : []),
    ];
    const contentKey = JSON.stringify({
      content: vendorPacketContentKey(draft),
      event: { title: event.title, date: event.date, endDate: event.endDate, location: event.locationRecord?.name ?? event.location },
      cues: store().runOfShow.filter((cue) => cue.eventId === eventId).sort((a, b) => a.id.localeCompare(b.id)),
      plans: [...selectedPlans].sort((a, b) => a.id.localeCompare(b.id)),
    });
    if (draft.testEmail) {
      if (draft.testEmail.toLowerCase() !== "demo@beebizy.com") throw new DataError("permission-denied", "Send the test to your signed-in email address.");
      const createdAt = nowIso();
      store().history.push({ id: newId("history"), eventId, actorId: DEMO_OWNER_ID, resource: "vendor-packet", resourceId: `${draft.requestId}:test`, action: "created", summary: "Vendor event packet test sent", before: null, after: { packetRequestId: draft.requestId, test: true, contentKey, status: "sent", email: draft.testEmail, sentBy: "demo@beebizy.com" }, createdAt });
      return {
        sent: 1,
        failed: 0,
        skipped: 0,
        attachmentNames,
        deliveries: [{ vendorId: null, vendorName: "Test recipient", email: draft.testEmail, status: "sent", reason: null }],
      };
    }

    if (!draft.consentConfirmed) throw new DataError("invalid", "Confirm the recipient list before sending.");
    const successfulTest = store().history.some((entry) => entry.eventId === eventId && entry.resource === "vendor-packet" && entry.resourceId === `${draft.requestId}:test` && entry.after?.status === "sent" && entry.after?.contentKey === contentKey);
    if (!successfulTest) throw new DataError("conflict", "Send a successful test of this exact packet before emailing vendors.");

    const selected = new Set(draft.vendorIds);
    const seenEmails = new Set<string>();
    const deliveries: VendorEventPacketDelivery[] = [];
    for (const booking of store().eventVendors.filter((row) => row.eventId === eventId && selected.has(row.vendorId))) {
      const vendor = store().vendors.find((row) => row.id === booking.vendorId);
      const email = vendor?.contactEmail?.trim() ?? "";
      if (!vendor || !isVendorPacketEmail(email)) {
        deliveries.push({ vendorId: booking.vendorId, vendorName: vendor?.name ?? "Removed vendor", email, status: "skipped", reason: "No valid contact email" });
        continue;
      }
      const normalized = email.toLowerCase();
      if (seenEmails.has(normalized)) {
        deliveries.push({ vendorId: vendor.id, vendorName: vendor.name, email, status: "skipped", reason: "Duplicate contact email" });
        continue;
      }
      seenEmails.add(normalized);
      const resourceId = `${draft.requestId}:${contentKey}:${vendor.id}`;
      const alreadySent = store().history.some((entry) => entry.eventId === eventId && entry.resource === "vendor-packet" && entry.resourceId === resourceId && entry.after?.status === "sent");
      if (alreadySent) {
        deliveries.push({ vendorId: vendor.id, vendorName: vendor.name, email, status: "skipped", reason: "Already sent for this request" });
        continue;
      }
      const createdAt = nowIso();
      store().vendorMessages.push({
        id: newId("vm"), vendorId: vendor.id, eventId, direction: "outbound", senderName: "Demo organiser",
        subject: draft.subject, content: draft.message, isRead: true, deliveredAt: createdAt, deliveryError: null, createdAt,
      });
      syncVendorThread(vendor.id);
      deliveries.push({ vendorId: vendor.id, vendorName: vendor.name, email, status: "sent", reason: null });
      store().history.push({
        id: newId("history"), eventId, actorId: DEMO_OWNER_ID, resource: "vendor-packet",
        resourceId, action: "created",
        summary: `Event packet sent to ${vendor.name}`,
        before: null,
        after: { packetRequestId: draft.requestId, vendorId: vendor.id, vendorName: vendor.name, email, status: "sent", subject: draft.subject, attachmentNames, sentBy: "demo@beebizy.com" },
        createdAt,
      });
    }
    return {
      sent: deliveries.filter((delivery) => delivery.status === "sent").length,
      failed: deliveries.filter((delivery) => delivery.status === "failed").length,
      skipped: deliveries.filter((delivery) => delivery.status === "skipped").length,
      attachmentNames,
      deliveries,
    };
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
    assignedEmail: draft.assignedEmail ?? null,
    vendorId: draft.vendorId ?? null,
    category: draft.category ?? "General",
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
);

const checkInStations = eventScoped<CheckInStation, CheckInStationDraft, CheckInStationPatch>(
  () => store().checkInStations,
  "station",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    name: draft.name.trim(),
    lane: draft.lane.trim(),
    leadVolunteerId: draft.leadVolunteerId ?? null,
    lead: draft.lead?.trim() || null,
    deviceCount: Math.max(0, Math.trunc(draft.deviceCount ?? 1)),
    notes: draft.notes?.trim() || null,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "check-in-station",
);

const runOfShowBase = eventScoped<RunOfShowItem, RunOfShowItemDraft, RunOfShowItemPatch>(
  () => store().runOfShow,
  "ros",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    dayNumber: Math.max(1, Math.trunc(draft.dayNumber ?? 1)),
    startTime: draft.startTime,
    duration: draft.duration ?? null,
    title: draft.title,
    description: draft.description ?? null,
    responsible: draft.responsible ?? null,
    assignedEmail: draft.assignedEmail ?? null,
    completed: draft.completed ?? false,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "run-of-show",
  compareRunOfShowItems,
);
const runOfShow: RunOfShowRepository = {
  ...runOfShowBase,
  async reorder(eventId, dayNumber, orderedIds) {
    await wait();
    const rows = store().runOfShow.filter((cue) => cue.eventId === eventId && cue.dayNumber === dayNumber);
    if (!validRunOfShowOrder(rows.map((cue) => cue.id), orderedIds)) {
      throw new DataError("invalid", "The Run of Show changed while it was being reordered. Refresh and try again.");
    }
    const order = new Map(orderedIds.map((id, index) => [id, index + 1]));
    for (const cue of rows) cue.sortOrder = order.get(cue.id)!;
    return copy(rows.sort(compareRunOfShowItems));
  },
};

const memoryRunOfShowDrafts = new Map<string, RunOfShowSyncedDraft>();
const memoryRunOfShowDraftRevisions = new Map<string, number>();
const runOfShowDraftKey = (eventId: string, draftKey: string) => `${eventId}:${draftKey}`;
const runOfShowDrafts: RunOfShowDraftRepository = {
  async list(eventId) {
    await wait();
    return [...memoryRunOfShowDrafts.entries()]
      .filter(([key]) => key.startsWith(`${eventId}:`))
      .map(([, draft]) => copy(draft));
  },
  async save(eventId, draftKey, draft, clientUpdatedAt) {
    await wait();
    const key = runOfShowDraftKey(eventId, draftKey);
    if ((memoryRunOfShowDraftRevisions.get(key) ?? 0) > clientUpdatedAt) return copy(memoryRunOfShowDrafts.get(key) ?? null);
    const saved: RunOfShowSyncedDraft = {
      draftKey,
      draft: copy(draft),
      clientUpdatedAt,
      updatedAt: new Date().toISOString(),
    };
    memoryRunOfShowDraftRevisions.set(key, clientUpdatedAt);
    memoryRunOfShowDrafts.set(key, saved);
    return copy(saved);
  },
  async discard(eventId, draftKey, clientUpdatedAt) {
    await wait();
    const key = runOfShowDraftKey(eventId, draftKey);
    if ((memoryRunOfShowDraftRevisions.get(key) ?? 0) > clientUpdatedAt) return;
    memoryRunOfShowDraftRevisions.set(key, clientUpdatedAt);
    memoryRunOfShowDrafts.delete(key);
  },
};

const volunteers = eventScoped<VolunteerShift, VolunteerShiftDraft, VolunteerShiftPatch>(
  () => store().volunteers,
  "vol",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    needId: draft.needId ?? null,
    dayNumber: Math.max(1, Math.trunc(draft.dayNumber ?? 1)),
    name: draft.name.trim(),
    email: draft.email?.trim() || null,
    phone: draft.phone?.trim() || null,
    role: draft.role.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    status: draft.status ?? "scheduled",
    notes: draft.notes?.trim() || null,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "volunteer",
  (a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name),
);

const volunteerNeedsCrud = eventScoped<VolunteerNeed, VolunteerNeedDraft, VolunteerNeedPatch>(
  () => store().volunteerNeeds,
  "vneed",
  (eventId, draft, sortOrder) => ({
    id: "",
    eventId,
    dayNumber: Math.max(1, Math.trunc(draft.dayNumber ?? 1)),
    role: draft.role.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    requiredCount: Math.max(1, Math.min(500, Math.trunc(draft.requiredCount))),
    notes: draft.notes?.trim() || null,
    signupOpen: draft.signupOpen ?? true,
    sortOrder: draft.sortOrder ?? sortOrder,
    createdAt: nowIso(),
  }),
  "volunteer",
  (a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime) || a.role.localeCompare(b.role),
);

const volunteerNeeds: VolunteerNeedsRepository = {
  ...volunteerNeedsCrud,
  async signupPublic(shareToken: string, draft: PublicVolunteerSignupDraft) {
    await wait();
    const state = store();
    const event = required(
      state.events.find((candidate) => candidate.shareToken === shareToken),
      "This volunteer signup link is no longer available.",
    );
    if (!normalizeRegistrationPage(event.registrationPage).showVolunteerSignup) {
      throw new DataError("not-found", "Volunteer signup is not available for this event.");
    }
    const need = required(
      state.volunteerNeeds.find((candidate) => candidate.id === draft.needId && candidate.eventId === event.id),
      "That volunteer shift is no longer available.",
    );
    const name = draft.name.trim();
    const email = draft.email.trim().toLowerCase();
    if (!need.signupOpen) throw new DataError("conflict", "Signup for this shift is closed.");
    if (!name) throw new DataError("invalid", "Name is required.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new DataError("invalid", "Enter a valid email address.");
    const coverage = volunteerCoverage([need], state.volunteers.filter((shift) => shift.eventId === event.id))[0];
    if (!coverage || coverage.isFull) throw new DataError("conflict", "That volunteer shift is already full.");
    if (state.volunteers.some((shift) =>
      shift.eventId === event.id && shift.email?.toLowerCase() === email && shift.role === need.role &&
      shift.dayNumber === need.dayNumber && shift.startTime === need.startTime && shift.endTime === need.endTime && shift.status !== "cancelled")) {
      throw new DataError("conflict", "This email is already signed up for that shift.");
    }
    return volunteers.create(event.id, {
      needId: need.id,
      dayNumber: need.dayNumber,
      name,
      email,
      phone: draft.phone?.trim() || null,
      role: need.role,
      startTime: need.startTime,
      endTime: need.endTime,
      status: "confirmed",
      notes: need.notes,
    });
  },
};

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

const auctionBase = eventScoped<AuctionItem, AuctionItemDraft, AuctionItemPatch>(
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
    donorId: draft.donorId ?? null,
    category: draft.category ?? null,
    restrictions: draft.restrictions ?? null,
    expiresAt: draft.expiresAt ?? null,
    deliveryDetails: draft.deliveryDetails ?? null,
    bidIncrementCents: draft.bidIncrementCents ?? null,
    readinessStatus: draft.readinessStatus ?? "draft",
    isPublished: draft.isPublished ?? false,
    opensAt: draft.opensAt ?? null,
    closesAt: draft.closesAt ?? null,
    extensionMinutes: draft.extensionMinutes ?? 0,
    quantityAvailable: draft.quantityAvailable ?? 1,
    winningBidderId: draft.winningBidderId ?? null,
    fulfillmentStatus: draft.fulfillmentStatus ?? "pending",
    fulfilledAt: draft.fulfilledAt ?? null,
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

const memoryAuctionDonors: AuctionDonor[] = [];
const memoryAuctionBidders: AuctionBidder[] = [];
const memoryAuctionBids: AuctionBid[] = [];

const auction: AuctionRepository = {
  ...auctionBase,
  async listDonors(eventId) {
    await wait();
    return copy(memoryAuctionDonors.filter((donor) => donor.eventId === eventId));
  },
  async createDonor(eventId, draft) {
    const donor: AuctionDonor = {
      id: newId("adon"), ownerId: DEMO_OWNER_ID, eventId, publicToken: newId("donor"),
      businessName: draft.businessName, contactName: draft.contactName ?? null,
      email: draft.email ?? null, phone: draft.phone ?? null, solicitedBy: draft.solicitedBy ?? null,
      solicitationStatus: draft.solicitationStatus ?? "prospect", previousDonations: draft.previousDonations ?? null,
      notes: draft.notes ?? null, recognitionPreference: draft.recognitionPreference ?? null,
      thankYouStatus: draft.thankYouStatus ?? "pending", createdAt: nowIso(),
    };
    memoryAuctionDonors.push(donor);
    return copy(donor);
  },
  async updateDonor(eventId, donorId, patch) {
    const donor = required(memoryAuctionDonors.find((row) => row.id === donorId && row.eventId === eventId), "That donor no longer exists.");
    Object.assign(donor, patch, { updatedAt: nowIso() });
    return copy(donor);
  },
  async removeDonor(eventId, donorId) {
    const index = memoryAuctionDonors.findIndex((row) => row.id === donorId && row.eventId === eventId);
    if (index >= 0) memoryAuctionDonors.splice(index, 1);
  },
  async sendDonorThankYou(eventId, donorId) {
    const donor = required(memoryAuctionDonors.find((row) => row.id === donorId && row.eventId === eventId), "That donor no longer exists.");
    donor.thankYouStatus = "sent";
    donor.updatedAt = nowIso();
    return copy(donor);
  },
  async share(eventId) {
    const event = requireEvent(eventId);
    event.auctionPublicToken ??= newId("auction");
    event.auctionPage = normalizeAuctionPageSettings(event.auctionPage);
    return { auctionPublicToken: event.auctionPublicToken };
  },
  async updateSettings(eventId, settings) {
    const event = requireEvent(eventId);
    event.auctionPage = normalizeAuctionPageSettings(settings);
    return event.auctionPage;
  },
  async publishItem(eventId, itemId, published) {
    return auctionBase.update(eventId, itemId, { isPublished: published, readinessStatus: published ? "published" : "ready" });
  },
  async listBidders(eventId) {
    return copy(memoryAuctionBidders.filter((bidder) => bidder.eventId === eventId));
  },
  async listBids(eventId) {
    return copy(memoryAuctionBids.filter((bid) => bid.eventId === eventId));
  },
  async getPublic(token) {
    const event = store().events.find((row) => row.auctionPublicToken === token);
    if (!event) return null;
    const settings = normalizeAuctionPageSettings(event.auctionPage);
    const items = store().auction.filter((item) => item.eventId === event.id && item.isPublished).map((item) => ({
      id: item.id, title: item.title, description: item.description, imageUrl: item.imageUrl,
      category: item.category ?? null, restrictions: item.restrictions ?? null, expiresAt: item.expiresAt ?? null,
      deliveryDetails: item.deliveryDetails ?? null, fairMarketValueCents: item.fairMarketValueCents,
      startingBidCents: item.startingBidCents ?? 0, currentBidCents: item.currentBidCents,
      bidIncrementCents: item.bidIncrementCents ?? 100, opensAt: item.opensAt ?? null, closesAt: item.closesAt ?? null,
      status: item.status, lotNumber: item.lotNumber,
      bidCount: memoryAuctionBids.filter((bid) => bid.itemId === item.id).length,
      hasBid: memoryAuctionBids.some((bid) => bid.itemId === item.id),
    }));
    return {
      eventTitle: event.title, eventDate: event.date, timeZone: store().settings.timeZone, settings,
      categories: [...new Set(items.map((item) => item.category).filter((value): value is string => Boolean(value)))],
      items,
    };
  },
  async registerPublic(token, draft) {
    const event = required(store().events.find((row) => row.auctionPublicToken === token), "This auction link is no longer active.");
    const bidder: AuctionBidder = {
      id: newId("abidder"), eventId: event.id, name: draft.name, email: draft.email,
      phone: draft.phone ?? null, participantType: draft.participantType, publicToken: newId("bidder"),
      status: "active", createdAt: nowIso(),
    };
    memoryAuctionBidders.push(bidder);
    return copy(bidder);
  },
  async placePublicBid(token, bidderToken, itemId, maximumAmountCents) {
    const event = required(store().events.find((row) => row.auctionPublicToken === token), "This auction link is no longer active.");
    const bidder = required(memoryAuctionBidders.find((row) => row.publicToken === bidderToken && row.eventId === event.id), "This bidder is not registered.");
    const item = required(store().auction.find((row) => row.id === itemId && row.eventId === event.id), "This auction item is not available.");
    const increment = item.bidIncrementCents ?? 100;
    const minimum = item.currentBidCents === null ? item.startingBidCents ?? 0 : item.currentBidCents + increment;
    if (maximumAmountCents < minimum) throw new DataError("conflict", `The minimum next bid is ${minimum} cents.`);
    const bid: AuctionBid = {
      id: newId("abid"), eventId: event.id, itemId, bidderId: bidder.id, bidderName: bidder.name,
      amountCents: maximumAmountCents, maximumAmountCents, isAutomatic: false, createdAt: nowIso(),
    };
    memoryAuctionBids.push(bid);
    const latestMaximumByBidder = new Map<string, { bidderId: string; maximumAmountCents: number; sequence: number }>();
    memoryAuctionBids.forEach((candidate, sequence) => {
      if (candidate.itemId === itemId) latestMaximumByBidder.set(candidate.bidderId, {
        bidderId: candidate.bidderId,
        maximumAmountCents: candidate.maximumAmountCents,
        sequence,
      });
    });
    const result = calculateProxyBid([...latestMaximumByBidder.values()], item.startingBidCents ?? 0, increment);
    item.currentBidCents = result.currentBidCents;
    item.winningBidderId = result.leaderBidderId;
    bid.amountCents = result.currentBidCents ?? maximumAmountCents;
    const payload = await auction.getPublic(token);
    return {
      item: payload!.items.find((row) => row.id === itemId)!,
      bidderIsLeading: result.leaderBidderId === bidder.id,
      minimumNextBidCents: (result.currentBidCents ?? item.startingBidCents ?? 0) + increment,
    };
  },
  async uploadImage(file) {
    return URL.createObjectURL(file);
  },
  async getPublicDonor(token) {
    const donor = memoryAuctionDonors.find((row) => row.publicToken === token);
    if (!donor) return null;
    const event = requireEvent(donor.eventId);
    return {
      eventTitle: event.title,
      donor: {
        businessName: donor.businessName, contactName: donor.contactName, email: donor.email,
        phone: donor.phone, recognitionPreference: donor.recognitionPreference,
      },
      items: store().auction.filter((item) => item.donorId === donor.id).map((item) => ({
        id: item.id, title: item.title, description: item.description, imageUrl: item.imageUrl,
        category: item.category ?? null, restrictions: item.restrictions ?? null, expiresAt: item.expiresAt ?? null,
        fairMarketValueCents: item.fairMarketValueCents, deliveryDetails: item.deliveryDetails ?? null,
        readinessStatus: item.readinessStatus ?? "incomplete",
      })),
    };
  },
  async uploadPublicDonorImage(_token, file) {
    return URL.createObjectURL(file);
  },
  async submitPublicDonation(token, draft) {
    const donor = required(memoryAuctionDonors.find((row) => row.publicToken === token), "This donation link is no longer active.");
    await auctionBase.create(donor.eventId, {
      ...draft, donorId: donor.id, donorName: donor.businessName, readinessStatus: "incomplete",
      isPublished: false, auctionType: "silent", status: "open",
    });
    donor.solicitationStatus = "received";
    donor.recognitionPreference = draft.recognitionPreference ?? donor.recognitionPreference;
    return (await auction.getPublicDonor(token))!;
  },
  async closeItem(eventId, itemId) {
    const item = required(store().auction.find((row) => row.id === itemId && row.eventId === eventId), "That auction item no longer exists.");
    item.status = item.winningBidderId ? "won" : "closed";
    return { status: item.winningBidderId ? "winner-notified" : "closed-no-bids", paymentUrl: null };
  },
  async offerSecondChance(eventId, itemId) {
    const item = required(store().auction.find((row) => row.id === itemId && row.eventId === eventId), "That auction item no longer exists.");
    const runner = memoryAuctionBids.filter((bid) => bid.itemId === itemId && bid.bidderId !== item.winningBidderId)
      .sort((left, right) => right.maximumAmountCents - left.maximumAmountCents)[0];
    if (!runner) throw new DataError("conflict", "There is no runner-up bidder for this item.");
    item.winningBidderId = runner.bidderId;
    item.currentBidCents = runner.maximumAmountCents;
    item.status = "won";
    return { status: "winner-notified", paymentUrl: null };
  },
  async listOrders() {
    return [];
  },
  async refundOrder() {
    throw new DataError("not-found", "That auction order no longer exists.");
  },
  async getBidderProfile(token, bidderToken) {
    const event = store().events.find((row) => row.auctionPublicToken === token);
    const bidder = memoryAuctionBidders.find((row) => row.publicToken === bidderToken && row.eventId === event?.id);
    if (!event || !bidder) return null;
    const winningItemIds = store().auction.filter((item) => item.winningBidderId === bidder.id).map((item) => item.id);
    const bidItemIds = [...new Set(memoryAuctionBids.filter((bid) => bid.bidderId === bidder.id).map((bid) => bid.itemId))];
    return { ...copy(bidder), paddleNumber: bidder.paddleNumber ?? 100, hasPaymentMethod: bidder.hasPaymentMethod ?? true, grades: bidder.grades ?? [], watchedItemIds: [], winningItemIds, outbidItemIds: bidItemIds.filter((itemId) => !winningItemIds.includes(itemId)), totalDueCents: 0 };
  },
  async setupBidderWallet() {
    return { url: "/?wallet=demo" };
  },
  async setWatch(_token, _bidderToken, _itemId, watched) {
    return { watched };
  },
  async createPledge(token, bidderToken, amountCents, channel) {
    const event = required(store().events.find((row) => row.auctionPublicToken === token), "This auction link is no longer active.");
    const bidder = required(memoryAuctionBidders.find((row) => row.publicToken === bidderToken), "This bidder registration is not available.");
    return { id: newId("pledge"), eventId: event.id, bidderId: bidder.id, householdId: bidder.householdId ?? null, amountCents, appeal: "fund-a-need", designation: null, channel, anonymous: false, createdAt: nowIso() };
  },
  async buyNow(token, bidderToken, itemId) {
    const event = required(store().events.find((row) => row.auctionPublicToken === token), "This auction link is no longer active.");
    const bidder = required(memoryAuctionBidders.find((row) => row.publicToken === bidderToken), "This bidder registration is not available.");
    const item = required(store().auction.find((row) => row.eventId === event.id && row.id === itemId), "This item is not available.");
    if (!item.buyNowCents) throw new DataError("conflict", "This buy-it-now item is no longer available.");
    item.status = "won"; item.winningBidderId = bidder.id; item.winnerName = bidder.name; item.currentBidCents = item.buyNowCents;
    return { won: true, amountCents: item.buyNowCents };
  },
};

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
    let guest = state.guests.find((a) => a.contact?.toLowerCase() === buyer.contact.toLowerCase());
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
      // Bought a ticket rather than being invited, so no category until an organizer sets one.
      segment: null,
      organization: null,
      quantity: buyer.quantity,
      status: "confirmed",
      registeredAt: nowIso(),
      checkedInAt: null,
      checkInStation: null,
      checkInNotes: null,
      createdAt: nowIso(),
    });
    syncRegistrationCount(event.id);
    return {
      orderId: newId("tord"),
      kind: "free-confirmed",
      checkoutUrl: null,
      applicationFeeCents: platformFeeCents(ticket.priceCents * buyer.quantity + (buyer.donationAddOnCents ?? 0)),
    };
  },
  async listOrders() {
    await wait();
    return [];
  },
  async refundOrder() {
    await wait();
    throw new DataError("not-found", "That ticket order no longer exists.");
  },
  async listInvitations() {
    await wait();
    return [];
  },
  async sendInvitations(_eventId, recipients, options) {
    await wait();
    if (!options.consentConfirmed) throw new DataError("invalid", "Confirm that these recipients expect event communication before sending.");
    return { attempted: recipients.length, sent: recipients.length, failed: 0, invitations: [] };
  },
  async getPublicOrderStatus() {
    await wait();
    return null;
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
    targetType: draft.targetType ?? "vendor",
    vendorCategory: draft.vendorCategory,
    description: draft.description ?? null,
    eventType: draft.eventType ?? null,
    eventDate: draft.eventDate ?? null,
    startTime: draft.startTime ?? null,
    endTime: draft.endTime ?? null,
    city: draft.city ?? null,
    location: draft.location ?? null,
    budgetMinCents: draft.budgetMinCents ?? null,
    budgetMaxCents: draft.budgetMaxCents ?? null,
    headcount: draft.headcount ?? null,
    roomBlockRequired: draft.roomBlockRequired ?? false,
    roomsRequired: draft.roomsRequired ?? null,
    checkInDate: draft.checkInDate ?? null,
    checkOutDate: draft.checkOutDate ?? null,
    spaceRequirements: copy(draft.spaceRequirements ?? []),
    foodBeverageSpendCents: draft.foodBeverageSpendCents ?? null,
    ancillarySpendCents: draft.ancillarySpendCents ?? null,
    ancillarySpendNotes: draft.ancillarySpendNotes ?? null,
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
          invitations: store().rfpInvitations
            .filter((invitation) => invitation.rfpId === rfp.id)
            .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
        })),
    );
  },

  async remove(eventId, id) {
    await rfpsBase.remove(eventId, id);
    store().rfpInvitations = store().rfpInvitations.filter((invitation) => invitation.rfpId !== id);
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

  async inviteVendor(eventId, rfpId, vendorId) {
    await wait();
    if (requireRfp(eventId, rfpId).status === "closed") throw new DataError("conflict", "Reopen this RFP before inviting vendors.");
    const vendor = required(store().vendors.find((row) => row.id === vendorId), `Vendor ${vendorId} no longer exists.`);
    if (!vendor.contactEmail) throw new DataError("conflict", "Add a contact email before sending this RFP.");
    const existing = store().rfpInvitations.find((row) => row.rfpId === rfpId && row.vendorId === vendorId);
    if (existing) return copy(existing);
    const invitation = {
      id: newId("rfpinv"),
      rfpId,
      vendorId,
      vendorName: vendor.name,
      recipientEmail: vendor.contactEmail,
      publicToken: crypto.randomUUID(),
      sentAt: nowIso(),
      deliveredAt: null,
      deliveryError: "Demo mode does not send emails.",
    };
    store().rfpInvitations.push(invitation);
    return copy(invitation);
  },

  async getPublic(token) {
    await wait();
    const invitation = store().rfpInvitations.find((row) => row.publicToken === token);
    if (!invitation) return null;
    const rfp = store().rfps.find((row) => row.id === invitation.rfpId);
    if (!rfp || rfp.status === "closed") return null;
    const event = store().events.find((row) => row.id === rfp.eventId);
    if (!event || event.status === "cancelled" || event.status === "completed") return null;
    return {
      rfp: copy(rfp),
      eventTitle: event?.title ?? "Event",
      vendorName: invitation.vendorName,
      response: copy(store().rfpResponses.find((row) => row.invitationId === invitation.id) ?? null),
    };
  },

  async respondPublic(token, draft) {
    const payload = await rfps.getPublic(token);
    if (!payload) throw new DataError("not-found", "This proposal link is no longer active.");
    if (payload.response) return payload.response;
    const response = await rfps.addResponse(payload.rfp.eventId, payload.rfp.id, {
      ...draft,
      vendorName: payload.vendorName,
      status: "received",
    });
    store().rfpResponses.find((row) => row.id === response.id)!.invitationId = store().rfpInvitations.find((row) => row.publicToken === token)!.id;
    return response;
  },
};

/* ------------------------------------------------------------------ deposits */

const depositsBase = eventScoped<Deposit, DepositDraft, DepositPatch>(
  () => store().deposits,
  "dep",
  (eventId, draft) => ({
    id: "",
    eventId,
    paymentPlanId: draft.paymentPlanId ?? null,
    vendorName: draft.vendorName,
    totalAmountCents: draft.totalAmountCents ?? null,
    amountCents: draft.amountCents,
    dueDate: draft.dueDate ?? null,
    paidDate: draft.paidDate ?? null,
    balanceDueDate: draft.balanceDueDate ?? null,
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

const vendorPaymentPlansBase = eventScoped<VendorPaymentPlan, VendorPaymentPlanDraft, VendorPaymentPlanPatch>(
  () => store().vendorPaymentPlans,
  "vpp",
  (eventId, draft) => ({
    id: "",
    eventId,
    vendorName: draft.vendorName,
    totalAmountCents: draft.totalAmountCents,
    balanceDueDate: draft.balanceDueDate,
    notes: draft.notes ?? null,
    createdAt: nowIso(),
  }),
  undefined,
  (a, b) => a.vendorName.localeCompare(b.vendorName),
);

const normalizedVendorName = (value: string) => value.trim().toLocaleLowerCase();

function validatePaymentPlan(eventId: string, draft: VendorPaymentPlanDraft, currentId?: string): void {
  const duplicate = store().vendorPaymentPlans.find(
    (row) => row.eventId === eventId
      && row.id !== currentId
      && normalizedVendorName(row.vendorName) === normalizedVendorName(draft.vendorName),
  );
  if (duplicate) throw new DataError("conflict", `A payment plan already exists for ${draft.vendorName}.`);
  const paidCents = currentId
    ? store().deposits.filter((row) => row.eventId === eventId && row.paymentPlanId === currentId && row.status === "paid").reduce((total, row) => total + row.amountCents, 0)
    : 0;
  if (draft.totalAmountCents < paidCents) {
    throw new DataError("invalid", "The total vendor cost cannot be less than deposits already paid.");
  }
}

const vendorPaymentPlans: EventScopedRepository<VendorPaymentPlan, VendorPaymentPlanDraft, VendorPaymentPlanPatch> = {
  ...vendorPaymentPlansBase,
  async create(eventId, draft) {
    validatePaymentPlan(eventId, draft);
    return vendorPaymentPlansBase.create(eventId, draft);
  },
  async update(eventId, id, patch) {
    const current = required(
      store().vendorPaymentPlans.find((row) => row.id === id && row.eventId === eventId),
      `Record ${id} no longer exists.`,
    );
    validatePaymentPlan(eventId, { ...current, ...patch }, id);
    return vendorPaymentPlansBase.update(eventId, id, patch);
  },
};

function validateDepositPayment(eventId: string, deposit: DepositDraft, currentId?: string): void {
  const plan = store().vendorPaymentPlans.find((row) => row.eventId === eventId && (
    deposit.paymentPlanId ? row.id === deposit.paymentPlanId : normalizedVendorName(row.vendorName) === normalizedVendorName(deposit.vendorName)
  ));
  if (!plan) {
    if (deposit.paymentPlanId) throw new DataError("invalid", "That vendor payment plan does not belong to this event.");
    return;
  }
  const paidCents = store().deposits
    .filter((row) => row.eventId === eventId && row.id !== currentId && row.paymentPlanId === plan.id && row.status === "paid")
    .reduce((total, row) => total + row.amountCents, 0)
    + (deposit.status === "paid" ? deposit.amountCents : 0);
  if (paidCents > plan.totalAmountCents) {
    throw new DataError("invalid", "Paid deposits cannot be greater than the total vendor cost.");
  }
}

const deposits: EventScopedRepository<Deposit, DepositDraft, DepositPatch> = {
  ...depositsBase,
  async create(eventId, draft) {
    const inferredPlan = store().vendorPaymentPlans.find((row) => row.eventId === eventId && normalizedVendorName(row.vendorName) === normalizedVendorName(draft.vendorName));
    const resolved = { ...draft, paymentPlanId: draft.paymentPlanId ?? inferredPlan?.id ?? null };
    validateDepositPayment(eventId, resolved);
    return depositsBase.create(eventId, resolved);
  },
  async update(eventId, id, patch) {
    const current = required(
      store().deposits.find((row) => row.id === id && row.eventId === eventId),
      `Record ${id} no longer exists.`,
    );
    validateDepositPayment(eventId, { ...current, ...patch }, id);
    return depositsBase.update(eventId, id, patch);
  },
};

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

/** The event context every floorplan history entry carries, so a plan can be read back. */
function floorplanContext(eventId: string) {
  const event = requireEvent(eventId);
  return {
    locationId: event.locationId,
    location: event.location,
    guestCount: event.registrationCount,
    capacity: event.capacity,
  };
}

const floorplan: FloorplanRepository = {
  async list(eventId) {
    await wait();
    return copy(store().floorplans.filter((plan) => plan.eventId === eventId));
  },
  async create(eventId, draft: FloorplanDraft) {
    await wait();
    const context = floorplanContext(eventId);
    const record: Floorplan = {
      id: newId("fp"),
      eventId,
      name: draft.name,
      items: copy(draft.items),
      room: draft.room ? copy(draft.room) : undefined,
      updatedAt: nowIso(),
    };
    store().floorplans.push(record);
    appendHistory({
      eventId,
      resource: "floorplan",
      resourceId: record.id,
      action: "created",
      before: null,
      after: { ...copy(record), ...context } as unknown as Record<string, unknown>,
    });
    return copy(record);
  },
  async save(id, draft: FloorplanDraft) {
    await wait();
    const existing = required(
      store().floorplans.find((plan) => plan.id === id),
      `Floorplan ${id} no longer exists.`,
    );
    const context = floorplanContext(existing.eventId);
    const before = copy(existing) as unknown as Record<string, unknown>;
    existing.name = draft.name;
    existing.items = copy(draft.items);
    existing.room = draft.room ? copy(draft.room) : undefined;
    existing.updatedAt = nowIso();
    appendHistory({
      eventId: existing.eventId,
      resource: "floorplan",
      resourceId: id,
      action: "updated",
      before,
      after: { ...copy(existing), ...context } as unknown as Record<string, unknown>,
    });
    return copy(existing);
  },
  async share(eventId, id) {
    await wait();
    requireEvent(eventId);
    const plan = required(
      store().floorplans.find((candidate) => candidate.id === id && candidate.eventId === eventId),
      `Floorplan ${id} no longer exists.`,
    );
    return { shareToken: `demo-floorplan-${plan.id}` };
  },
  async getPublic(shareToken): Promise<PublicFloorplanPayload | null> {
    await wait();
    if (!shareToken.startsWith("demo-floorplan-")) return null;
    const planId = shareToken.slice("demo-floorplan-".length);
    const plan = store().floorplans.find((candidate) => candidate.id === planId);
    const event = plan ? store().events.find((candidate) => candidate.id === plan.eventId) : null;
    if (!event || !plan) return null;
    return copy({ eventTitle: event.title, eventDate: event.date, floorplan: plan });
  },
  async remove(id) {
    await wait();
    const state = store();
    const index = state.floorplans.findIndex((plan) => plan.id === id);
    if (index === -1) throw new DataError("not-found", `Floorplan ${id} no longer exists.`);
    const [removed] = state.floorplans.splice(index, 1);
    appendHistory({
      eventId: removed!.eventId,
      resource: "floorplan",
      resourceId: id,
      action: "deleted",
      before: copy(removed!) as unknown as Record<string, unknown>,
      after: null,
    });
  },
};

/**
 * Demo mode has exactly one person, so the team list shows them and nothing else. The
 * mutations refuse rather than pretending: a workspace of one has no role to change and
 * nobody to remove, and silently succeeding would teach the UI the wrong lesson.
 */
/** Demo invites live for the life of the tab; there is no server to persist them to. */
const invited: WorkspaceMember[] = [];

const members: MembersRepository = {
  async list() {
    await wait();
    return [
      {
        userId: DEMO_OWNER_ID,
        role: "owner",
        status: "active",
        name: "Demo organiser",
        email: "demo@beebizy.com",
        isSelf: true,
        joinedAt: nowIso(),
      },
      ...invited,
    ];
  },
  async invite(email, role, eventId) {
    await wait();
    const normalized = email.trim().toLowerCase();
    const member: WorkspaceMember = {
      userId: null,
      role,
      status: "invited",
      name: null,
      email: normalized,
      isSelf: false,
      joinedAt: nowIso(),
      eventScopeId: eventId ?? null,
      eventScopeTitle: eventId ? store().events.find((event) => event.id === eventId)?.title ?? null : null,
    };
    const existing = invited.findIndex((row) => row.email === normalized);
    if (existing === -1) invited.push(member);
    else invited[existing] = member;
    // Demo mode has no identity provider behind it, so nothing is emailed and it says so.
    return { member: copy(member), emailSent: false };
  },
  async revokeInvite(email) {
    await wait();
    const normalized = email.trim().toLowerCase();
    const index = invited.findIndex((row) => row.email === normalized);
    if (index !== -1) invited.splice(index, 1);
  },
  async setRole() {
    await wait();
    throw new DataError("conflict", "A workspace needs at least one owner. Make someone else an owner first.");
  },
  async remove() {
    await wait();
    throw new DataError("conflict", "A workspace needs at least one owner. Make someone else an owner first.");
  },
};

const feedback: FeedbackRepository = {
  async list() {
    await wait();
    return copy(
      store().feedback.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      ),
    );
  },
  async create(draft) {
    await wait();
    const parsed = feedbackDraftSchema.safeParse(draft);
    if (!parsed.success) throw new DataError("invalid", feedbackValidationMessage(parsed.error));
    const { message, category, pagePath } = parsed.data;

    const record = {
      id: newId("feedback"),
      workspaceId: DEMO_OWNER_ID,
      userId: DEMO_OWNER_ID,
      category,
      message,
      pagePath,
      createdAt: nowIso(),
    };
    store().feedback.push(record);
    return copy(record);
  },
  async listInbox(): Promise<FeedbackInboxItem[]> {
    await wait();
    return copy(
      store().feedback
        .map((item) => ({
          ...item,
          userName: "Demo organiser",
          userEmail: "demo@beebizy.com",
          workspaceName: "Demo workspace",
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
    );
  },
  async notify() {
    await wait();
    return { status: "skipped", reason: "Email delivery is unavailable in demo mode." };
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

const teamUpdates: TeamUpdatesRepository = {
  async list(eventId) {
    await wait();
    return store().history
      .filter((entry) => entry.eventId === eventId && entry.resource === "team-update")
      .map(teamUpdateFromHistory)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async create(eventId, draft: TeamUpdateDraft) {
    await wait();
    requireEvent(eventId);
    const record: TeamUpdate = { id: newId("update"), eventId, actorId: DEMO_OWNER_ID, kind: draft.kind, message: draft.message.trim(), createdAt: nowIso() };
    store().history.push({
      id: record.id,
      eventId,
      actorId: record.actorId,
      resource: "team-update",
      resourceId: record.id,
      action: "created",
      summary: record.message,
      before: null,
      after: { kind: record.kind, message: record.message },
      createdAt: record.createdAt,
    });
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
  async customReport() {
    await wait();
    const state = store();
    const healthByEvent = new Map(healthFor().map((health) => [health.eventId, health]));
    return state.events.map((event) => {
      const health = healthByEvent.get(event.id);
      return {
        eventId: event.id,
        title: event.title,
        date: event.date,
        status: event.status,
        category: event.category,
        location: event.location,
        capacity: event.capacity,
        registrations: event.registrationCount,
        readiness: health?.readiness ?? 0,
        budgetPlannedCents: health?.budgetPlannedCents ?? 0,
        budgetSpentCents: health?.budgetSpentCents ?? 0,
        revenueCents: (health?.ticketRevenueCents ?? 0) + (health?.fundraisingCents ?? 0),
        riskCount: health?.risks.length ?? 0,
      };
    });
  },
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

function planningMemoryFor(event: Event): PastEventPlanningRecord[] {
  const current = store();
  return current.events
    .filter((candidate) =>
      candidate.status === "completed" &&
      candidate.id !== event.id &&
      (candidate.experience ?? "standard") === (event.experience ?? "standard"),
    )
    .map((candidate) => ({
      event: candidate,
      budget: current.budget.filter((line) => line.eventId === candidate.id).map((line) => ({
        name: line.name, category: line.category, type: line.type, estimatedCents: line.estimatedCents,
        actualCents: line.actualCents, notes: line.notes, sortOrder: line.sortOrder,
      })),
      checklist: current.checklist.filter((item) => item.eventId === candidate.id).map((item) => ({
        title: item.title, description: item.description, completed: item.completed, assignedTo: item.assignedTo,
        category: item.category, sortOrder: item.sortOrder,
        dueDaysBefore: item.dueDate
          ? Math.max(0, Math.round((new Date(candidate.date).getTime() - new Date(item.dueDate).getTime()) / 86_400_000))
          : 14,
      })),
      runOfShow: current.runOfShow.filter((cue) => cue.eventId === candidate.id).map((cue) => ({
        dayNumber: cue.dayNumber, startTime: cue.startTime, duration: cue.duration, title: cue.title,
        description: cue.description, responsible: cue.responsible, sortOrder: cue.sortOrder,
      })),
      moodCaptions: current.moodBoard
        .filter((image) => image.eventId === candidate.id && image.caption)
        .map((image) => image.caption!),
      floorplanShapes: current.floorplans.find((plan) => plan.eventId === candidate.id)?.items.map((item) => item.shape) ?? [],
    }));
}

export const memoryAdapter: DataAdapter = {
  kind: "memory",
  cacheScope: "demo",

  // The demo has a single implicit workspace and no roles to speak of.
  me: async () => {
    const started = new Date();
    const ends = new Date(started);
    ends.setMonth(ends.getMonth() + 3);
    return {
      userId: DEMO_OWNER_ID,
      workspaceId: DEMO_OWNER_ID,
      role: "owner",
      canReviewFeedback: false,
      experience: import.meta.env.VITE_DEMO_WORKSPACE_EXPERIENCE === "santa-clara" ? "santa-clara" : "standard",
      canSwitchExperience: false,
      eventScope: null,
      access: {
        status: "beta",
        plan: null,
        betaStartedAt: started.toISOString(),
        betaEndsAt: ends.toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    };
  },
  billing: {
    checkout: async () => ({ url: "/pricing?demo=true" }),
    portal: async () => ({ url: "/pricing?demo=true" }),
    connectStatus: async () => ({
      accountId: "acct_demo",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      ready: true,
    }),
    startConnectOnboarding: async (returnTo) => ({
      accountId: "acct_demo",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      ready: true,
      onboardingUrl: `${returnTo ?? "/app/tickets"}?stripe=demo`,
    }),
  },
  fundraising: {
    getProfile: async () => ({ legalName: "Beebizy Demo School", ein: null, orgType: "nonprofit_501c3", receiptPrefix: "BEE", raffleEnabled: false, raffleRegistrationConfirmed: false, defaultCoverFees: false }),
    updateProfile: async (profile) => copy(profile),
    listCategories: async () => ["Experiences", "Travel & Stays", "Dining", "Entertainment", "Sports", "Kids & Family", "Class Projects", "Wine & Spirits", "Gift Cards", "Live Auction"].map((name, index) => ({ id: `acat-demo-${index}`, name, sortOrder: index + 1 })),
    createCategory: async (name) => ({ id: newId("acat"), name, sortOrder: 99 }),
    listSubmissions: async () => [],
    updateSubmission: async () => { throw new DataError("not-found", "That item submission no longer exists."); },
    dashboard: async () => ({ totals: { silentCents: 0, liveCents: 0, pledgesCents: 0, ticketsCents: 0, donationsCents: 0, totalCents: 0 }, bidders: { registered: 0, checkedIn: 0, remote: 0 }, items: { total: 0, noBids: 0, sold: 0, sellThroughRate: 0 }, byGrade: [], hotItems: [], noBidClosingSoon: [] }),
    extendItem: async (eventId, itemId, minutes) => {
      const item = required(store().auction.find((row) => row.eventId === eventId && row.id === itemId), "That auction item no longer exists.");
      const closesAt = new Date((item.closesAt ? new Date(item.closesAt).getTime() : Date.now()) + minutes * 60_000).toISOString();
      item.closesAt = closesAt;
      item.extensionMinutes = (item.extensionMinutes ?? 0) + minutes;
      return { closesAt, extensionMinutes: item.extensionMinutes };
    },
    extendItems: async (eventId, itemIds, minutes) => {
      let extended = 0;
      for (const itemId of itemIds) { await memoryAdapter.fundraising.extendItem(eventId, itemId, minutes); extended += 1; }
      return { extended };
    },
    reopenItem: async (eventId, itemId, minutes) => {
      const item = required(store().auction.find((row) => row.eventId === eventId && row.id === itemId), "That auction item no longer exists.");
      const closesAt = new Date(Date.now() + minutes * 60_000).toISOString();
      item.status = "open";
      item.closesAt = closesAt;
      return { closesAt, status: "open" };
    },
    getPublicIntake: async (auctionToken) => {
      const event = store().events.find((row) => row.auctionPublicToken === auctionToken);
      return event ? { eventTitle: event.title, organizationName: "Beebizy Demo School", categories: ["Experiences", "Dining"], grades: ["K", "1", "2", "3"] } : null;
    },
    submitPublicItem: async (auctionToken, draft) => {
      const event = required(store().events.find((row) => row.auctionPublicToken === auctionToken), "This donation link is no longer active.");
      const item = await auction.create(event.id, { title: draft.itemTitle, description: draft.description, imageUrl: draft.photoUrls[0], photoUrls: draft.photoUrls, estimatedValueCents: draft.estimatedValueCents, fairMarketValueCents: draft.fairMarketValueCents, category: draft.category, restrictions: draft.restrictions, expiresAt: draft.expirationDate, deliveryMethod: draft.deliveryMethod, creditText: draft.creditText, notesToSchool: draft.notesToSchool, isServiceOrUse: draft.isServiceOrUse, startingBidCents: draft.suggestedStartingBidCents });
      return { eventTitle: event.title, organizationName: "Beebizy Demo School", categories: ["Experiences", "Dining"], grades: ["K", "1", "2", "3"], submission: { id: newId("isub"), eventId: event.id, donorId: null, submittedBy: draft.donorName, publicToken: newId("submission"), payload: draft as unknown as Record<string, unknown>, status: "submitted", auctionItemId: item.id, requestedChanges: null, submittedAt: nowIso(), updatedAt: null } };
    },
    uploadPublicItemImage: async (_auctionToken, file) => URL.createObjectURL(file),
    reinvitePastDonors: async () => ({ sent: 0, failed: 0 }),
    mergeItems: async () => ({ packageItemId: newId("auc") }),
    buildBills: async () => ({ created: 0, bills: [] }),
    sendBills: async () => ({ sent: 0, autoCharged: 0, failed: 0 }),
    refundBill: async (_eventId, billId) => ({ id: billId, eventId: "evt-gala", bidderId: "bidder-1", bidderName: "Demo Bidder", bidderEmail: "demo@example.com", publicToken: "demo-bill", itemsTotalCents: 0, pledgesTotalCents: 0, feesCoveredCents: 0, totalCents: 0, applicationFeeCents: 0, status: "refunded", paidAt: null, eventTitle: "Demo Gala", lineItems: [], coverFeesAvailable: false, receiptToken: null }),
    getPublicBill: async () => null,
    payPublicBill: async (token) => ({ url: `/bill/${token}?payment=success` }),
    getPublicReceipt: async () => null,
    listCampaigns: async () => [],
    createCampaign: async (draft) => ({ id: newId("campaign"), eventId: draft.eventId ?? null, publicToken: newId("give"), title: draft.title, description: draft.description ?? null, goalCents: draft.goalCents ?? null, suggestedAmountsCents: draft.suggestedAmountsCents ?? [5_000, 10_000, 25_000, 50_000, 100_000], designations: draft.designations ?? [], defaultDesignation: draft.defaultDesignation ?? null, monthlyEnabled: true, coverFeesEnabled: true, isActive: true }),
    getPublicCampaign: async () => null,
    createDonationCheckout: async (token) => ({ donationId: newId("donation"), checkoutUrl: `/give/${token}?donation=success` }),
    getDonationStatus: async (_token, donationId) => ({ donationId, status: "paid", receiptToken: null }),
    getPublicCertificate: async () => null,
    previewBroadcast: async () => ({ recipients: 0 }),
    sendBroadcast: async () => ({ recipients: 0, sent: 0, failed: 0 }),
    recordLiveSale: async (_eventId, _itemId, paddleNumbers) => ({ winners: paddleNumbers.length }),
    undoLiveSale: async () => ({ reopened: true }),
    reports: async () => ({ bidders: [], bids: [], items: [], attendance: [], grades: [], payments: [], acknowledgments: [], historical: [], familyHistory: [], itemIntelligence: [], yearEndStatements: [] }),
    sendYearEndStatements: async () => ({ sent: 0, failed: 0 }),
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
      return buildRuleBasedSuggestions(event, brief, planningMemoryFor(event), current.settings.timeZone);
    },
    preview: async (brief) => {
      await wait();
      const current = store();
      const event: Event = {
        id: "preview", ownerId: DEMO_OWNER_ID, experience: brief.experience ?? "standard",
        title: brief.title, description: null, date: brief.date, endDate: brief.endDate ?? null,
        location: brief.location ?? null, locationId: null, locationRecord: null, capacity: brief.headcount,
        status: "draft", category: brief.category, imageUrl: null, registrationCount: 0, shareToken: null,
        registrationPage: { ...DEFAULT_REGISTRATION_PAGE }, createdAt: nowIso(),
      };
      return buildRuleBasedSuggestions(event, { ...brief, eventId: event.id }, planningMemoryFor(event), current.settings.timeZone);
    },
    registrationCopy: async (input) => {
      await wait();
      const event = requireEvent(input.eventId);
      const agenda = store().runOfShow.filter((cue) => cue.eventId === event.id);
      return buildRegistrationCopyFallback(event, agenda, input);
    },
    postEventCopy: async (input) => {
      await wait();
      const event = requireEvent(input.eventId);
      const current = store();
      const attendance = buildUniqueAttendanceReport(await registrations.listForEvent(event.id)).summary;
      const checklist = current.checklist.filter((item) => item.eventId === event.id);
      const revenueCents = current.budget.filter((item) => item.eventId === event.id && item.type === "revenue").reduce((sum, item) => sum + (item.actualCents ?? 0), 0) +
        current.sponsorships.filter((sponsor) => sponsor.eventId === event.id && sponsor.status === "confirmed").reduce((sum, sponsor) => sum + (sponsor.amountCents ?? 0), 0);
      return buildPostEventCopyFallback(event, {
        uniqueRegistered: attendance.uniqueRegistered,
        uniqueCheckedIn: attendance.uniqueCheckedIn,
        attendanceRate: attendance.uniqueRegistered > 0 ? attendance.attendanceRate : null,
        checklistDone: checklist.filter((item) => item.completed).length,
        checklistTotal: checklist.length,
        revenueCents,
      });
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
  checkInStations,
  vendors,
  vendorMessages,
  vendorEventPackets,
  eventVendors,
  checklist,
  runOfShow,
  runOfShowDrafts,
  volunteerNeeds,
  volunteers,
  budget,
  menu,
  moodBoard,
  tickets,
  auction,
  raffle,
  sponsorships,
  rfps,
  deposits,
  vendorPaymentPlans,
  teamHours,
  templates,
  canvases,
  settings,
  floorplan,
  members,
  feedback,
  history,
  teamUpdates,
  roi,
  analytics,
};
