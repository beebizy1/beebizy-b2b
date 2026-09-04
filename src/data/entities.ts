/**
 * The domain model the UI works against.
 *
 * Field names deliberately match the existing Firestore documents so live data keeps
 * working — with two corrections applied at the adapter boundary:
 *
 *   1. Money is `*Cents: number` here, never a string (see `./money`).
 *   2. Dates are ISO-8601 strings here, never Firestore `Timestamp` objects.
 *
 * Anything the UI needs that Firestore doesn't store (event health, attention items)
 * is *derived*, lives at the bottom of this file, and is computed in `./derive`.
 */

import type { Cents } from "./money.ts";

/* ------------------------------------------------------------------ primitives */

/** ISO-8601 instant, e.g. `2026-09-14T18:00:00.000Z`. */
export type IsoDateTime = string;

export interface OwnedRecord {
  id: string;
  ownerId: string;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

/* ---------------------------------------------------------------------- events */

export const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_CATEGORIES = [
  "Summit",
  "Offsite",
  "Product Launch",
  "Conference",
  "Awards",
  "Town Hall",
  "Gala",
  "Training",
  "Roadshow",
  "Other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number] | string;

export interface Event extends OwnedRecord {
  title: string;
  description: string | null;
  /** Event start. */
  date: IsoDateTime;
  endDate: IsoDateTime | null;
  /** Free-text venue, kept for events with no `Location` record. */
  location: string | null;
  locationId: string | null;
  /** Denormalized location snapshot written by the events adapter. */
  locationRecord: Location | null;
  capacity: number | null;
  status: EventStatus;
  category: EventCategory;
  imageUrl: string | null;
  /** Denormalized count maintained by registration writes. */
  registrationCount: number;
  /** Present once the organizer has opened the public event page. */
  shareToken: string | null;
}

export interface EventDraft {
  title: string;
  description?: string | null;
  date: IsoDateTime;
  endDate?: IsoDateTime | null;
  location?: string | null;
  locationId?: string | null;
  capacity?: number | null;
  status: EventStatus;
  category: EventCategory;
  imageUrl?: string | null;
}

export type EventPatch = Partial<EventDraft>;

export interface EventFilter {
  status?: EventStatus;
  category?: string;
  locationId?: string;
  /** Matches title, category, or location name, case-insensitively. */
  search?: string;
}

/* ------------------------------------------------------------------- locations */

export interface Location extends OwnedRecord {
  name: string;
  corporationName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  phone: string | null;
  /** Denormalized count of events at this location. */
  eventCount: number;
}

export interface LocationDraft {
  name: string;
  corporationName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  phone?: string | null;
}

export type LocationPatch = Partial<LocationDraft>;

/* --------------------------------------------------------------------- people */

export interface Guest extends OwnedRecord {
  name: string;
  contact: string;
  notes: string | null;
}

export interface GuestDraft {
  name: string;
  contact: string;
  notes?: string | null;
}

export type GuestPatch = Partial<GuestDraft>;

export const REGISTRATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/**
 * Starting points for categorising a guest list, not a fixed set.
 *
 * A segment is stored as free text because the useful categories are the customer's, not
 * ours: one runs "Bride's side" and "Groom's side", another runs "Table 1".."Table 12".
 * These are what the picker offers before anyone has invented their own, and the picker
 * also offers whatever is already in use on the event — so a custom label typed once
 * becomes a one-click choice for everyone after.
 */
export const REGISTRATION_SEGMENTS = [
  "VIP",
  "Sponsor",
  "Speaker",
  "Staff",
  "Press",
  "Family",
  "General",
] as const;

export interface Registration extends OwnedRecord {
  eventId: string;
  /** Denormalized so the registrations list renders without joining events. */
  eventTitle: string;
  guestId: string;
  status: RegistrationStatus;
  /**
   * Which part of the guest list this person belongs to, scoped to this event. It lives
   * on the registration rather than the guest because the same person is a sponsor at the
   * gala and a staff member at the training — one label per person would force a lie.
   */
  segment: string | null;
  registeredAt: IsoDateTime;
}

export interface RegistrationWithGuest extends Registration {
  guest: Guest | null;
}

export interface RegistrationDraft {
  eventId: string;
  guestId: string;
  status?: RegistrationStatus;
  segment?: string | null;
}

/* -------------------------------------------------------------------- vendors */

export const VENDOR_CATEGORIES = [
  "Venue",
  "Catering",
  "AV & Tech",
  "Photography",
  "Decor",
  "Entertainment",
  "Transport",
  "Staffing",
  "Print",
  "Other",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number] | string;

export interface Vendor extends OwnedRecord {
  name: string;
  category: VendorCategory;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  logoUrl: string | null;
  /** 0–5, or null when unrated. */
  rating: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Denormalized conversation summary, maintained by message writes. */
  lastMessage: string | null;
  lastMessageAt: IsoDateTime | null;
  lastDirection: MessageDirection | null;
  unreadCount: number;
}

export interface VendorDraft {
  name: string;
  category: VendorCategory;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  rating?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export type VendorPatch = Partial<VendorDraft>;

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** A vendor attached to a specific event. */
export interface EventVendor {
  id: string;
  eventId: string;
  vendorId: string;
  notes: string | null;
  status: BookingStatus;
  feeCents: Cents | null;
  vendor: Vendor | null;
  createdAt: IsoDateTime;
}

export interface EventVendorDraft {
  vendorId: string;
  notes?: string | null;
  status?: BookingStatus;
  feeCents?: Cents | null;
}

export type EventVendorPatch = Partial<Omit<EventVendorDraft, "vendorId">>;

export type MessageDirection = "inbound" | "outbound";

export interface VendorMessage {
  id: string;
  vendorId: string;
  eventId: string | null;
  direction: MessageDirection;
  senderName: string;
  subject: string | null;
  content: string;
  isRead: boolean;
  createdAt: IsoDateTime;
}

export interface VendorMessageDraft {
  content: string;
  senderName: string;
  subject?: string | null;
  eventId?: string | null;
}

/* ----------------------------------------------------------- event workspace */

export interface ChecklistItem {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: IsoDateTime | null;
  assignedTo: string | null;
  category: string;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface ChecklistItemDraft {
  title: string;
  description?: string | null;
  completed?: boolean;
  dueDate?: IsoDateTime | null;
  assignedTo?: string | null;
  category?: string;
  sortOrder?: number;
}

export type ChecklistItemPatch = Partial<ChecklistItemDraft>;

export interface RunOfShowItem {
  id: string;
  eventId: string;
  /** `HH:mm` local to the event. */
  startTime: string;
  /** Minutes. */
  duration: number | null;
  title: string;
  description: string | null;
  responsible: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface RunOfShowItemDraft {
  startTime: string;
  duration?: number | null;
  title: string;
  description?: string | null;
  responsible?: string | null;
  sortOrder?: number;
}

export type RunOfShowItemPatch = Partial<RunOfShowItemDraft>;

export type BudgetLineType = "expense" | "revenue";

export interface BudgetItem {
  id: string;
  eventId: string;
  name: string;
  category: string;
  type: BudgetLineType;
  estimatedCents: Cents;
  actualCents: Cents | null;
  notes: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface BudgetItemDraft {
  name: string;
  category?: string;
  type: BudgetLineType;
  estimatedCents: Cents;
  actualCents?: Cents | null;
  notes?: string | null;
  sortOrder?: number;
}

export type BudgetItemPatch = Partial<BudgetItemDraft>;

export interface MenuItem {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  course: string;
  dietaryTags: string[];
  priceCents: Cents | null;
  serves: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface MenuItemDraft {
  name: string;
  description?: string | null;
  course?: string;
  dietaryTags?: string[];
  priceCents?: Cents | null;
  serves?: number | null;
  notes?: string | null;
  sortOrder?: number;
}

export type MenuItemPatch = Partial<MenuItemDraft>;

export interface MoodBoardImage {
  id: string;
  eventId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

/* -------------------------------------------------------------------- boards */

/**
 * A board is a freeform space for working something out before it is an event —
 * concepting a gala's look, collecting references for a launch, agreeing a palette.
 *
 * Deliberately not the same thing as an event's mood board: that is a scoped strip of
 * reference images attached to one event. A board is owner-scoped, holds mixed card
 * kinds, and can exist before any event does — then be linked to one when it becomes
 * real. The old build had both and never said which was which.
 */
export const CANVAS_CARD_KINDS = ["note", "image", "swatch", "link"] as const;
export type CanvasCardKind = (typeof CANVAS_CARD_KINDS)[number];

export interface CanvasCard {
  id: string;
  kind: CanvasCardKind;
  /** Note text, image URL, link URL, or a hex value for a swatch. */
  content: string;
  caption: string | null;
  /** 0–100, percent of the board. */
  x: number;
  y: number;
  /** Percent of the board width. */
  width: number;
  /** Note tint or swatch colour; null uses the default. */
  color: string | null;
}

export interface Canvas extends OwnedRecord {
  name: string;
  description: string | null;
  /** Optional: a board can be attached to the event it ends up serving. */
  eventId: string | null;
  cards: CanvasCard[];
}

export interface CanvasDraft {
  name: string;
  description?: string | null;
  eventId?: string | null;
}

export type CanvasPatch = Partial<CanvasDraft>;

/* ----------------------------------------------------------------- floorplan */

/**
 * Floorplan objects are typed, unlike the legacy `layout: { [key: string]: unknown }`
 * blob, which meant nothing could read a plan back — not a seat count, not a validation.
 * Positions are percentages of the room box so a plan drawn on a laptop still reads on
 * a phone.
 */
export const FLOORPLAN_SHAPES = [
  "round-table",
  "long-table",
  "stage",
  "bar",
  "entrance",
  "dancefloor",
  "booth",
  "av",
] as const;
export type FloorplanShape = (typeof FLOORPLAN_SHAPES)[number];

export interface FloorplanItem {
  id: string;
  shape: FloorplanShape;
  label: string;
  /** 0–100, percent of the room width. */
  x: number;
  /** 0–100, percent of the room height. */
  y: number;
  /** Null for objects nobody sits at. */
  seats: number | null;
}

/**
 * One room. An event has as many as it needs — indoor and outdoor, upstairs and
 * downstairs — which is why this is keyed by its own id rather than by the event: a
 * single plan per event could not describe a party that spills onto a terrace.
 */
export interface Floorplan {
  id: string;
  eventId: string;
  name: string;
  items: FloorplanItem[];
  updatedAt: IsoDateTime;
}

export interface FloorplanDraft {
  name: string;
  items: FloorplanItem[];
}

/* ------------------------------------------------------------ event history */

export const HISTORY_RESOURCES = [
  "event",
  "vendor-booking",
  "checklist",
  "run-of-show",
  "budget",
  "menu",
  "mood-board",
  "ticket-type",
  "auction",
  "sponsorship",
  "raffle",
  "floorplan",
] as const;
export type HistoryResource = (typeof HISTORY_RESOURCES)[number];
export type HistoryAction = "created" | "updated" | "deleted";

/**
 * An immutable, structured record of one planning decision. `before` and `after` are
 * snapshots rather than display strings so estimates, timings and layouts remain useful
 * to reporting and future recommendation models.
 */
export interface EventHistoryEntry {
  id: string;
  eventId: string;
  actorId: string;
  resource: HistoryResource;
  resourceId: string | null;
  action: HistoryAction;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}

export type EventHistoryChange = Pick<
  EventHistoryEntry,
  "eventId" | "resource" | "resourceId" | "action" | "before" | "after"
>;

/* -------------------------------------------------------------------- revenue */

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: Cents;
  /** 0 means unlimited. */
  quantityTotal: number;
  quantitySold: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface TicketTypeDraft {
  name: string;
  description?: string | null;
  priceCents: Cents;
  quantityTotal: number;
  isActive?: boolean;
  sortOrder?: number;
}

export type TicketTypePatch = Partial<TicketTypeDraft>;

export interface TicketTypeWithEvent extends TicketType {
  eventTitle: string;
  eventDate: IsoDateTime;
  eventStatus: EventStatus;
  eventCategory: string;
}

export type AuctionKind = "silent" | "live";
export const AUCTION_ITEM_STATUSES = ["open", "closed", "won"] as const;
export type AuctionItemStatus = (typeof AUCTION_ITEM_STATUSES)[number];

export interface AuctionItem {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startingBidCents: Cents | null;
  currentBidCents: Cents | null;
  fairMarketValueCents: Cents | null;
  winnerName: string | null;
  donorName: string | null;
  paymentMethod: string | null;
  paymentLink: string | null;
  paymentReceivedAt: IsoDateTime | null;
  status: AuctionItemStatus;
  auctionType: AuctionKind;
  lotNumber: number | null;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface AuctionItemDraft {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startingBidCents?: Cents | null;
  currentBidCents?: Cents | null;
  fairMarketValueCents?: Cents | null;
  winnerName?: string | null;
  donorName?: string | null;
  paymentMethod?: string | null;
  paymentLink?: string | null;
  paymentReceivedAt?: IsoDateTime | null;
  status?: AuctionItemStatus;
  auctionType?: AuctionKind;
  lotNumber?: number | null;
}

export type AuctionItemPatch = Partial<AuctionItemDraft>;

export const RAFFLE_STATUSES = ["open", "closed", "drawn"] as const;
export type RaffleStatus = (typeof RAFFLE_STATUSES)[number];

export interface RaffleItem {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ticketPriceCents: Cents;
  totalTickets: number;
  soldTickets: number;
  winnerName: string | null;
  winnerEmail: string | null;
  winnerTicketId: string | null;
  drawnAt: IsoDateTime | null;
  status: RaffleStatus;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface RaffleItemDraft {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  ticketPriceCents?: Cents;
  totalTickets?: number;
  status?: RaffleStatus;
}

export type RaffleItemPatch = Partial<RaffleItemDraft>;

export interface RaffleTicket {
  id: string;
  raffleItemId: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  createdAt: IsoDateTime;
}

export const SPONSORSHIP_TIERS = ["gold", "silver", "bronze", "custom"] as const;
export type SponsorshipTier = (typeof SPONSORSHIP_TIERS)[number];

export interface Sponsorship {
  id: string;
  eventId: string;
  companyName: string;
  tier: SponsorshipTier;
  amountCents: Cents | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactName: string | null;
  notes: string | null;
  status: BookingStatus;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface SponsorshipDraft {
  companyName: string;
  tier?: SponsorshipTier;
  amountCents?: Cents | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  notes?: string | null;
  status?: BookingStatus;
}

export type SponsorshipPatch = Partial<SponsorshipDraft>;

/* ----------------------------------------------------------------------- rfps */

export const RFP_STATUSES = ["draft", "sent", "closed"] as const;
export type RfpStatus = (typeof RFP_STATUSES)[number];

export const RFP_RESPONSE_STATUSES = ["pending", "received", "accepted", "declined"] as const;
export type RfpResponseStatus = (typeof RFP_RESPONSE_STATUSES)[number];

/**
 * A request for proposal put out to one vendor category.
 *
 * Budget is a range rather than a single figure, because an RFP asks the market what
 * something costs rather than telling it. Both bounds are cents like every other money
 * field in the product, so `formatMoney` works without a special case.
 */
export interface Rfp {
  id: string;
  eventId: string;
  title: string;
  vendorCategory: string;
  description: string | null;
  budgetMinCents: Cents | null;
  budgetMaxCents: Cents | null;
  headcount: number | null;
  /** Responses are due by this date. */
  deadline: IsoDateTime | null;
  requirements: string | null;
  status: RfpStatus;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface RfpDraft {
  title: string;
  vendorCategory: string;
  description?: string | null;
  budgetMinCents?: Cents | null;
  budgetMaxCents?: Cents | null;
  headcount?: number | null;
  deadline?: IsoDateTime | null;
  requirements?: string | null;
  status?: RfpStatus;
}

export type RfpPatch = Partial<RfpDraft>;

/** One vendor's reply to an RFP. */
export interface RfpResponse {
  id: string;
  rfpId: string;
  vendorName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  quotedAmountCents: Cents | null;
  notes: string | null;
  status: RfpResponseStatus;
  createdAt: IsoDateTime;
}

export interface RfpResponseDraft {
  vendorName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  quotedAmountCents?: Cents | null;
  notes?: string | null;
  status?: RfpResponseStatus;
}

/** An RFP with its replies, which is the only shape the RFP tab ever renders. */
export interface RfpWithResponses extends Rfp {
  responses: RfpResponse[];
}

/* ------------------------------------------------------------------- deposits */

export const DEPOSIT_STATUSES = ["pending", "paid", "overdue", "refunded"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/**
 * Money committed to a vendor ahead of the event.
 *
 * `status` is stored rather than derived, because "overdue" is a decision someone made
 * about an unpaid deposit, not simply a date in the past — a deposit can be past its due
 * date and still agreed as fine.
 */
export interface Deposit {
  id: string;
  eventId: string;
  vendorName: string;
  amountCents: Cents;
  dueDate: IsoDateTime | null;
  paidDate: IsoDateTime | null;
  paidBy: string | null;
  paymentMethod: string | null;
  status: DepositStatus;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface DepositDraft {
  vendorName: string;
  amountCents: Cents;
  dueDate?: IsoDateTime | null;
  paidDate?: IsoDateTime | null;
  paidBy?: string | null;
  paymentMethod?: string | null;
  status?: DepositStatus;
  notes?: string | null;
}

export type DepositPatch = Partial<DepositDraft>;

/* ----------------------------------------------------------------- team hours */

/** Staff time booked against an event, the labour half of what an event really cost. */
export interface TeamHoursEntry {
  id: string;
  eventId: string;
  staffMember: string;
  role: string;
  hours: number;
  createdAt: IsoDateTime;
}

export interface TeamHoursDraft {
  staffMember: string;
  role: string;
  hours: number;
}

export type TeamHoursPatch = Partial<TeamHoursDraft>;

/* ------------------------------------------------------------------ templates */

export interface Template extends OwnedRecord {
  name: string;
  description: string | null;
  category: string;
  defaultCapacity: number | null;
  checklistCount: number;
  runOfShowCount: number;
  budgetCount: number;
}

export interface TemplateDraft {
  name: string;
  description?: string | null;
  category: string;
  defaultCapacity?: number | null;
}

export interface TemplateContents {
  checklistItems: Omit<ChecklistItem, "eventId">[];
  runOfShowItems: Omit<RunOfShowItem, "eventId">[];
  budgetItems: Omit<BudgetItem, "eventId">[];
}

export type TemplateDetail = Template & TemplateContents;

/* -------------------------------------------------------------- user settings */

/**
 * Per-user preferences. Persisted server-side in `userSettings/{uid}` — never in
 * localStorage, so a preference set on a laptop follows the user to their phone.
 */
/**
 * Everything a guest on a share link is allowed to see, and nothing else.
 *
 * It is one object because a guest has no session: the page cannot fetch the agenda or
 * the ticket types through the authenticated repositories, so the single public read has
 * to carry them. `timeZone` is the workspace's, not the reader's — an event page that
 * showed a guest in Berlin "6:00 PM" for a 6pm-Portland gala would be lying to them.
 */
export interface PublicEventPayload {
  event: Event;
  agenda: RunOfShowItem[];
  tickets: TicketType[];
  timeZone: string;
}

export interface UserSettings {
  /** Dimension the home page groups events by. */
  homeGrouping: "location" | "category" | "status";
  currency: string;
  timeZone: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  homeGrouping: "location",
  currency: "USD",
  timeZone: "America/Los_Angeles",
};

/* ----------------------------------------------------------------- derived */

/**
 * Why an event needs attention. Computed from the event's own workspace records —
 * see `./derive`. This is the thing the old dashboard never told anyone.
 */
export type RiskLevel = "clear" | "watch" | "urgent";

export interface EventRisk {
  level: RiskLevel;
  /** Short, specific, and actionable: "Catering unconfirmed, 6 days out". */
  message: string;
  /** Where to go to fix it, relative to the event workspace. */
  section: EventSectionId;
}

export interface EventHealth {
  eventId: string;
  daysUntil: number | null;
  /** 0–100 readiness: checklist completion weighted by how close the event is. */
  readiness: number;
  checklistDone: number;
  checklistTotal: number;
  vendorsConfirmed: number;
  vendorsTotal: number;
  capacityFilled: number | null;
  budgetPlannedCents: Cents;
  budgetSpentCents: Cents;
  ticketRevenueCents: Cents;
  fundraisingCents: Cents;
  risks: EventRisk[];
}

export type EventSectionId = "overview" | "plan" | "guests" | "vendors" | "budget" | "share";

/** A single row in the home page's "needs you today" list. */
export interface AttentionItem {
  id: string;
  eventId: string;
  eventTitle: string;
  level: RiskLevel;
  message: string;
  section: EventSectionId;
  /** Sort key — lower is more urgent. */
  weight: number;
}

/** A checklist item carrying enough of its event to be shown outside that event. */
export interface OpenTask extends ChecklistItem {
  eventTitle: string;
  eventDate: IsoDateTime;
  eventStatus: EventStatus;
  /** Whole days until the event; negative once it has passed. */
  daysUntilEvent: number | null;
  overdue: boolean;
}

export interface PortfolioSummary {
  eventsTotal: number;
  eventsUpcoming: number;
  eventsThisWeek: number;
  guestsTotal: number;
  registrationsConfirmed: number;
  registrationsPending: number;
  locationsTotal: number;
  vendorsTotal: number;
  budgetPlannedCents: Cents;
  budgetSpentCents: Cents;
  revenueCents: Cents;
}

export interface EventRoi {
  eventId: string;
  eventCostCents: Cents;
  unitsSold: number;
  avgItemPriceCents: Cents;
  notes: string;
  updatedAt: IsoDateTime;
}
