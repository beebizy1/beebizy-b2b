/**
 * Row ↔ entity mapping.
 *
 * The schema and the domain model deliberately differ in places: the table says
 * `startsAt` where the entity says `date`, `venue` where the entity says `location`,
 * `ratingTenths` where the entity says `rating`. Storage names what it stores; the
 * domain names what the product calls it. This file is the only place that knows both,
 * so a column rename never reaches a screen.
 *
 * It also converts Postgres timestamps to the ISO strings the entities specify, which is
 * the same boundary conversion the Firestore adapter would have done for `Timestamp`.
 */

import type { InferSelectModel } from "drizzle-orm";
import type * as s from "./schema.ts";
import type {
  Guest,
  AuctionItem,
  BudgetItem,
  Canvas,
  CanvasCard,
  ChecklistItem,
  Event,
  MoodBoardImage,
  EventRoi,
  EventVendor,
  Floorplan,
  FloorplanItem,
  Location,
  MenuItem,
  RaffleItem,
  RaffleTicket,
  Registration,
  RunOfShowItem,
  Sponsorship,
  Template,
  TemplateContents,
  TicketType,
  UserSettings,
  Vendor,
  VendorMessage,
} from "../data/entities.ts";

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);
const isoRequired = (value: Date): string => value.toISOString();

/* --------------------------------------------------------------------- outbound */

export function toLocation(row: InferSelectModel<typeof s.locations>): Location {
  return {
    id: row.id,
    ownerId: row.workspaceId,
    name: row.name,
    corporationName: row.corporationName,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    phone: row.phone,
    // Computed by the query that needs it; a stored counter is a thing that goes stale.
    eventCount: 0,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toEvent(
  row: InferSelectModel<typeof s.events>,
  extras: { location?: InferSelectModel<typeof s.locations> | null; registrationCount?: number } = {},
): Event {
  const location = extras.location ? toLocation(extras.location) : null;
  return {
    id: row.id,
    ownerId: row.workspaceId,
    title: row.title,
    description: row.description,
    date: isoRequired(row.startsAt),
    endDate: iso(row.endsAt),
    location: row.venue ?? (location ? [location.name, location.city].filter(Boolean).join(", ") : null),
    locationId: row.locationId,
    locationRecord: location,
    capacity: row.capacity,
    status: row.status,
    category: row.category,
    imageUrl: row.imageUrl,
    registrationCount: extras.registrationCount ?? 0,
    shareToken: row.shareToken,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toGuest(row: InferSelectModel<typeof s.guests>): Guest {
  return {
    id: row.id,
    ownerId: row.workspaceId,
    name: row.name,
    contact: row.contact,
    notes: row.notes,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toRegistration(
  row: InferSelectModel<typeof s.registrations>,
  eventTitle: string,
): Registration {
  return {
    id: row.id,
    ownerId: row.workspaceId,
    eventId: row.eventId,
    eventTitle,
    guestId: row.guestId,
    status: row.status,
    registeredAt: isoRequired(row.registeredAt),
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toVendor(
  row: InferSelectModel<typeof s.vendors>,
  thread: { lastMessage: string | null; lastMessageAt: Date | null; lastDirection: "inbound" | "outbound" | null; unreadCount: number } = {
    lastMessage: null,
    lastMessageAt: null,
    lastDirection: null,
    unreadCount: 0,
  },
): Vendor {
  return {
    id: row.id,
    ownerId: row.workspaceId,
    name: row.name,
    category: row.category,
    description: row.description,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    logoUrl: row.logoUrl,
    // Stored in tenths so the schema holds no floats.
    rating: row.ratingTenths === null ? null : row.ratingTenths / 10,
    city: row.city,
    state: row.state,
    country: row.country,
    lastMessage: thread.lastMessage,
    lastMessageAt: iso(thread.lastMessageAt),
    lastDirection: thread.lastDirection,
    unreadCount: thread.unreadCount,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toVendorMessage(row: InferSelectModel<typeof s.vendorMessages>): VendorMessage {
  return {
    id: row.id,
    vendorId: row.vendorId,
    eventId: row.eventId,
    direction: row.direction,
    senderName: row.senderName,
    subject: row.subject,
    content: row.body,
    isRead: row.isRead,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toEventVendor(
  row: InferSelectModel<typeof s.eventVendors>,
  vendor: InferSelectModel<typeof s.vendors> | null,
): EventVendor {
  return {
    id: row.id,
    eventId: row.eventId,
    vendorId: row.vendorId,
    notes: row.notes,
    status: row.status,
    feeCents: row.feeCents,
    vendor: vendor ? toVendor(vendor) : null,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toChecklistItem(row: InferSelectModel<typeof s.checklistItems>): ChecklistItem {
  return {
    id: row.id,
    eventId: row.eventId,
    title: row.title,
    description: row.description,
    completed: row.completed,
    dueDate: iso(row.dueDate),
    assignedTo: row.assignedTo,
    category: row.category,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toRunOfShowItem(row: InferSelectModel<typeof s.runOfShowItems>): RunOfShowItem {
  return {
    id: row.id,
    eventId: row.eventId,
    startTime: row.startTime,
    duration: row.durationMinutes,
    title: row.title,
    description: row.description,
    responsible: row.responsible,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toBudgetItem(row: InferSelectModel<typeof s.budgetItems>): BudgetItem {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    category: row.category,
    type: row.type,
    estimatedCents: row.estimatedCents,
    actualCents: row.actualCents,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toMenuItem(row: InferSelectModel<typeof s.menuItems>): MenuItem {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description,
    course: row.course,
    dietaryTags: row.dietaryTags,
    priceCents: row.priceCents,
    serves: row.serves,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toMoodBoardImage(row: InferSelectModel<typeof s.moodBoardImages>): MoodBoardImage {
  return {
    id: row.id,
    eventId: row.eventId,
    url: row.url,
    caption: row.caption,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toTicketType(row: InferSelectModel<typeof s.ticketTypes>): TicketType {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    quantityTotal: row.quantityTotal,
    quantitySold: row.quantitySold,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toAuctionItem(row: InferSelectModel<typeof s.auctionItems>): AuctionItem {
  return {
    id: row.id,
    eventId: row.eventId,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    startingBidCents: row.startingBidCents,
    currentBidCents: row.currentBidCents,
    fairMarketValueCents: row.fairMarketValueCents,
    winnerName: row.winnerName,
    donorName: row.donorName,
    paymentMethod: row.paymentMethod,
    paymentLink: row.paymentLink,
    paymentReceivedAt: iso(row.paymentReceivedAt),
    status: row.status,
    auctionType: row.auctionType,
    lotNumber: row.lotNumber,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toRaffleItem(row: InferSelectModel<typeof s.raffleItems>): RaffleItem {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    ticketPriceCents: row.ticketPriceCents,
    totalTickets: row.totalTickets,
    soldTickets: row.soldTickets,
    winnerName: row.winnerName,
    winnerEmail: row.winnerEmail,
    winnerTicketId: row.winnerTicketId,
    drawnAt: iso(row.drawnAt),
    status: row.status,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toRaffleTicket(row: InferSelectModel<typeof s.raffleTickets>): RaffleTicket {
  return {
    id: row.id,
    raffleItemId: row.raffleItemId,
    eventId: row.eventId,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    quantity: row.quantity,
    createdAt: isoRequired(row.createdAt),
  };
}

export function toSponsorship(row: InferSelectModel<typeof s.sponsorships>): Sponsorship {
  return {
    id: row.id,
    eventId: row.eventId,
    companyName: row.companyName,
    tier: row.tier,
    amountCents: row.amountCents,
    logoUrl: row.logoUrl,
    contactEmail: row.contactEmail,
    contactName: row.contactName,
    notes: row.notes,
    status: row.status,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toTemplate(row: InferSelectModel<typeof s.templates>): Template {
  const contents = row.contents as TemplateContents;
  return {
    id: row.id,
    ownerId: row.workspaceId,
    name: row.name,
    description: row.description,
    category: row.category,
    defaultCapacity: row.defaultCapacity,
    // Derived from the document, so the count and the contents cannot disagree.
    checklistCount: contents.checklistItems.length,
    runOfShowCount: contents.runOfShowItems.length,
    budgetCount: contents.budgetItems.length,
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toTemplateContents(row: InferSelectModel<typeof s.templates>): TemplateContents {
  return row.contents as TemplateContents;
}

export function toCanvas(row: InferSelectModel<typeof s.canvases>): Canvas {
  return {
    id: row.id,
    ownerId: row.workspaceId,
    name: row.name,
    description: row.description,
    eventId: row.eventId,
    cards: row.cards as CanvasCard[],
    createdAt: isoRequired(row.createdAt),
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

export function toFloorplan(row: InferSelectModel<typeof s.floorplans>): Floorplan {
  return {
    eventId: row.eventId,
    name: row.name,
    items: row.items as FloorplanItem[],
    updatedAt: isoRequired(row.updatedAt),
  };
}

export function toRoi(row: InferSelectModel<typeof s.eventRoi>): EventRoi {
  return {
    eventId: row.eventId,
    eventCostCents: row.eventCostCents,
    unitsSold: row.unitsSold,
    avgItemPriceCents: row.avgItemPriceCents,
    notes: row.notes,
    updatedAt: isoRequired(row.updatedAt),
  };
}

export function toUserSettings(row: InferSelectModel<typeof s.userSettings>): UserSettings {
  return {
    homeGrouping: row.homeGrouping as UserSettings["homeGrouping"],
    currency: row.currency,
    timeZone: row.timeZone,
  };
}

/* ---------------------------------------------------------------------- inbound */

/** Parses an ISO string from a client into a Date, rejecting anything unparseable. */
export function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new Error(`${field} must be an ISO date string.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is not a valid date.`);
  return date;
}

export function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  return parseDate(value, field);
}
