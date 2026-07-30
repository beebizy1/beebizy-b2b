// Hand-written entity types (fork of vendor/api-client-react's generated api.schemas.ts,
// with every `id`/`*Id` field re-typed from number to string for Firestore doc IDs).

export const EventStatus = {
  draft: "draft",
  published: "published",
  cancelled: "cancelled",
  completed: "completed",
} as const;
export type EventStatusType = (typeof EventStatus)[keyof typeof EventStatus];

export interface Location {
  id: string;
  ownerId: string;
  name: string;
  corporationName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  phone?: string | null;
  // Denormalized count of events referencing this location, kept in sync by events.ts's
  // create/update/delete mutations (rendered on every row of LocationsList.tsx).
  eventCount: number;
  createdAt: string;
  updatedAt?: string;
}

/** Historically a distinct "with stats" variant; now just an alias since eventCount always exists. */
export type LocationWithStats = Location;

export interface LocationInput {
  name: string;
  corporationName: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
}

export type LocationUpdate = Partial<LocationInput>;

export type ListLocationsParams = { corporationName?: string };

export interface Event {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  date: string;
  endDate?: string | null;
  location?: string | null;
  locationId?: string | null;
  locationRecord?: Location;
  capacity?: number | null;
  status: EventStatusType;
  category: string;
  imageUrl?: string | null;
  registrationCount?: number;
  shareToken?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface EventInput {
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  location?: string;
  locationId?: string;
  capacity?: number;
  status: EventStatusType;
  category: string;
  imageUrl?: string;
}

export interface EventUpdate {
  title?: string;
  description?: string;
  date?: string;
  endDate?: string;
  location?: string;
  locationId?: string | null;
  capacity?: number;
  status?: EventStatusType;
  category?: string;
  imageUrl?: string;
}

export type ListEventsParams = { status?: string; category?: string; locationId?: string };

export interface Attendee {
  id: string;
  ownerId: string;
  name: string;
  contact: string;
  notes?: string | null;
  createdAt: string;
}

export interface AttendeeInput {
  name: string;
  contact: string;
  notes?: string;
}

export type AttendeeUpdate = Partial<AttendeeInput>;

export const RegistrationStatus = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
} as const;
export type RegistrationStatusType = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export interface Registration {
  id: string;
  ownerId: string;
  eventId: string;
  eventTitle: string;
  attendeeId: string;
  status: RegistrationStatusType;
  registeredAt: string;
}

export interface RegistrationWithAttendee extends Registration {
  attendee: Attendee;
}

export interface RegistrationInput {
  eventId: string;
  attendeeId: string;
  status?: RegistrationStatusType;
}

export interface RegistrationUpdate {
  status?: RegistrationStatusType;
}

export interface Vendor {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  rating?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  // Denormalized conversation summary (see messages.ts, Phase D).
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastDirection?: string | null;
  unreadCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface VendorInput {
  name: string;
  category: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  logoUrl?: string;
  rating?: number;
  city?: string;
  state?: string;
  country?: string;
}

export type VendorUpdate = Partial<VendorInput>;

export type ListVendorsParams = { category?: string };

export const EventVendorStatus = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
} as const;
export type EventVendorStatusType = (typeof EventVendorStatus)[keyof typeof EventVendorStatus];

export interface EventVendor {
  id: string;
  eventId: string;
  vendorId: string;
  notes?: string | null;
  status: EventVendorStatusType;
  fee?: string | null;
  vendor?: Vendor;
  createdAt: string;
}

export interface EventVendorInput {
  vendorId: string;
  notes?: string;
  status?: EventVendorStatusType;
  fee?: string;
}

export interface EventVendorUpdate {
  notes?: string;
  status?: EventVendorStatusType;
  fee?: string;
}

export interface RunOfShowItem {
  id: string;
  eventId: string;
  startTime: string;
  duration?: number | null;
  title: string;
  description?: string | null;
  responsible?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface RunOfShowInput {
  startTime: string;
  duration?: number;
  title: string;
  description?: string;
  responsible?: string;
  sortOrder?: number;
}

export type RunOfShowUpdate = Partial<RunOfShowInput>;

export interface ChecklistItem {
  id: string;
  eventId: string;
  title: string;
  description?: string | null;
  completed: boolean;
  dueDate?: string | null;
  assignedTo?: string | null;
  category: string;
  sortOrder: number;
  createdAt: string;
}

export interface ChecklistInput {
  title: string;
  description?: string;
  completed?: boolean;
  dueDate?: string;
  assignedTo?: string;
  category?: string;
  sortOrder?: number;
}

export type ChecklistUpdate = Partial<ChecklistInput>;

export const BudgetItemType = {
  expense: "expense",
  revenue: "revenue",
} as const;
export type BudgetItemTypeType = (typeof BudgetItemType)[keyof typeof BudgetItemType];

export interface BudgetItem {
  id: string;
  eventId: string;
  name: string;
  category: string;
  type: BudgetItemTypeType;
  estimatedAmount: number;
  actualAmount?: number | null;
  notes?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface BudgetItemInput {
  name: string;
  category?: string;
  type: BudgetItemTypeType;
  estimatedAmount: number;
  actualAmount?: number;
  notes?: string;
  sortOrder?: number;
}

export type BudgetItemUpdate = Partial<BudgetItemInput>;

export type DashboardStatsEventsByCategoryItem = { category: string; count: number };
export type DashboardStatsEventsByLocationItem = { locationName: string; count: number };

export interface DashboardStats {
  totalEvents: number;
  totalAttendees: number;
  totalRegistrations: number;
  upcomingEvents: number;
  publishedEvents: number;
  confirmedRegistrations: number;
  totalLocations: number;
  eventsByCategory?: DashboardStatsEventsByCategoryItem[];
  eventsByLocation?: DashboardStatsEventsByLocationItem[];
}

export interface Template {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  category: string;
  defaultCapacity?: number | null;
  createdAt: string;
  checklistCount?: number;
  runOfShowCount?: number;
  budgetCount?: number;
}

export interface TemplateChecklistItem {
  id: string;
  templateId: string;
  title: string;
  description?: string | null;
  category: string;
  sortOrder: number;
  createdAt: string;
}

export interface TemplateRunOfShowItem {
  id: string;
  templateId: string;
  startTime: string;
  duration?: number | null;
  title: string;
  description?: string | null;
  responsible?: string | null;
  sortOrder: number;
  createdAt: string;
}

export const TemplateBudgetItemType = {
  expense: "expense",
  revenue: "revenue",
} as const;
export type TemplateBudgetItemTypeType = (typeof TemplateBudgetItemType)[keyof typeof TemplateBudgetItemType];

export interface TemplateBudgetItem {
  id: string;
  templateId: string;
  name: string;
  category: string;
  type: TemplateBudgetItemTypeType;
  estimatedAmount: number;
  notes?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface TemplateDetail extends Template {
  checklistItems: TemplateChecklistItem[];
  runOfShowItems: TemplateRunOfShowItem[];
  budgetItems: TemplateBudgetItem[];
}

export interface TemplateInput {
  name: string;
  description?: string;
  category: string;
  defaultCapacity?: number;
}

export type TemplateUpdate = Partial<TemplateInput>;

export interface TemplateChecklistItemInput {
  title: string;
  description?: string;
  category?: string;
  sortOrder?: number;
}

export interface TemplateRunOfShowItemInput {
  startTime: string;
  duration?: number;
  title: string;
  description?: string;
  responsible?: string;
  sortOrder?: number;
}

export interface TemplateBudgetItemInput {
  name: string;
  category?: string;
  type: TemplateBudgetItemTypeType;
  estimatedAmount: number;
  notes?: string;
  sortOrder?: number;
}

export interface EventFromTemplateInput {
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  locationId?: string;
  location?: string;
  capacity?: number;
  status?: EventStatusType;
  category: string;
}

export interface SaveEventAsTemplateInput {
  name: string;
  description?: string;
}

export type FloorplanLayout = { [key: string]: unknown };

export interface Floorplan {
  id: string;
  eventId: string;
  name: string;
  layout: FloorplanLayout;
  createdAt: string;
  updatedAt: string;
}

export interface SaveFloorplanInput {
  name: string;
  layout: FloorplanLayout;
}

export interface EventInspiration {
  id: string;
  eventId: string;
  url: string;
  caption?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface AddInspirationInput {
  url: string;
  caption?: string;
}

export interface EventShareToken {
  shareToken: string;
}

export interface SharedEventDetail {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  endDate?: string | null;
  location?: string | null;
  capacity?: number | null;
  category: string;
  status: string;
  checklistItems?: ChecklistItem[];
  runOfShowItems?: RunOfShowItem[];
}

export interface VendorMessage {
  id: string;
  vendorId: string;
  eventId?: string | null;
  direction: string;
  senderName: string;
  subject?: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface SendVendorMessageInput {
  content: string;
  senderName: string;
  subject?: string;
  eventId?: string;
}

export interface VendorConversation {
  vendorId: string;
  vendorName: string;
  vendorCategory: string;
  lastMessage: string;
  lastMessageAt?: string;
  lastDirection?: string;
  unreadCount: number;
}

export const AuctionItemStatus = { open: "open", closed: "closed", won: "won" } as const;
export type AuctionItemStatusType = (typeof AuctionItemStatus)[keyof typeof AuctionItemStatus];
export const AuctionItemAuctionType = { silent: "silent", live: "live" } as const;
export type AuctionItemAuctionTypeType = (typeof AuctionItemAuctionType)[keyof typeof AuctionItemAuctionType];

export interface AuctionItem {
  id: string;
  eventId: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startingBid?: string | null;
  currentBid?: string | null;
  winnerName?: string | null;
  donorName?: string | null;
  paymentMethod?: string | null;
  paymentLink?: string | null;
  fairMarketValue?: string | null;
  paymentReceivedAt?: string | null;
  status: AuctionItemStatusType;
  auctionType?: AuctionItemAuctionTypeType;
  lotNumber?: number | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AuctionItemInput {
  title: string;
  description?: string;
  imageUrl?: string;
  startingBid?: string;
  currentBid?: string;
  winnerName?: string;
  donorName?: string;
  paymentMethod?: string;
  paymentLink?: string;
  fairMarketValue?: string;
  paymentReceivedAt?: string;
  status?: AuctionItemStatusType;
  auctionType?: AuctionItemAuctionTypeType;
  lotNumber?: number;
}

export type AuctionItemUpdate = Partial<AuctionItemInput>;

export const RaffleItemStatus = { open: "open", closed: "closed", drawn: "drawn" } as const;
export type RaffleItemStatusType = (typeof RaffleItemStatus)[keyof typeof RaffleItemStatus];

export interface RaffleItem {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  ticketPrice: string;
  totalTickets: number;
  soldTickets: number;
  winnerName?: string | null;
  winnerEmail?: string | null;
  winnerTicketId?: string | null;
  drawnAt?: string | null;
  status: RaffleItemStatusType;
  createdAt: string;
  updatedAt?: string;
}

export interface RaffleItemInput {
  name: string;
  description?: string;
  imageUrl?: string;
  ticketPrice?: string;
  totalTickets?: number;
  status?: RaffleItemStatusType;
}

export type RaffleItemUpdate = Partial<RaffleItemInput>;

export interface RaffleTicket {
  id: string;
  raffleItemId: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  createdAt: string;
}

export interface RaffleTicketInput {
  buyerName: string;
  buyerEmail: string;
  quantity?: number;
}

export const SponsorshipTier = { gold: "gold", silver: "silver", bronze: "bronze", custom: "custom" } as const;
export type SponsorshipTierType = (typeof SponsorshipTier)[keyof typeof SponsorshipTier];
export const SponsorshipStatus = { pending: "pending", confirmed: "confirmed", cancelled: "cancelled" } as const;
export type SponsorshipStatusType = (typeof SponsorshipStatus)[keyof typeof SponsorshipStatus];

export interface Sponsorship {
  id: string;
  eventId: string;
  companyName: string;
  tier: SponsorshipTierType;
  amount?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  notes?: string | null;
  status: SponsorshipStatusType;
  createdAt: string;
  updatedAt?: string;
}

export interface SponsorshipInput {
  companyName: string;
  tier?: SponsorshipTierType;
  amount?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactName?: string;
  notes?: string;
  status?: SponsorshipStatusType;
}

export type SponsorshipUpdate = Partial<SponsorshipInput>;

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  price: string;
  quantityTotal: number;
  quantitySold: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string | null;
}

export interface TicketTypeInput {
  name: string;
  description?: string;
  price: string;
  quantityTotal: number;
  quantitySold?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export type TicketTypeUpdate = Partial<TicketTypeInput>;

export interface TicketWithEvent extends TicketType {
  eventTitle: string;
  eventDate: string;
  eventStatus: string;
  eventCategory: string;
}

export interface MenuItem {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  course: string;
  dietaryTags?: string | null;
  price?: string | null;
  serves?: number | null;
  notes?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string | null;
}

export interface MenuItemInput {
  name: string;
  description?: string;
  course?: string;
  dietaryTags?: string;
  price?: string;
  serves?: number;
  notes?: string;
  sortOrder?: number;
}

export type MenuItemUpdate = Partial<MenuItemInput>;

export interface EventRoi {
  eventId: string;
  eventCost: number;
  unitsSold: number;
  avgItemPrice: number;
  notes: string;
  updatedAt: string;
}
