/**
 * The single seam between the UI and storage.
 *
 * Two implementations exist:
 *   - `memory`    — in-process store seeded with a realistic portfolio. Runs with no
 *                   credentials, which is what makes the app demoable and testable.
 *   - `firestore` — the real backend, selected automatically once Firebase env vars
 *                   are present (see `./provider`).
 *
 * Both satisfy this interface, so no screen knows or cares which one is live. Every
 * method is a plain promise — react-query owns caching, retries and invalidation on
 * top (see `./hooks`).
 */

import type {
  Attendee,
  AttendeeDraft,
  AttendeePatch,
  AttentionItem,
  AuctionItem,
  AuctionItemDraft,
  AuctionItemPatch,
  BudgetItem,
  BudgetItemDraft,
  BudgetItemPatch,
  ChecklistItem,
  ChecklistItemDraft,
  ChecklistItemPatch,
  Event,
  EventDraft,
  EventFilter,
  EventHealth,
  EventInspiration,
  EventPatch,
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
  PortfolioSummary,
  RaffleItem,
  RaffleItemDraft,
  RaffleItemPatch,
  RaffleTicket,
  Registration,
  RegistrationDraft,
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
  TemplateDraft,
  TicketType,
  TicketTypeDraft,
  TicketTypePatch,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
  VendorDraft,
  VendorMessage,
  VendorMessageDraft,
  VendorPatch,
} from "./entities";

/** CRUD over an owner-scoped top-level collection. */
export interface OwnedRepository<T, TDraft, TPatch> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(draft: TDraft): Promise<T>;
  update(id: string, patch: TPatch): Promise<T>;
  remove(id: string): Promise<void>;
}

/** CRUD over a subcollection under one event. */
export interface EventScopedRepository<T, TDraft, TPatch> {
  list(eventId: string): Promise<T[]>;
  create(eventId: string, draft: TDraft): Promise<T>;
  update(eventId: string, id: string, patch: TPatch): Promise<T>;
  remove(eventId: string, id: string): Promise<void>;
}

export interface EventsRepository extends Omit<OwnedRepository<Event, EventDraft, EventPatch>, "list"> {
  list(filter?: EventFilter): Promise<Event[]>;
  /** Idempotent: returns the existing token if the event already has one. */
  share(id: string): Promise<{ shareToken: string }>;
  /** Public lookup used by the `/e/:token` page — no auth required. */
  getByShareToken(token: string): Promise<Event | null>;
  createFromTemplate(templateId: string, draft: EventDraft): Promise<Event>;
  saveAsTemplate(eventId: string, draft: Pick<TemplateDraft, "name" | "description">): Promise<Template>;
}

export interface RegistrationsRepository {
  list(): Promise<RegistrationWithAttendee[]>;
  listForEvent(eventId: string): Promise<RegistrationWithAttendee[]>;
  create(draft: RegistrationDraft): Promise<Registration>;
  setStatus(id: string, status: RegistrationStatus): Promise<Registration>;
  remove(id: string): Promise<void>;
}

export interface VendorMessagesRepository {
  list(vendorId: string): Promise<VendorMessage[]>;
  send(vendorId: string, draft: VendorMessageDraft): Promise<VendorMessage>;
  markThreadRead(vendorId: string): Promise<void>;
}

export interface RaffleRepository extends EventScopedRepository<RaffleItem, RaffleItemDraft, RaffleItemPatch> {
  listTickets(eventId: string, raffleItemId: string): Promise<RaffleTicket[]>;
  sellTickets(eventId: string, raffleItemId: string, buyer: { buyerName: string; buyerEmail: string; quantity: number }): Promise<RaffleTicket>;
  /** Picks a winner weighted by ticket quantity and closes the raffle. */
  draw(eventId: string, raffleItemId: string): Promise<RaffleItem>;
}

export interface TicketsRepository extends EventScopedRepository<TicketType, TicketTypeDraft, TicketTypePatch> {
  /** Every ticket type across the portfolio, joined with its event. */
  listAll(): Promise<TicketTypeWithEvent[]>;
  /** Public checkout against a share token. Fails if the allocation is exhausted. */
  purchase(shareToken: string, ticketTypeId: string, buyer: { name: string; contact: string; quantity: number }): Promise<void>;
}

export interface TemplatesRepository {
  list(): Promise<Template[]>;
  get(id: string): Promise<TemplateDetail | null>;
  create(draft: TemplateDraft): Promise<Template>;
  update(id: string, patch: Partial<TemplateDraft>): Promise<Template>;
  /**
   * Replaces the template's contents wholesale. A template is edited as a document
   * rather than row by row, so one atomic write keeps the counts and the items from
   * ever disagreeing.
   */
  replaceContents(id: string, contents: TemplateContents): Promise<TemplateDetail>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings>;
  update(patch: Partial<UserSettings>): Promise<UserSettings>;
}

export interface FloorplanRepository {
  get(eventId: string): Promise<Floorplan | null>;
  save(eventId: string, draft: FloorplanDraft): Promise<Floorplan>;
}

export interface RoiRepository {
  get(eventId: string): Promise<EventRoi | null>;
  save(eventId: string, roi: Omit<EventRoi, "eventId" | "updatedAt">): Promise<EventRoi>;
}

/**
 * Aggregate reads live behind the adapter on purpose.
 *
 * The old dashboard issued one Firestore query per event to sum budget lines — fifty
 * events meant fifty round trips before the page could paint. Asking the adapter for
 * the answer instead lets each backend fetch it the efficient way: the memory adapter
 * computes it locally, and the Firestore adapter uses one collection-group query per
 * subcollection regardless of how many events there are.
 */
export interface AnalyticsRepository {
  portfolio(): Promise<PortfolioSummary>;
  /** Health for the given events, or every event when omitted. */
  health(eventIds?: string[]): Promise<EventHealth[]>;
  /** Ranked "what needs me today" worklist across the whole portfolio. */
  attention(): Promise<AttentionItem[]>;
}

export interface DataAdapter {
  readonly kind: "memory" | "firestore";
  events: EventsRepository;
  locations: OwnedRepository<Location, LocationDraft, LocationPatch>;
  attendees: OwnedRepository<Attendee, AttendeeDraft, AttendeePatch>;
  registrations: RegistrationsRepository;
  vendors: OwnedRepository<Vendor, VendorDraft, VendorPatch>;
  vendorMessages: VendorMessagesRepository;
  eventVendors: EventScopedRepository<EventVendor, EventVendorDraft, EventVendorPatch>;
  checklist: EventScopedRepository<ChecklistItem, ChecklistItemDraft, ChecklistItemPatch>;
  runOfShow: EventScopedRepository<RunOfShowItem, RunOfShowItemDraft, RunOfShowItemPatch>;
  budget: EventScopedRepository<BudgetItem, BudgetItemDraft, BudgetItemPatch>;
  menu: EventScopedRepository<MenuItem, MenuItemDraft, MenuItemPatch>;
  inspirations: EventScopedRepository<EventInspiration, { url: string; caption?: string | null }, { caption?: string | null; sortOrder?: number }>;
  tickets: TicketsRepository;
  auction: EventScopedRepository<AuctionItem, AuctionItemDraft, AuctionItemPatch>;
  raffle: RaffleRepository;
  sponsorships: EventScopedRepository<Sponsorship, SponsorshipDraft, SponsorshipPatch>;
  templates: TemplatesRepository;
  settings: SettingsRepository;
  floorplan: FloorplanRepository;
  roi: RoiRepository;
  analytics: AnalyticsRepository;
}

/** Thrown by adapters so the UI can render a specific, non-generic message. */
export class DataError extends Error {
  constructor(
    readonly code: "not-found" | "unauthenticated" | "permission-denied" | "conflict" | "unavailable" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }

  /** Retrying these is pointless — react-query uses this to skip backoff. */
  get isRetryable(): boolean {
    return this.code === "unavailable";
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
