/**
 * Postgres schema.
 *
 * Two decisions run through all of it.
 *
 * **Tenancy is in the grain, not on top of it.** Every row belongs to a workspace, and
 * every foreign key cascades from it. The in-memory adapter stamped one hard-coded owner
 * on writes and filtered reads by nothing at all — harmless while the store was per-tab,
 * a data leak the moment a shared database exists. That is why persistence and tenancy
 * had to land together.
 *
 * **Money is `bigint` cents.** Postgres has `numeric`, but the application already speaks
 * integer cents end to end, and bigint keeps it that way with no decimal conversion at
 * the boundary. The legacy Firestore documents stored money as strings, which is how a
 * $90 bid came to beat $100.
 *
 * The relational shape also deletes code: real joins remove the denormalized snapshots
 * (`locationRecord`, `vendor`, `eventTitle`) the document model forced, and
 * `ON DELETE CASCADE` removes the eleven hand-written subcollection deletes.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------------- enums */

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member"]);
export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled", "completed"]);
export const registrationStatus = pgEnum("registration_status", ["pending", "confirmed", "cancelled"]);
export const bookingStatus = pgEnum("booking_status", ["pending", "confirmed", "cancelled"]);
export const budgetLineType = pgEnum("budget_line_type", ["expense", "revenue"]);
export const auctionKind = pgEnum("auction_kind", ["silent", "live"]);
export const auctionItemStatus = pgEnum("auction_item_status", ["open", "closed", "won"]);
export const raffleStatus = pgEnum("raffle_status", ["open", "closed", "drawn"]);
export const sponsorshipTier = pgEnum("sponsorship_tier", ["gold", "silver", "bronze", "custom"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "refunded", "failed"]);
export const subscriptionStatus = pgEnum("subscription_status", ["beta", "active", "past_due", "cancelled"]);

/* ------------------------------------------------------------------ workspaces */

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true });

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  /** Clerk organization id, once the customer has one. Null for a personal workspace. */
  clerkOrgId: text("clerk_org_id").unique(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  timeZone: text("time_zone").notNull().default("America/Los_Angeles"),
  subscriptionStatus: subscriptionStatus("subscription_status").notNull().default("beta"),
  betaStartedAt: timestamp("beta_started_at", { withTimezone: true }).notNull().defaultNow(),
  betaEndsAt: timestamp("beta_ends_at", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '3 months'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Membership is what authorizes every request: the API resolves the Clerk user to their
 * workspaces and refuses anything outside them. Roles exist from the start because
 * retrofitting authorization onto a schema that assumed one user per account is the kind
 * of migration that goes wrong.
 */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Clerk user id. */
    userId: text("user_id").notNull(),
    role: workspaceRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

export const userSettings = pgTable("user_settings", {
  /** Clerk user id. */
  userId: text("user_id").primaryKey(),
  homeGrouping: text("home_grouping").notNull().default("location"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  timeZone: text("time_zone").notNull().default("America/Los_Angeles"),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------------- locations */

export const locations = pgTable(
  "locations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    corporationName: text("corporation_name").notNull().default(""),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("USA"),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("locations_workspace_idx").on(table.workspaceId)],
);

/* ----------------------------------------------------------------------- events */

export const events = pgTable(
  "events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Free-text venue for events with no saved location. */
    venue: text("venue"),
    /** Set null rather than cascade: losing a venue must not delete its events. */
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    capacity: integer("capacity"),
    status: eventStatus("status").notNull().default("draft"),
    category: text("category").notNull().default("Other"),
    imageUrl: text("image_url"),
    /** Unique so a token can be looked up directly instead of scanning. */
    shareToken: text("share_token").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("events_workspace_starts_idx").on(table.workspaceId, table.startsAt),
    index("events_workspace_status_idx").on(table.workspaceId, table.status),
    index("events_location_idx").on(table.locationId),
  ],
);

/* ---------------------------------------------------------------------- people */

export const guests = pgTable(
  "guests",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contact: text("contact").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("guests_workspace_idx").on(table.workspaceId),
    // One person per email per workspace, so checkout can upsert instead of duplicating.
    uniqueIndex("guests_workspace_contact_idx").on(table.workspaceId, table.contact),
  ],
);

export const registrations = pgTable(
  "registrations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    status: registrationStatus("status").notNull().default("pending"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when the seat was bought rather than added by an organizer. */
    ticketTypeId: text("ticket_type_id"),
    quantity: integer("quantity").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("registrations_event_idx").on(table.eventId),
    index("registrations_workspace_idx").on(table.workspaceId),
    // The duplicate-registration rule the memory adapter enforced in JS, enforced by the
    // database instead so a concurrent request can't slip past it.
    uniqueIndex("registrations_event_guest_idx").on(table.eventId, table.guestId),
  ],
);

/* --------------------------------------------------------------------- vendors */

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("Other"),
    description: text("description"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    logoUrl: text("logo_url"),
    /** Tenths, so 4.8 is stored as 48 and there is no float in the schema. */
    ratingTenths: integer("rating_tenths"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("vendors_workspace_idx").on(table.workspaceId)],
);

export const vendorMessages = pgTable(
  "vendor_messages",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    direction: messageDirection("direction").notNull(),
    senderName: text("sender_name").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    /** Set once the message has actually been handed to the email provider. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
    createdAt: createdAt(),
  },
  (table) => [index("vendor_messages_vendor_idx").on(table.vendorId, table.createdAt)],
);

export const eventVendors = pgTable(
  "event_vendors",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    status: bookingStatus("status").notNull().default("pending"),
    feeCents: bigint("fee_cents", { mode: "number" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("event_vendors_event_idx").on(table.eventId),
    uniqueIndex("event_vendors_event_vendor_idx").on(table.eventId, table.vendorId),
  ],
);

/* ----------------------------------------------------------- event workspace */

const eventChild = {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};

export const checklistItems = pgTable(
  "checklist_items",
  {
    ...eventChild,
    title: text("title").notNull(),
    description: text("description"),
    completed: boolean("completed").notNull().default(false),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assignedTo: text("assigned_to"),
    category: text("category").notNull().default("General"),
  },
  (table) => [
    index("checklist_event_idx").on(table.eventId, table.sortOrder),
    // Powers the cross-event task list and the overdue risk rule in one indexed scan.
    index("checklist_open_idx").on(table.workspaceId, table.completed, table.dueDate),
  ],
);

export const runOfShowItems = pgTable(
  "run_of_show_items",
  {
    ...eventChild,
    startTime: varchar("start_time", { length: 5 }).notNull(),
    durationMinutes: integer("duration_minutes"),
    title: text("title").notNull(),
    description: text("description"),
    responsible: text("responsible"),
  },
  (table) => [index("run_of_show_event_idx").on(table.eventId, table.startTime)],
);

export const budgetItems = pgTable(
  "budget_items",
  {
    ...eventChild,
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    type: budgetLineType("type").notNull(),
    estimatedCents: bigint("estimated_cents", { mode: "number" }).notNull().default(0),
    actualCents: bigint("actual_cents", { mode: "number" }),
    notes: text("notes"),
  },
  (table) => [index("budget_event_idx").on(table.eventId), index("budget_workspace_type_idx").on(table.workspaceId, table.type)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    ...eventChild,
    name: text("name").notNull(),
    description: text("description"),
    course: text("course").notNull().default("Main"),
    dietaryTags: jsonb("dietary_tags").$type<string[]>().notNull().default([]),
    priceCents: bigint("price_cents", { mode: "number" }),
    serves: integer("serves"),
    notes: text("notes"),
  },
  (table) => [index("menu_event_idx").on(table.eventId)],
);

export const moodBoardImages = pgTable(
  "mood_board_images",
  {
    ...eventChild,
    url: text("url").notNull(),
    caption: text("caption"),
  },
  (table) => [index("mood_board_images_event_idx").on(table.eventId)],
);

export const floorplans = pgTable("floorplans", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Room layout"),
  /** Typed objects, validated at the API boundary — not the opaque blob Firestore held. */
  items: jsonb("items").$type<unknown[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only planning history. `eventId` deliberately has no event foreign key: when
 * an event is deleted, its decision history remains available for aggregate learning.
 */
export const eventHistory = pgTable(
  "event_history",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    actorId: text("actor_id").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("event_history_event_created_idx").on(table.workspaceId, table.eventId, table.createdAt),
    index("event_history_learning_idx").on(table.workspaceId, table.resource, table.createdAt),
  ],
);

/* -------------------------------------------------------------------- revenue */

export const ticketTypes = pgTable(
  "ticket_types",
  {
    ...eventChild,
    name: text("name").notNull(),
    description: text("description"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    /** 0 means unlimited. */
    quantityTotal: integer("quantity_total").notNull().default(0),
    /** Maintained by the checkout transaction, never by the client. */
    quantitySold: integer("quantity_sold").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("ticket_types_event_idx").on(table.eventId)],
);

/**
 * A paid checkout. Written before the payment is confirmed and completed by the Stripe
 * webhook, so a seat is never released on a card that failed and never sold twice on a
 * duplicated webhook — `stripeSessionId` is unique for exactly that reason.
 */
export const ticketOrders = pgTable(
  "ticket_orders",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    ticketTypeId: text("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    quantity: integer("quantity").notNull().default(1),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: paymentStatus("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("ticket_orders_event_idx").on(table.eventId, table.status)],
);

export const auctionItems = pgTable(
  "auction_items",
  {
    ...eventChild,
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    startingBidCents: bigint("starting_bid_cents", { mode: "number" }),
    currentBidCents: bigint("current_bid_cents", { mode: "number" }),
    fairMarketValueCents: bigint("fair_market_value_cents", { mode: "number" }),
    winnerName: text("winner_name"),
    donorName: text("donor_name"),
    paymentMethod: text("payment_method"),
    paymentLink: text("payment_link"),
    paymentReceivedAt: timestamp("payment_received_at", { withTimezone: true }),
    status: auctionItemStatus("status").notNull().default("open"),
    auctionType: auctionKind("auction_type").notNull().default("silent"),
    lotNumber: integer("lot_number"),
  },
  (table) => [index("auction_event_idx").on(table.eventId, table.lotNumber)],
);

export const raffleItems = pgTable(
  "raffle_items",
  {
    ...eventChild,
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    ticketPriceCents: bigint("ticket_price_cents", { mode: "number" }).notNull().default(0),
    totalTickets: integer("total_tickets").notNull().default(0),
    soldTickets: integer("sold_tickets").notNull().default(0),
    winnerName: text("winner_name"),
    winnerEmail: text("winner_email"),
    winnerTicketId: text("winner_ticket_id"),
    drawnAt: timestamp("drawn_at", { withTimezone: true }),
    status: raffleStatus("status").notNull().default("open"),
  },
  (table) => [index("raffle_event_idx").on(table.eventId)],
);

export const raffleTickets = pgTable(
  "raffle_tickets",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    raffleItemId: text("raffle_item_id")
      .notNull()
      .references(() => raffleItems.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [index("raffle_tickets_item_idx").on(table.raffleItemId)],
);

export const sponsorships = pgTable(
  "sponsorships",
  {
    ...eventChild,
    companyName: text("company_name").notNull(),
    tier: sponsorshipTier("tier").notNull().default("custom"),
    amountCents: bigint("amount_cents", { mode: "number" }),
    logoUrl: text("logo_url"),
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    notes: text("notes"),
    status: bookingStatus("status").notNull().default("pending"),
  },
  (table) => [index("sponsorships_event_idx").on(table.eventId)],
);

export const eventRoi = pgTable("event_roi", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventCostCents: bigint("event_cost_cents", { mode: "number" }).notNull().default(0),
  unitsSold: integer("units_sold").notNull().default(0),
  avgItemPriceCents: bigint("avg_item_price_cents", { mode: "number" }).notNull().default(0),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------ templates & boards */

export const templates = pgTable(
  "templates",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("Other"),
    defaultCapacity: integer("default_capacity"),
    /** Contents are a document: always read and written whole, never row by row. */
    contents: jsonb("contents")
      .$type<{ checklistItems: unknown[]; runOfShowItems: unknown[]; budgetItems: unknown[] }>()
      .notNull()
      .default({ checklistItems: [], runOfShowItems: [], budgetItems: [] }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("templates_workspace_idx").on(table.workspaceId)],
);

export const canvases = pgTable(
  "canvases",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Set null, not cascade: a board outlives the event it was concepting for. */
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    cards: jsonb("cards").$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("canvases_workspace_idx").on(table.workspaceId)],
);

/* ------------------------------------------------------------------- relations */

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  events: many(events),
  locations: many(locations),
  guests: many(guests),
  vendors: many(vendors),
  eventHistory: many(eventHistory),
}));

export const eventRelations = relations(events, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [events.workspaceId], references: [workspaces.id] }),
  location: one(locations, { fields: [events.locationId], references: [locations.id] }),
  registrations: many(registrations),
  eventVendors: many(eventVendors),
  checklistItems: many(checklistItems),
  budgetItems: many(budgetItems),
  ticketTypes: many(ticketTypes),
}));

export const registrationRelations = relations(registrations, ({ one }) => ({
  event: one(events, { fields: [registrations.eventId], references: [events.id] }),
  guest: one(guests, { fields: [registrations.guestId], references: [guests.id] }),
}));

export const eventVendorRelations = relations(eventVendors, ({ one }) => ({
  event: one(events, { fields: [eventVendors.eventId], references: [events.id] }),
  vendor: one(vendors, { fields: [eventVendors.vendorId], references: [vendors.id] }),
}));
