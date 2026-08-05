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

import type { Cents } from "./money";

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

export interface Attendee extends OwnedRecord {
  name: string;
  contact: string;
  notes: string | null;
}

export interface AttendeeDraft {
  name: string;
  contact: string;
  notes?: string | null;
}

export type AttendeePatch = Partial<AttendeeDraft>;

export const REGISTRATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface Registration extends OwnedRecord {
  eventId: string;
  /** Denormalized so the registrations list renders without joining events. */
  eventTitle: string;
  attendeeId: string;
  status: RegistrationStatus;
  registeredAt: IsoDateTime;
}

export interface RegistrationWithAttendee extends Registration {
  attendee: Attendee | null;
}

export interface RegistrationDraft {
  eventId: string;
  attendeeId: string;
  status?: RegistrationStatus;
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

export interface EventInspiration {
  id: string;
  eventId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

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

export interface Floorplan {
  eventId: string;
  name: string;
  items: FloorplanItem[];
  updatedAt: IsoDateTime;
}

export interface FloorplanDraft {
  name: string;
  items: FloorplanItem[];
}

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

export type ThemePreference = "light" | "dark" | "system";

/**
 * Per-user preferences. Persisted server-side in `userSettings/{uid}` — never in
 * localStorage, so a preference set on a laptop follows the user to their phone.
 */
export interface UserSettings {
  theme: ThemePreference;
  /** Dimension the home page groups events by. */
  homeGrouping: "location" | "category" | "status";
  currency: string;
  timeZone: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "system",
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

export type EventSectionId = "overview" | "plan" | "people" | "suppliers" | "money" | "share";

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

export interface PortfolioSummary {
  eventsTotal: number;
  eventsUpcoming: number;
  eventsThisWeek: number;
  attendeesTotal: number;
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
