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
import type { RegistrationPageSettings } from "./registrationPage.ts";
import type { AccountExperience } from "./accountExperience.ts";

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
  "Conference",
  "Workshop",
  "Training",
  "Town Hall",
  "Offsite",
  "Product Launch",
  "Awards",
  "Gala",
  "Fundraiser",
  "Nonprofit Event",
  "Community Event",
  "School Event",
  "Festival",
  "Networking Event",
  "Reception",
  "Dinner",
  "Celebration",
  "Wedding",
  "Roadshow",
  "Expo / Trade Show",
  "Holiday Party",
  "Other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number] | string;

export interface Event extends OwnedRecord {
  /** Which customer presentation owns this event. Older rows default to standard. */
  experience?: AccountExperience;
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
  /** Branding and content for the guest-facing registration site. */
  registrationPage: RegistrationPageSettings;
  /** Present after the organizer creates the public auction catalog link. */
  auctionPublicToken?: string | null;
  auctionPage?: AuctionPageSettings;
}

export interface EventDraft {
  experience?: AccountExperience;
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
  registrationPage?: RegistrationPageSettings;
  auctionPage?: AuctionPageSettings;
}

export type EventPatch = Partial<EventDraft>;

export interface EventFilter {
  experience?: AccountExperience;
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
  /** Email when known. Imported door lists may legitimately contain only a name. */
  contact: string | null;
  notes: string | null;
}

export interface GuestDraft {
  name: string;
  contact: string | null;
  notes?: string | null;
}

export type GuestPatch = Partial<GuestDraft>;

export const REGISTRATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** One original spreadsheet cell, kept with its source header for audit and display. */
export interface ImportedSpreadsheetField {
  label: string;
  value: string;
}

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
  "Investor",
  "Student",
  "Company",
  "General",
  "VIP",
  "Sponsor",
  "Speaker",
  "Staff",
  "Press",
  "Family",
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
  /**
   * Where this person is from — the fund, firm, school or company they represent.
   *
   * Separate from the segment because a university reporting on its demo day needs both
   * halves: how many investors attended, *and* which funds they came from. One field
   * collapsing "Investor · Sequoia" would make neither countable.
   */
  organization: string | null;
  /** Number of attendees represented by this row, such as a guest plus their party. */
  quantity: number;
  registeredAt: IsoDateTime;
  /** Null until the guest arrives. Clearing it is the reversible "undo check-in" action. */
  checkedInAt: IsoDateTime | null;
  /** Which entrance or desk handled the guest, for multi-station events. */
  checkInStation: string | null;
  /** Arrival-specific detail such as accessibility help, badge issues or a plus-one. */
  checkInNotes: string | null;
  /** Exact source columns from a spreadsheet import, in their original order. */
  importedFields?: ImportedSpreadsheetField[];
}

export interface RegistrationWithGuest extends Registration {
  guest: Guest | null;
  /** Private bidder identity used only by authenticated check-in staff for connected badge QR codes. */
  bidderAccess?: { paddleNumber: number; publicToken: string } | null;
}

export interface RegistrationDraft {
  eventId: string;
  guestId: string;
  status?: RegistrationStatus;
  segment?: string | null;
  organization?: string | null;
  quantity?: number;
  /** Used by bulk imports; ordinary registrations leave this empty. */
  importedFields?: ImportedSpreadsheetField[];
}

/** Every editable value in one guest-list row, including its original spreadsheet cells. */
export interface RegistrationDetailsPatch {
  name: string;
  contact: string | null;
  notes: string | null;
  status: RegistrationStatus;
  segment: string | null;
  organization: string | null;
  quantity: number;
  importedFields: ImportedSpreadsheetField[];
}

/** One spreadsheet row imported atomically as both a guest and an event registration. */
export interface GuestRegistrationImportDraft extends GuestDraft {
  eventId: string;
  status?: RegistrationStatus;
  segment?: string | null;
  organization?: string | null;
  quantity?: number;
  importedFields?: ImportedSpreadsheetField[];
}

/** Details a guest submits from one of the event's segment-specific registration links. */
export interface PublicRegistrationDraft {
  name: string;
  email: string;
  segment: string;
  organization?: string | null;
}

/** Registration plus the result of the guest confirmation email attempt. */
export interface PublicRegistrationResult extends Registration {
  confirmationEmailStatus: "sent" | "skipped" | "failed";
}

export interface RegistrationCheckInPatch {
  checkedInAt: IsoDateTime | null;
  checkInStation?: string | null;
  checkInNotes?: string | null;
}

/** One atomic front-desk action: create a new person, register them, and record arrival. */
export interface WalkInRegistrationDraft {
  name: string;
  contact: string;
  segment?: string | null;
  organization?: string | null;
  checkInStation?: string | null;
  checkInNotes?: string | null;
}

/** A persistent operating position at an event entrance. */
export interface CheckInStation {
  id: string;
  eventId: string;
  name: string;
  /** Which guests this station should handle, such as A-M, VIPs or walk-ins. */
  lane: string;
  /** Linked roster entry for this entrance lead. */
  leadVolunteerId: string | null;
  lead: string | null;
  deviceCount: number;
  notes: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface CheckInStationDraft {
  name: string;
  lane: string;
  leadVolunteerId?: string | null;
  lead?: string | null;
  deviceCount?: number;
  notes?: string | null;
  sortOrder?: number;
}

export type CheckInStationPatch = Partial<CheckInStationDraft>;

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
  deliveredAt?: IsoDateTime | null;
  deliveryError?: string | null;
  createdAt: IsoDateTime;
}

export interface VendorMessageDraft {
  content: string;
  senderName: string;
  subject?: string | null;
  eventId?: string | null;
}

export interface PublicVendorConversation {
  vendorName: string;
  messages: Pick<VendorMessage, "id" | "direction" | "senderName" | "subject" | "content" | "createdAt">[];
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
  /**
   * Where to reach the assignee.
   *
   * Separate from `assignedTo`, which is a name and always has been. A name cannot be
   * notified, so assigning from the team list records the address alongside it; typing a
   * name that belongs to nobody in the workspace leaves this null and sends nothing.
   */
  assignedEmail: string | null;
  /** Optional direct connection to the vendor responsible for this task. */
  vendorId?: string | null;
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
  assignedEmail?: string | null;
  vendorId?: string | null;
  category?: string;
  sortOrder?: number;
}

export type ChecklistItemPatch = Partial<ChecklistItemDraft>;

export interface RunOfShowItem {
  id: string;
  eventId: string;
  /** One-based day within the event. Existing schedules default to Day 1. */
  dayNumber: number;
  /** `HH:mm` local to the event. */
  startTime: string;
  /** Minutes. */
  duration: number | null;
  title: string;
  description: string | null;
  responsible: string | null;
  /** Where to send the cue assignment and private completion link. */
  assignedEmail: string | null;
  completed: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface RunOfShowItemDraft {
  dayNumber?: number;
  startTime: string;
  duration?: number | null;
  title: string;
  description?: string | null;
  responsible?: string | null;
  assignedEmail?: string | null;
  completed?: boolean;
  sortOrder?: number;
}

export type RunOfShowItemPatch = Partial<RunOfShowItemDraft>;

/** Run-of-show fields that are safe to publish on an unauthenticated event page. */
export type PublicRunOfShowItem = Omit<RunOfShowItem, "assignedEmail" | "completed">;

export const VOLUNTEER_STATUSES = ["scheduled", "confirmed", "checked_in", "completed", "cancelled"] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

/** One person's event-day commitment, including the exact shift and operating notes. */
export interface VolunteerShift {
  id: string;
  eventId: string;
  /** Staffing requirement this assignment fills. Null for an ad-hoc shift. */
  needId: string | null;
  /** One-based day within a multi-day event. */
  dayNumber: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** `HH:mm` local to the event. */
  startTime: string;
  /** `HH:mm` local to the event. */
  endTime: string;
  status: VolunteerStatus;
  notes: string | null;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface VolunteerShiftDraft {
  needId?: string | null;
  dayNumber?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  startTime: string;
  endTime: string;
  status?: VolunteerStatus;
  notes?: string | null;
  sortOrder?: number;
}

export type VolunteerShiftPatch = Partial<VolunteerShiftDraft>;

/** A role and time window the organizer needs volunteers to fill. */
export interface VolunteerNeed {
  id: string;
  eventId: string;
  /** One-based day within a multi-day event. */
  dayNumber: number;
  role: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  notes: string | null;
  signupOpen: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
}

export interface VolunteerNeedDraft {
  dayNumber?: number;
  role: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  notes?: string | null;
  signupOpen?: boolean;
  sortOrder?: number;
}

export type VolunteerNeedPatch = Partial<VolunteerNeedDraft>;

/** Public-safe staffing information. Volunteer names and contact details never appear here. */
export interface VolunteerNeedWithCoverage extends VolunteerNeed {
  filledCount: number;
  openCount: number;
  isFull: boolean;
}

export interface PublicVolunteerSignupDraft {
  needId: string;
  name: string;
  email: string;
  phone?: string | null;
}

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
  "tree",
  "chair",
  "chair-row",
  "custom-shape",
  "image",
  "text",
] as const;
export type FloorplanShape = (typeof FLOORPLAN_SHAPES)[number];

export const FLOORPLAN_CUSTOM_SHAPE_MODES = ["polygon", "curved", "freehand"] as const;
export type FloorplanCustomShapeMode = (typeof FLOORPLAN_CUSTOM_SHAPE_MODES)[number];

export const FLOORPLAN_ROOM_SHAPES = ["rectangle", "oval", "l-shape", "custom"] as const;
export type FloorplanRoomShape = (typeof FLOORPLAN_ROOM_SHAPES)[number];

export interface FloorplanPoint {
  /** 0-100, percent of the floorplan canvas width. */
  x: number;
  /** 0-100, percent of the floorplan canvas height. */
  y: number;
}

export interface FloorplanRoom {
  shape: FloorplanRoomShape;
  /** Physical room width in feet. */
  widthFeet: number;
  /** Physical room length in feet. */
  lengthFeet: number;
  /** Normalized outline vertices. Used by polygon rooms and editable in custom mode. */
  points: FloorplanPoint[];
}

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
  /** Fixed site features stay in place until a planner explicitly unlocks them. */
  locked?: boolean;
  /** Optional object dimensions as percentages of the room canvas. */
  width?: number;
  height?: number;
  /** Clockwise rotation around the object's center, in degrees. */
  rotation?: number;
  /** Normalized vertices for a custom object. Other object types ignore this. */
  points?: FloorplanPoint[];
  /** Straight anchors, smoothed anchors, or a freehand outline. */
  customShapeMode?: FloorplanCustomShapeMode;
  /** Uploaded image rendered inside an image object. */
  imageUrl?: string;
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
  /** Optional for records created before room outlines were introduced. */
  room?: FloorplanRoom;
  updatedAt: IsoDateTime;
}

export interface FloorplanDraft {
  name: string;
  items: FloorplanItem[];
  /** Optional so older clients and stored plans remain valid. */
  room?: FloorplanRoom;
}

/* ------------------------------------------------------------ event history */

export const HISTORY_RESOURCES = [
  "event",
  "registration",
  "vendor-booking",
  "checklist",
  "check-in-station",
  "run-of-show",
  "volunteer",
  "budget",
  "menu",
  "mood-board",
  "ticket-type",
  "auction",
  "sponsorship",
  "raffle",
  "floorplan",
  "team-update",
  "assignment-link",
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

export const TEAM_UPDATE_KINDS = ["schedule", "vendor-delay", "general"] as const;
export type TeamUpdateKind = (typeof TEAM_UPDATE_KINDS)[number];

export interface TeamUpdate {
  id: string;
  eventId: string;
  kind: TeamUpdateKind;
  message: string;
  actorId: string;
  createdAt: IsoDateTime;
  /** Present on a newly posted update. Historical reads do not replay delivery state. */
  emailDelivery?: { sent: number; notSent: number };
}

export interface TeamUpdateDraft {
  kind: TeamUpdateKind;
  message: string;
  /** Bulk history imports can store an update without replaying it as a new email alert. */
  notifyTeam?: boolean;
}

export interface PublicAssignmentPayload {
  kind: "checklist" | "run-of-show" | "volunteer";
  eventTitle: string;
  eventDate: IsoDateTime;
  eventEndDate: IsoDateTime | null;
  /** Venue/workspace zone used by calendar links and event-day times. */
  timeZone: string;
  location: string | null;
  assignee: string;
  title: string;
  description: string | null;
  dueDate: IsoDateTime | null;
  /** Civil due date for date-only calendar/UI rendering. */
  dueDateCivil: string | null;
  /** Current state of the assigned task, cue or shift. */
  completed: boolean;
  /** Authenticated deep link to the exact item in its event workspace section. */
  appPath: string;
  /** One-based event day for schedule cues and volunteer shifts. Null for checklist assignments. */
  dayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  /** Number of civil days between the timed assignment's start and end. */
  endDayOffset: number;
  /** Present only when this volunteer currently leads a private check-in station. */
  checkInPath?: string | null;
  checkInStation?: { name: string; lane: string } | null;
}

/** Minimal guest data exposed to one token-scoped check-in counter. */
export interface PublicCheckInGuest {
  registrationId: string;
  name: string;
  organization: string | null;
  segment: string | null;
  status: RegistrationStatus;
  checkedInAt: IsoDateTime | null;
  checkInStation: string | null;
  /** True only for on-site walk-ins that may be removed from the shared desk. */
  removable: boolean;
}

/** Everything a door volunteer needs, without exposing the surrounding workspace. */
export interface PublicCheckInStationPayload {
  eventTitle: string;
  eventDate: IsoDateTime;
  timeZone: string;
  location: string | null;
  volunteer: { name: string };
  station: { id: string; name: string; lane: string };
  guests: PublicCheckInGuest[];
}

/** Aggregate-only attendance data safe to show through an unguessable public link. */
export interface PublicAttendanceDashboardPayload {
  eventTitle: string;
  eventDate: IsoDateTime;
  timeZone: string;
  generatedAt: IsoDateTime;
  summary: {
    registrationRows: number;
    uniqueRegistered: number;
    checkedInRows: number;
    uniqueCheckedIn: number;
    duplicateCheckedInRows: number;
    noShows: number;
    attendanceRate: number;
  };
  guestTypes: Array<{ label: string; count: number }>;
  registrationSources: Array<{ label: string; count: number }>;
}

/** One floorplan shared through its own capability token, without the surrounding event. */
export interface PublicFloorplanPayload {
  eventTitle: string;
  eventDate: IsoDateTime;
  floorplan: Floorplan;
}

export type EventHistoryChange = Pick<
  EventHistoryEntry,
  "eventId" | "resource" | "resourceId" | "action" | "before" | "after"
>;

/** Result of emailing one consolidated open-work summary to each responsible person. */
export interface AssignmentSummaryResult {
  /** People who had at least one open assignment with a deliverable email address. */
  recipients: number;
  /** Checklist tasks, run-of-show cues and volunteer shifts included across all summaries. */
  assignments: number;
  /** Assigned records that named someone but had no email address to notify. */
  missingEmail: number;
  /** Provider deliveries that succeeded. */
  sent: number;
  /** Provider deliveries that were skipped or failed. */
  failed: number;
}

/* -------------------------------------------------------------------- revenue */

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: Cents;
  fairMarketValueCents?: Cents | null;
  fmvZeroConfirmed?: boolean;
  benefitsDescription?: string | null;
  /** 0 means unlimited. */
  quantityTotal: number;
  quantitySold: number;
  isActive: boolean;
  maxPerOrder?: number;
  collectGuestNames?: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface TicketTypeDraft {
  name: string;
  description?: string | null;
  priceCents: Cents;
  fairMarketValueCents?: Cents | null;
  fmvZeroConfirmed?: boolean;
  benefitsDescription?: string | null;
  quantityTotal: number;
  isActive?: boolean;
  maxPerOrder?: number;
  collectGuestNames?: boolean;
  sortOrder?: number;
}

export type TicketTypePatch = Partial<TicketTypeDraft>;

export interface TicketTypeWithEvent extends TicketType {
  eventTitle: string;
  eventDate: IsoDateTime;
  eventStatus: EventStatus;
  eventCategory: string;
}

export type PaymentStatus = "pending" | "paid" | "refunding" | "refunded" | "failed";

export interface TicketOrderGuest {
  id: string;
  orderId: string;
  fullName: string;
  email: string | null;
}

export interface TicketOrder {
  id: string;
  eventId: string;
  ticketTypeId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  gradeTags?: SchoolGrade[];
  quantity: number;
  amountCents: Cents;
  applicationFeeCents: Cents;
  donationAddOnCents?: Cents;
  benefitsDeclined?: boolean;
  autoChargeOptIn?: boolean;
  status: PaymentStatus;
  checkoutUrl?: string | null;
  guests: TicketOrderGuest[];
  paidAt: IsoDateTime | null;
  refundedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface TicketCheckoutResult {
  orderId: string;
  kind: "free-confirmed" | "stripe-checkout";
  checkoutUrl: string | null;
  applicationFeeCents: Cents;
}

export interface TicketInvitation {
  id: string;
  eventId: string;
  recipientName: string;
  recipientEmail: string;
  publicToken: string;
  status: "pending" | "sent" | "opened" | "registered" | "failed";
  sentAt: IsoDateTime | null;
  openedAt: IsoDateTime | null;
  registeredAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface TicketInvitationBatchResult {
  attempted: number;
  sent: number;
  failed: number;
  invitations: TicketInvitation[];
}

export interface PublicTicketOrderStatus {
  orderId: string;
  status: PaymentStatus;
  quantity: number;
  amountCents: Cents;
  buyerEmailMasked: string;
  registrationConfirmed: boolean;
  auctionAccessUrl?: string | null;
}

export interface StripeConnectStatus {
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  ready: boolean;
  onboardingUrl?: string | null;
}

export type AuctionKind = "silent" | "live";
export const AUCTION_ITEM_STATUSES = ["open", "closed", "won"] as const;
export type AuctionItemStatus = (typeof AUCTION_ITEM_STATUSES)[number];
export const AUCTION_DONOR_STATUSES = ["prospect", "contacted", "committed", "received", "declined"] as const;
export type AuctionDonorStatus = (typeof AUCTION_DONOR_STATUSES)[number];
export const AUCTION_THANK_YOU_STATUSES = ["pending", "sent", "waived"] as const;
export type AuctionThankYouStatus = (typeof AUCTION_THANK_YOU_STATUSES)[number];
export const AUCTION_READINESS_STATUSES = ["draft", "incomplete", "ready", "published"] as const;
export type AuctionReadinessStatus = (typeof AUCTION_READINESS_STATUSES)[number];
export const AUCTION_PARTICIPANT_TYPES = ["gala", "remote"] as const;
export type AuctionParticipantType = (typeof AUCTION_PARTICIPANT_TYPES)[number];
export const AUCTION_FULFILLMENT_STATUSES = ["pending", "ready", "picked-up", "delivered"] as const;
export type AuctionFulfillmentStatus = (typeof AUCTION_FULFILLMENT_STATUSES)[number];

export interface AuctionPageSettings {
  title: string;
  welcomeMessage: string;
  startsAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  registrationOpen: boolean;
  catalogPublished: boolean;
  allowRemoteBidders: boolean;
  automaticBiddingEnabled: boolean;
  secondChanceEnabled: boolean;
  staggeredClosingEnabled: boolean;
  autoExtendMinutes: number;
  automaticClosingAlertsEnabled: boolean;
  closingAlertMinutes: number[];
  broadcastCooldownMinutes: number;
  bidHistoryPrivacy: "paddle" | "initials";
}

export interface AuctionDonor extends OwnedRecord {
  eventId: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  donorKind?: "family" | "business";
  website?: string | null;
  logoUrl?: string | null;
  gradeTags?: string[];
  publicToken: string;
  solicitedBy: string | null;
  solicitationStatus: AuctionDonorStatus;
  previousDonations: string | null;
  notes: string | null;
  recognitionPreference: string | null;
  thankYouStatus: AuctionThankYouStatus;
}

export interface AuctionDonorDraft {
  businessName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  donorKind?: "family" | "business";
  website?: string | null;
  logoUrl?: string | null;
  gradeTags?: string[];
  solicitedBy?: string | null;
  solicitationStatus?: AuctionDonorStatus;
  previousDonations?: string | null;
  notes?: string | null;
  recognitionPreference?: string | null;
  thankYouStatus?: AuctionThankYouStatus;
}

export interface PublicAuctionDonorPayload {
  eventTitle: string;
  donor: {
    businessName: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    recognitionPreference: string | null;
  };
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    category: string | null;
    restrictions: string | null;
    expiresAt: IsoDateTime | null;
    fairMarketValueCents: Cents | null;
    deliveryDetails: string | null;
    readinessStatus: AuctionReadinessStatus;
  }>;
}

export interface AuctionItem {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  photoUrls?: string[];
  estimatedValueCents?: Cents | null;
  startingBidCents: Cents | null;
  currentBidCents: Cents | null;
  fairMarketValueCents: Cents | null;
  winnerName: string | null;
  donorName: string | null;
  donorId?: string | null;
  itemSubmissionId?: string | null;
  itemType?: "silent" | "live" | "buy_now" | "fixed_price" | "fund_a_need";
  category?: string | null;
  restrictions?: string | null;
  expiresAt?: IsoDateTime | null;
  deliveryDetails?: string | null;
  deliveryMethod?: string | null;
  creditText?: string | null;
  showFairMarketValue?: boolean;
  buyNowCents?: Cents | null;
  reserveCents?: Cents | null;
  incrementRule?: "tiered" | "fixed";
  closingWave?: string | null;
  notesToSchool?: string | null;
  isServiceOrUse?: boolean;
  overFiveThousandFlag?: boolean;
  bidIncrementCents?: Cents | null;
  readinessStatus?: AuctionReadinessStatus;
  isPublished?: boolean;
  opensAt?: IsoDateTime | null;
  closesAt?: IsoDateTime | null;
  extensionMinutes?: number;
  quantityAvailable?: number;
  winningBidderId?: string | null;
  fulfillmentStatus?: AuctionFulfillmentStatus;
  fulfilledAt?: IsoDateTime | null;
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
  photoUrls?: string[];
  estimatedValueCents?: Cents | null;
  startingBidCents?: Cents | null;
  currentBidCents?: Cents | null;
  fairMarketValueCents?: Cents | null;
  winnerName?: string | null;
  donorName?: string | null;
  donorId?: string | null;
  itemSubmissionId?: string | null;
  itemType?: "silent" | "live" | "buy_now" | "fixed_price" | "fund_a_need";
  category?: string | null;
  restrictions?: string | null;
  expiresAt?: IsoDateTime | null;
  deliveryDetails?: string | null;
  deliveryMethod?: string | null;
  creditText?: string | null;
  showFairMarketValue?: boolean;
  buyNowCents?: Cents | null;
  reserveCents?: Cents | null;
  incrementRule?: "tiered" | "fixed";
  closingWave?: string | null;
  notesToSchool?: string | null;
  isServiceOrUse?: boolean;
  overFiveThousandFlag?: boolean;
  bidIncrementCents?: Cents | null;
  readinessStatus?: AuctionReadinessStatus;
  isPublished?: boolean;
  opensAt?: IsoDateTime | null;
  closesAt?: IsoDateTime | null;
  extensionMinutes?: number;
  quantityAvailable?: number;
  winningBidderId?: string | null;
  fulfillmentStatus?: AuctionFulfillmentStatus;
  fulfilledAt?: IsoDateTime | null;
  paymentMethod?: string | null;
  paymentLink?: string | null;
  paymentReceivedAt?: IsoDateTime | null;
  status?: AuctionItemStatus;
  auctionType?: AuctionKind;
  lotNumber?: number | null;
}

export type AuctionItemPatch = Partial<AuctionItemDraft>;

export interface AuctionBidder {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string | null;
  householdId?: string | null;
  attendeeId?: string | null;
  paddleNumber?: number | null;
  hasPaymentMethod?: boolean;
  autoChargeOptIn?: boolean;
  checkedInAt?: IsoDateTime | null;
  phoneVerifiedAt?: IsoDateTime | null;
  grades?: string[];
  participantType: AuctionParticipantType;
  publicToken: string;
  status: "active" | "blocked";
  createdAt: IsoDateTime;
}

export interface AuctionBid {
  id: string;
  eventId: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amountCents: Cents;
  maximumAmountCents: Cents;
  isAutomatic: boolean;
  channel?: "in_room" | "remote";
  createdAt: IsoDateTime;
}

export interface AuctionOrder {
  id: string;
  eventId: string;
  itemId: string;
  itemTitle: string;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  amountCents: Cents;
  applicationFeeCents: Cents;
  status: PaymentStatus;
  paidAt: IsoDateTime | null;
  refundedAt: IsoDateTime | null;
  fulfillmentStatus: AuctionFulfillmentStatus;
  createdAt: IsoDateTime;
}

export const SCHOOL_GRADES = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Alumni", "Faculty/Staff", "Friend of school"] as const;
export type SchoolGrade = (typeof SCHOOL_GRADES)[number];

export interface Household {
  id: string;
  displayName: string;
  primaryEmail: string;
  phone: string | null;
  creditName: string | null;
  isAnonymous: boolean;
  grades: SchoolGrade[];
  createdAt: IsoDateTime;
}

export interface AuctionCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export type ItemSubmissionStatus = "submitted" | "needs_info" | "approved" | "rejected" | "in_catalog" | "sold" | "delivered";

export interface ItemSubmission {
  id: string;
  eventId: string;
  donorId: string | null;
  submittedBy: string;
  publicToken: string;
  payload: Record<string, unknown>;
  status: ItemSubmissionStatus;
  auctionItemId: string | null;
  requestedChanges: string | null;
  submittedAt: IsoDateTime;
  updatedAt: IsoDateTime | null;
}

export interface AuctionItemWinner {
  id: string;
  itemId: string;
  bidderId: string;
  amountCents: Cents;
  awardedAt: IsoDateTime;
  awardedBy: string;
  reversedAt: IsoDateTime | null;
}

export interface FundraisingPledge {
  id: string;
  eventId: string;
  bidderId: string | null;
  householdId: string | null;
  amountCents: Cents;
  appeal: string;
  designation: string | null;
  channel: "in_room" | "remote";
  anonymous: boolean;
  createdAt: IsoDateTime;
}

export type BidderBillStatus = "draft" | "pending" | "paid" | "failed" | "refunding" | "refunded";

export interface BidderBill {
  id: string;
  eventId: string;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  publicToken: string;
  itemsTotalCents: Cents;
  pledgesTotalCents: Cents;
  feesCoveredCents: Cents;
  totalCents: Cents;
  applicationFeeCents: Cents;
  status: BidderBillStatus;
  paymentMethod?: string | null;
  payoutAvailableAt?: IsoDateTime | null;
  paidAt: IsoDateTime | null;
  refundedAt?: IsoDateTime | null;
}

export interface PublicBidderBill extends BidderBill {
  eventTitle: string;
  lineItems: FundraisingReceiptLineItem[];
  coverFeesAvailable: boolean;
  receiptToken: string | null;
}

export type FundraisingReceiptType = "contribution" | "quid_pro_quo" | "in_kind" | "raffle";

export interface FundraisingReceiptLineItem {
  kind: "auction" | "ticket" | "donation" | "fund_a_need" | "sponsorship" | "raffle";
  description: string;
  amountCents: Cents;
  fairMarketValueCents: Cents;
  deductibleCents: Cents;
}

export interface FundraisingReceipt {
  id: string;
  eventId: string | null;
  householdId: string | null;
  type: FundraisingReceiptType;
  receiptNumber: string;
  payerName: string;
  payerEmail: string | null;
  amountCents: Cents;
  fairMarketValueCents: Cents;
  deductibleCents: Cents;
  lineItems: FundraisingReceiptLineItem[];
  supersedesReceiptId: string | null;
  issuedAt: IsoDateTime;
  pdfUrl: string | null;
}

export interface FundraisingOrganizationProfile {
  legalName: string | null;
  ein: string | null;
  orgType: "nonprofit_501c3" | "government" | null;
  receiptPrefix: string;
  raffleEnabled: boolean;
  raffleRegistrationConfirmed: boolean;
  defaultCoverFees: boolean;
}

export interface FundraisingBroadcast {
  id: string;
  eventId: string;
  channels: string[];
  message: string;
  recipientCount: number;
  sentAt: IsoDateTime;
}

export type FundraisingBroadcastAudience = "all" | "remote" | "in_room" | "bidders" | "outbid" | "watchers" | `grade:${SchoolGrade}`;

export interface DonationCampaign {
  id: string;
  eventId: string | null;
  publicToken: string;
  title: string;
  description: string | null;
  goalCents: Cents | null;
  suggestedAmountsCents: Cents[];
  designations: string[];
  defaultDesignation: string | null;
  monthlyEnabled: boolean;
  coverFeesEnabled: boolean;
  isActive: boolean;
}

export interface PublicDonationCampaign extends DonationCampaign {
  organizationName: string;
  raisedCents: Cents;
  donorCount: number;
}

export interface DonationCheckoutResult {
  donationId: string;
  checkoutUrl: string;
}

export interface PublicDonationStatus {
  donationId: string;
  status: PaymentStatus;
  receiptToken: string | null;
}

export interface PublicExperienceCertificate {
  itemTitle: string;
  winnerName: string;
  eventTitle: string;
  organizationName: string;
  restrictions: string | null;
  expiresAt: IsoDateTime | null;
  deliveryDetails: string | null;
}

export interface FundraisingDashboard {
  totals: { silentCents: Cents; liveCents: Cents; pledgesCents: Cents; ticketsCents: Cents; donationsCents: Cents; totalCents: Cents };
  bidders: { registered: number; checkedIn: number; remote: number };
  items: { total: number; noBids: number; sold: number; sellThroughRate: number };
  byGrade: Array<{ grade: string; households: number; itemsDonated: number; totalRaisedCents: Cents }>;
  hotItems: Array<{ id: string; title: string; bidCountLastFiveMinutes: number; closesAt: IsoDateTime | null }>;
  noBidClosingSoon: Array<{ id: string; title: string; closesAt: IsoDateTime | null }>;
}

export interface FundraisingReports {
  bidders: Array<Record<string, string | number | boolean | null>>;
  bids: Array<Record<string, string | number | boolean | null>>;
  items: Array<Record<string, string | number | boolean | null>>;
  attendance: Array<Record<string, string | number | boolean | null>>;
  grades: Array<Record<string, string | number | boolean | null>>;
  payments: Array<Record<string, string | number | boolean | null>>;
  acknowledgments: Array<Record<string, string | number | boolean | null>>;
  historical: Array<Record<string, string | number | boolean | null>>;
  familyHistory: Array<Record<string, string | number | boolean | null>>;
  itemIntelligence: Array<Record<string, string | number | boolean | null>>;
  yearEndStatements: Array<Record<string, string | number | boolean | null>>;
}

export interface PublicItemIntakePayload {
  eventTitle: string;
  organizationName: string;
  categories: string[];
  grades: readonly string[];
  prefill?: Partial<PublicItemSubmissionDraft>;
  submission?: ItemSubmission;
}

export interface PublicItemSubmissionDraft {
  donorName: string;
  donorEmail: string;
  donorPhone?: string | null;
  grades: string[];
  creditText: string;
  anonymous: boolean;
  donorKind: "family" | "business";
  companyName?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  itemTitle: string;
  description: string;
  photoUrls: string[];
  category: string;
  estimatedValueCents: Cents;
  fairMarketValueCents: Cents;
  restrictions?: string | null;
  expirationDate?: IsoDateTime | null;
  deliveryMethod: string;
  suggestedStartingBidCents?: Cents | null;
  notesToSchool?: string | null;
  isServiceOrUse?: boolean;
}

export interface PublicAuctionItem {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  photoUrls?: string[];
  category: string | null;
  restrictions: string | null;
  expiresAt: IsoDateTime | null;
  deliveryDetails: string | null;
  fairMarketValueCents: Cents | null;
  estimatedValueCents?: Cents | null;
  showFairMarketValue?: boolean;
  creditText?: string | null;
  startingBidCents: Cents;
  currentBidCents: Cents | null;
  bidIncrementCents: Cents;
  opensAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  status: AuctionItemStatus;
  itemType?: string;
  buyNowCents?: Cents | null;
  reserveCents?: Cents | null;
  quantityAvailable?: number;
  closingWave?: string | null;
  extensionMinutes?: number;
  lotNumber: number | null;
  bidCount: number;
  hasBid: boolean;
  bidHistory?: Array<{ amountCents: Cents; bidderLabel: string; placedAt: IsoDateTime }>;
}

export interface PublicBidderProfile extends AuctionBidder {
  watchedItemIds: string[];
  winningItemIds: string[];
  outbidItemIds: string[];
  totalDueCents: Cents;
}

export interface PublicAuctionPayload {
  eventTitle: string;
  eventDate: IsoDateTime;
  timeZone: string;
  settings: AuctionPageSettings;
  categories: string[];
  items: PublicAuctionItem[];
  announcements?: Array<{ id: string; message: string; sentAt: IsoDateTime }>;
  donationToken?: string | null;
  fundANeedTotalCents?: Cents;
  latestPledges?: Array<{ amountCents: Cents; donorLabel: string; createdAt: IsoDateTime }>;
  sponsors?: Array<{ name: string; logoUrl: string | null }>;
}

export interface PublicAuctionBidResult {
  item: PublicAuctionItem;
  bidderIsLeading: boolean;
  minimumNextBidCents: Cents;
}

export const RAFFLE_STATUSES = ["open", "closed", "drawn"] as const;
export type RaffleStatus = (typeof RAFFLE_STATUSES)[number];

export interface RaffleItem {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ticketPriceCents: Cents;
  fairMarketValueCents?: Cents | null;
  totalTickets: number;
  soldTickets: number;
  winnerName: string | null;
  winnerEmail: string | null;
  winnerTicketId: string | null;
  drawnAt: IsoDateTime | null;
  w2gReviewRequired?: boolean;
  taxpayerIdCollectionStatus?: "not_required" | "required" | "collected";
  taxpayerIdCollectedAt?: IsoDateTime | null;
  taxpayerIdCollectedBy?: string | null;
  status: RaffleStatus;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface RaffleItemDraft {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  ticketPriceCents?: Cents;
  fairMarketValueCents?: Cents | null;
  totalTickets?: number;
  status?: RaffleStatus;
  taxpayerIdCollectionStatus?: "not_required" | "required" | "collected";
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

export const RFP_TARGET_TYPES = ["venue", "vendor"] as const;
export type RfpTargetType = (typeof RFP_TARGET_TYPES)[number];

export const RFP_EVENT_TYPES = [
  "Conference",
  "Conference with room block",
  "Room block",
  "Dinner",
  "Meeting",
  "Summit",
  "Team summit",
  "Gala",
  "Reception",
  "Other",
] as const;

export interface RfpSpaceRequirement {
  id: string;
  purpose: string;
  date: IsoDateTime | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  notes: string | null;
}

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
  targetType: RfpTargetType;
  vendorCategory: string;
  description: string | null;
  eventType: string | null;
  eventDate: IsoDateTime | null;
  startTime: string | null;
  endTime: string | null;
  city: string | null;
  location: string | null;
  budgetMinCents: Cents | null;
  budgetMaxCents: Cents | null;
  headcount: number | null;
  roomBlockRequired: boolean;
  roomsRequired: number | null;
  checkInDate: IsoDateTime | null;
  checkOutDate: IsoDateTime | null;
  spaceRequirements: RfpSpaceRequirement[];
  foodBeverageSpendCents: Cents | null;
  ancillarySpendCents: Cents | null;
  ancillarySpendNotes: string | null;
  /** Responses are due by this date. */
  deadline: IsoDateTime | null;
  requirements: string | null;
  status: RfpStatus;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export interface RfpDraft {
  title: string;
  targetType?: RfpTargetType;
  vendorCategory: string;
  description?: string | null;
  eventType?: string | null;
  eventDate?: IsoDateTime | null;
  startTime?: string | null;
  endTime?: string | null;
  city?: string | null;
  location?: string | null;
  budgetMinCents?: Cents | null;
  budgetMaxCents?: Cents | null;
  headcount?: number | null;
  roomBlockRequired?: boolean;
  roomsRequired?: number | null;
  checkInDate?: IsoDateTime | null;
  checkOutDate?: IsoDateTime | null;
  spaceRequirements?: RfpSpaceRequirement[];
  foodBeverageSpendCents?: Cents | null;
  ancillarySpendCents?: Cents | null;
  ancillarySpendNotes?: string | null;
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

export interface RfpInvitation {
  id: string;
  rfpId: string;
  vendorId: string;
  vendorName: string;
  recipientEmail: string;
  publicToken: string;
  sentAt: IsoDateTime;
  deliveredAt: IsoDateTime | null;
  deliveryError: string | null;
}

/** An RFP with its replies, which is the only shape the RFP tab ever renders. */
export interface RfpWithResponses extends Rfp {
  responses: RfpResponse[];
  invitations: RfpInvitation[];
}

/** Public-safe proposal brief. Workspace and internal vendor data never leave the API. */
export interface PublicRfpPayload {
  rfp: Rfp;
  eventTitle: string;
  vendorName: string;
  response: RfpResponse | null;
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

/* --------------------------------------------------------------- workspace team */

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Someone with access to the workspace.
 *
 * Roles have existed since the schema was written and the API has always enforced them,
 * but nothing could ever assign one — so every member sat at the default and the
 * permission system was invisible. This is the missing half.
 */
export interface WorkspaceMember {
  /** Null until an invited person signs in for the first time. */
  userId: string | null;
  role: WorkspaceRole;
  /** `invited` means the seat is granted but unclaimed — they have never signed in. */
  status: "active" | "invited";
  /** From the identity provider; null when the account has since been deleted there. */
  name: string | null;
  email: string | null;
  /** So the UI can stop someone locking themselves out of their own workspace. */
  isSelf: boolean;
  /** When they joined, or when they were invited if they have not yet. */
  joinedAt: IsoDateTime;
  /** Null is a workspace-wide seat; otherwise access is limited to this event. */
  eventScopeId?: string | null;
  eventScopeTitle?: string | null;
}

/**
 * The result of inviting someone.
 *
 * `emailSent` is reported rather than assumed: the seat is granted by the invite whether
 * or not the mail goes out, and telling an owner "we emailed them" when we did not is how
 * a colleague ends up waiting for a message that never arrives.
 */
export interface InviteResult {
  member: WorkspaceMember;
  emailSent: boolean;
}

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

/** Home grouping follows the user; currency and time zone are shared by the workspace. */
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
  agenda: PublicRunOfShowItem[];
  tickets: TicketType[];
  volunteerNeeds: VolunteerNeedWithCoverage[];
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

/* ----------------------------------------------------------- product feedback */

export const FEEDBACK_CATEGORIES = ["general", "bug", "idea", "praise"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const DEFAULT_FEEDBACK_CATEGORY: FeedbackCategory = "general";
export const FEEDBACK_INBOX_PATH = "/app/feedback";
export const FEEDBACK_LIMITS = {
  minMessageLength: 3,
  maxMessageLength: 2_000,
  maxPagePathLength: 500,
} as const;

/** One note submitted through the signed-in feedback conversation. */
export interface ProductFeedback {
  id: string;
  workspaceId: string;
  userId: string;
  category: FeedbackCategory;
  message: string;
  /** The product page the user was viewing when they sent the note. */
  pagePath: string | null;
  createdAt: IsoDateTime;
}

export interface ProductFeedbackDraft {
  category: FeedbackCategory;
  message: string;
  pagePath?: string | null;
}

/** Feedback enriched for the private Beebizy team inbox. */
export interface FeedbackInboxItem extends ProductFeedback {
  userName: string | null;
  userEmail: string | null;
  workspaceName: string;
}

export type FeedbackNotificationOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

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

export interface CustomReportRow {
  eventId: string;
  title: string;
  date: IsoDateTime;
  status: EventStatus;
  category: string;
  location: string | null;
  capacity: number | null;
  registrations: number;
  readiness: number;
  budgetPlannedCents: Cents;
  budgetSpentCents: Cents;
  revenueCents: Cents;
  riskCount: number;
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
