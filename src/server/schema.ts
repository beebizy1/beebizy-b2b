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
  check,
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
import { DEFAULT_FEEDBACK_CATEGORY, DEPOSIT_STATUSES, FEEDBACK_CATEGORIES, VOLUNTEER_STATUSES } from "../data/entities.ts";
import type { AuctionPageSettings, ImportedSpreadsheetField, RfpSpaceRequirement } from "../data/entities.ts";
import { SOLO_LIMITS } from "../data/plans.ts";
import { WORKSPACE_SUBSCRIPTION_STATUSES } from "../data/workspaceAccess.ts";
import type { RegistrationPageSettings } from "../data/registrationPage.ts";
import type { EventNavigationSettings } from "../data/eventNavigation.ts";
import type { RunOfShowEditorDraft } from "../data/runOfShowRecovery.ts";

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
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "refunding", "refunded", "failed"]);
export const subscriptionStatus = pgEnum("subscription_status", WORKSPACE_SUBSCRIPTION_STATUSES);
export const subscriptionPlan = pgEnum("subscription_plan", ["solo", "team", "enterprise"]);
export const feedbackCategory = pgEnum("feedback_category", FEEDBACK_CATEGORIES);
export const volunteerStatus = pgEnum("volunteer_status", VOLUNTEER_STATUSES);
export const depositStatus = pgEnum("deposit_status", DEPOSIT_STATUSES);
export const auctionDonorStatus = pgEnum("auction_donor_status", ["prospect", "contacted", "committed", "received", "declined"]);
export const auctionThankYouStatus = pgEnum("auction_thank_you_status", ["pending", "sent", "waived"]);
export const auctionReadinessStatus = pgEnum("auction_readiness_status", ["draft", "incomplete", "ready", "published"]);
export const auctionParticipantType = pgEnum("auction_participant_type", ["gala", "remote"]);
export const auctionFulfillmentStatus = pgEnum("auction_fulfillment_status", ["pending", "ready", "picked-up", "delivered"]);
export const invitationDeliveryStatus = pgEnum("invitation_delivery_status", ["pending", "sent", "opened", "registered", "failed"]);
export const fundraisingOrgType = pgEnum("fundraising_org_type", ["nonprofit_501c3", "government"]);
export const itemSubmissionStatus = pgEnum("item_submission_status", ["submitted", "needs_info", "approved", "rejected", "in_catalog", "sold", "delivered"]);
export const bidderBillStatus = pgEnum("bidder_bill_status", ["draft", "pending", "paid", "failed", "refunding", "refunded"]);
export const receiptType = pgEnum("receipt_type", ["contribution", "quid_pro_quo", "in_kind", "raffle"]);

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
  legalName: text("legal_name"),
  ein: text("ein"),
  fundraisingOrgType: fundraisingOrgType("fundraising_org_type"),
  receiptPrefix: text("receipt_prefix").notNull().default("BEE"),
  receiptSequence: integer("receipt_sequence").notNull().default(0),
  raffleEnabled: boolean("raffle_enabled").notNull().default(false),
  raffleRegistrationConfirmed: boolean("raffle_registration_confirmed").notNull().default(false),
  defaultCoverFees: boolean("default_cover_fees").notNull().default(false),
  subscriptionStatus: subscriptionStatus("subscription_status").notNull().default("beta"),
  /*
   * Pilot workspaces predate the published Solo limits and are not held to them.
   *
   * They were invited before Beebizy had plans at all, several of them run more events in
   * a year than Solo includes, and metering them retroactively would mean telling the
   * people who tested the product first to delete their work. New workspaces default to
   * false and are metered from the day they sign up.
   */
  eventQuotaExempt: boolean("event_quota_exempt").notNull().default(false),
  /** Product-granted exception for customers who do not use Beebizy payment collection. */
  stripeConnectExempt: boolean("stripe_connect_exempt").notNull().default(false),
  subscriptionPlan: subscriptionPlan("subscription_plan"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeCheckoutInterval: text("stripe_checkout_interval"),
  stripeCheckoutLockedAt: timestamp("stripe_checkout_locked_at", { withTimezone: true }),
  stripeLastEventCreated: bigint("stripe_last_event_created", { mode: "number" }),
  stripeTerminalSubscriptionId: text("stripe_terminal_subscription_id"),
  /** Stripe Connect account receiving ticket and auction proceeds for this workspace. */
  stripeConnectedAccountId: text("stripe_connected_account_id").unique(),
  stripeConnectedDetailsSubmitted: boolean("stripe_connected_details_submitted").notNull().default(false),
  stripeConnectedChargesEnabled: boolean("stripe_connected_charges_enabled").notNull().default(false),
  stripeConnectedPayoutsEnabled: boolean("stripe_connected_payouts_enabled").notNull().default(false),
  stripeConnectedAt: timestamp("stripe_connected_at", { withTimezone: true }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").notNull().default(false),
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
    /** Last verified primary email, persisted so notification retries do not depend on Clerk uptime. */
    email: text("email"),
    role: workspaceRole("role").notNull().default("member"),
    /**
     * Null grants the normal workspace-wide seat. A value limits this seat to one
     * event. The API validates that the event belongs to this workspace before the
     * invitation is created, and every event query re-checks the scope.
     */
    eventScopeId: text("event_scope_id"),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
    index("workspace_members_event_scope_idx").on(table.eventScopeId),
  ],
);

/**
 * Someone invited but not yet signed in.
 *
 * Access used to be an environment variable, so adding a colleague meant a redeploy and
 * they landed in a brand new empty workspace of their own. An invite is a row: it grants
 * entry, carries the role they should get, and names the workspace they join — which is
 * what makes a team share one set of events instead of three private copies.
 */
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Lower-cased on write, because an invite that only matches one casing is a bug. */
    email: text("email").notNull(),
    role: workspaceRole("role").notNull().default("member"),
    /** Carried into workspace_members when the recipient first signs in. */
    eventScopeId: text("event_scope_id"),
    invitedBy: text("invited_by").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: text("accepted_user_id"),
    createdAt: createdAt(),
  },
  (table) => [
    // One *pending* invite per address. Accepted invitations are audit history and must
    // not prevent the same person from later being added to another workspace or event.
    uniqueIndex("workspace_invites_email_idx")
      .on(table.email)
      .where(sql`${table.acceptedAt} is null`),
    index("workspace_invites_workspace_idx").on(table.workspaceId),
    index("workspace_invites_event_scope_idx").on(table.eventScopeId),
  ],
);

/** Durable transactional outbox for role notifications. Role writes and this row commit together. */
export const memberRoleNotifications = pgTable(
  "member_role_notifications",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    changeId: text("change_id").notNull(),
    recipientEmail: text("recipient_email"),
    memberName: text("member_name").notNull(),
    workspaceName: text("workspace_name").notNull(),
    newRole: workspaceRole("new_role").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    /** Fences stale workers after a processing lease is reclaimed. */
    leaseToken: text("lease_token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("member_role_notifications_due_idx").on(table.status, table.nextAttemptAt),
    index("member_role_notifications_workspace_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("member_role_notifications_change_idx").on(table.workspaceId, table.userId, table.changeId, table.newRole),
    check("member_role_notifications_status_check", sql`${table.status} in ('pending', 'processing', 'sent', 'superseded')`),
  ],
);

/** Failed outbid emails are retained here until a scheduled retry succeeds. */
export const auctionOutbidNotifications = pgTable(
  "auction_outbid_notifications",
  {
    id: id(),
    eventId: text("event_id").notNull(),
    bidId: text("bid_id").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    bidderName: text("bidder_name").notNull(),
    eventTitle: text("event_title").notNull(),
    itemTitle: text("item_title").notNull(),
    currentBidCents: bigint("current_bid_cents", { mode: "number" }).notNull(),
    auctionUrl: text("auction_url").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("auction_outbid_notifications_bid_email_idx").on(table.bidId, table.recipientEmail),
    index("auction_outbid_notifications_due_idx").on(table.status, table.nextAttemptAt),
    check("auction_outbid_notifications_status_check", sql`${table.status} in ('pending', 'sent')`),
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

export const productFeedback = pgTable(
  "product_feedback",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Clerk user id, so a person's feedback follows them across sessions. */
    userId: text("user_id").notNull(),
    category: feedbackCategory("category").notNull().default(DEFAULT_FEEDBACK_CATEGORY),
    message: text("message").notNull(),
    pagePath: text("page_path"),
    createdAt: createdAt(),
  },
  (table) => [
    index("product_feedback_user_idx").on(table.userId, table.createdAt),
    index("product_feedback_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

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
    /** Reversible customer presentation boundary. Existing events remain standard. */
    experience: text("experience").notNull().default("standard"),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Venue-local zone. Null rows predate per-event time zones and use the workspace fallback. */
    timeZone: text("time_zone"),
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
    registrationPage: jsonb("registration_page").$type<RegistrationPageSettings>(),
    navigation: jsonb("navigation").$type<EventNavigationSettings>().notNull().default({ hiddenTabIds: [] }),
    auctionPublicToken: text("auction_public_token").unique(),
    auctionPage: jsonb("auction_page").$type<AuctionPageSettings>(),
    /** Event-specific manual collection. Bidders can participate without storing a card. */
    auctionPayLater: boolean("auction_pay_later").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("events_workspace_starts_idx").on(table.workspaceId, table.startsAt),
    index("events_workspace_experience_idx").on(table.workspaceId, table.experience),
    index("events_workspace_status_idx").on(table.workspaceId, table.status),
    index("events_location_idx").on(table.locationId),
  ],
);

/**
 * A fixed set of calendar-year slots per Solo workspace. The unique primary key is the
 * concurrency guard: simultaneous event creates cannot exceed the published allowance.
 */
export const eventQuotaSlots = pgTable(
  "event_quota_slots",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    calendarYear: integer("calendar_year").notNull(),
    slot: integer("slot").notNull().default(1),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.calendarYear, table.slot] }),
    check(
      "event_quota_slots_slot_check",
      sql`${table.slot} between 1 and ${sql.raw(String(SOLO_LIMITS.eventsPerYear))}`,
    ),
    uniqueIndex("event_quota_slots_event_idx").on(table.eventId),
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
    /** Null for imported name-only lists. Public registration still requires email. */
    contact: text("contact"),
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

export const households = pgTable(
  "households",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    phone: text("phone"),
    creditName: text("credit_name"),
    stripeCustomerId: text("stripe_customer_id"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("households_workspace_email_idx").on(table.workspaceId, table.primaryEmail),
    index("households_workspace_idx").on(table.workspaceId),
  ],
);

export const householdGrades = pgTable(
  "household_grades",
  {
    id: id(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(),
    schoolYear: text("school_year").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("household_grades_unique_idx").on(table.householdId, table.grade, table.schoolYear),
    index("household_grades_workspace_idx").on(table.workspaceId, table.schoolYear),
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
    /** Free text: the customer's own guest-list category. Null means uncategorised. */
    segment: text("segment"),
    /** Free text: the fund, firm or school this person represents. */
    organization: text("organization"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkInStation: text("check_in_station"),
    checkInNotes: text("check_in_notes"),
    /** Original spreadsheet cells, retained so users can see the source columns after import. */
    importedFields: jsonb("imported_fields").$type<ImportedSpreadsheetField[]>().notNull().default([]),
    /** Set when the seat was bought rather than added by an organizer. */
    ticketTypeId: text("ticket_type_id"),
    /** Order provenance keeps refunds and exports exact without guessing by name. */
    ticketOrderId: text("ticket_order_id"),
    quantity: integer("quantity").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("registrations_event_idx").on(table.eventId),
    index("registrations_workspace_idx").on(table.workspaceId),
    index("registrations_ticket_order_idx").on(table.ticketOrderId),
    check("registrations_quantity_range", sql`${table.quantity} between 1 and 10000`),
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
    portalToken: text("portal_token").unique(),
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

/* ---------------------------------------------------------- requests for proposal */

export const rfps = pgTable(
  "rfps",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetType: text("target_type").notNull().default("vendor"),
    vendorCategory: text("vendor_category").notNull().default("Other"),
    description: text("description"),
    eventType: text("event_type"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    startTime: varchar("start_time", { length: 5 }),
    endTime: varchar("end_time", { length: 5 }),
    headcount: integer("headcount"),
    roomBlockRequired: boolean("room_block_required").notNull().default(false),
    roomsRequired: integer("rooms_required"),
    checkInDate: timestamp("check_in_date", { withTimezone: true }),
    checkOutDate: timestamp("check_out_date", { withTimezone: true }),
    spaceRequirements: jsonb("space_requirements").$type<RfpSpaceRequirement[]>().notNull().default([]),
    foodBeverageSpendCents: bigint("food_beverage_spend_cents", { mode: "number" }),
    ancillarySpendCents: bigint("ancillary_spend_cents", { mode: "number" }),
    ancillarySpendNotes: text("ancillary_spend_notes"),
    city: text("city"),
    location: text("location"),
    budgetMinCents: bigint("budget_min_cents", { mode: "number" }),
    budgetMaxCents: bigint("budget_max_cents", { mode: "number" }),
    deadline: timestamp("deadline", { withTimezone: true }),
    requirements: text("requirements"),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("rfps_event_idx").on(table.eventId, table.createdAt)],
);

export const rfpInvitations = pgTable(
  "rfp_invitations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    rfpId: text("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    publicToken: text("public_token").notNull().unique(),
    sentAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
  },
  (table) => [
    index("rfp_invitations_rfp_idx").on(table.rfpId, table.sentAt),
    uniqueIndex("rfp_invitations_rfp_vendor_idx").on(table.rfpId, table.vendorId),
  ],
);

export const rfpResponses = pgTable(
  "rfp_responses",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    rfpId: text("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    invitationId: text("invitation_id")
      .unique()
      .references(() => rfpInvitations.id, { onDelete: "set null" }),
    vendorName: text("vendor_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    quotedAmountCents: bigint("quoted_amount_cents", { mode: "number" }),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("rfp_responses_rfp_idx").on(table.rfpId, table.createdAt)],
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
    /** Where to notify the assignee. Null when the name belongs to nobody in the workspace. */
    assignedEmail: text("assigned_email"),
    /** Links the work directly to the vendor record without exposing vendor data publicly. */
    vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
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
    dayNumber: integer("day_number").notNull().default(1),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    durationMinutes: integer("duration_minutes"),
    title: text("title").notNull(),
    description: text("description"),
    responsible: text("responsible"),
    assignedEmail: text("assigned_email"),
    completed: boolean("completed").notNull().default(false),
  },
  (table) => [index("run_of_show_event_idx").on(table.eventId, table.dayNumber, table.startTime)],
);

/**
 * Cross-device autosave for work that has not become a Run of Show cue yet, or for an
 * in-progress edit. A client revision fences delayed requests so older keystrokes can
 * never replace newer work. Discarded rows are tombstones that stop an in-flight save
 * from resurrecting a draft after Add, Save, or Cancel.
 */
export const runOfShowDrafts = pgTable(
  "run_of_show_drafts",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    draftKey: text("draft_key").notNull(),
    draft: jsonb("draft").$type<RunOfShowEditorDraft>(),
    clientUpdatedAt: bigint("client_updated_at", { mode: "number" }).notNull(),
    discarded: boolean("discarded").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.eventId, table.userId, table.draftKey] }),
    index("run_of_show_drafts_user_event_idx").on(table.workspaceId, table.userId, table.eventId),
    check("run_of_show_drafts_key_length_check", sql`char_length(${table.draftKey}) between 1 and 160`),
  ],
);

export const checkInStations = pgTable(
  "check_in_stations",
  {
    ...eventChild,
    name: text("name").notNull(),
    lane: text("lane").notNull(),
    leadVolunteerId: text("lead_volunteer_id"),
    lead: text("lead"),
    deviceCount: integer("device_count").notNull().default(1),
    notes: text("notes"),
  },
  (table) => [index("check_in_stations_event_idx").on(table.eventId, table.sortOrder)],
);

export const volunteerNeeds = pgTable(
  "volunteer_needs",
  {
    ...eventChild,
    dayNumber: integer("day_number").notNull().default(1),
    role: text("role").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    requiredCount: integer("required_count").notNull().default(1),
    notes: text("notes"),
    signupOpen: boolean("signup_open").notNull().default(true),
  },
  (table) => [
    index("volunteer_needs_event_idx").on(table.eventId, table.dayNumber, table.startTime),
    check("volunteer_needs_required_count_check", sql`${table.requiredCount} between 1 and 500`),
  ],
);

export const volunteerShifts = pgTable(
  "volunteer_shifts",
  {
    ...eventChild,
    needId: text("need_id").references(() => volunteerNeeds.id, { onDelete: "set null" }),
    dayNumber: integer("day_number").notNull().default(1),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    status: volunteerStatus("status").notNull().default("scheduled"),
    /** Exact reversible predecessor for completion through a private assignment link. */
    statusBeforeCompletion: volunteerStatus("status_before_completion"),
    notes: text("notes"),
  },
  (table) => [
    index("volunteer_shifts_event_idx").on(table.eventId, table.dayNumber, table.startTime),
    index("volunteer_shifts_need_idx").on(table.needId),
  ],
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

export const deposits = pgTable(
  "deposits",
  {
    ...eventChild,
    paymentPlanId: text("payment_plan_id").references(() => vendorPaymentPlans.id, { onDelete: "set null" }),
    vendorName: text("vendor_name").notNull(),
    totalAmountCents: bigint("total_amount_cents", { mode: "number" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidDate: timestamp("paid_date", { withTimezone: true }),
    balanceDueDate: timestamp("balance_due_date", { withTimezone: true }),
    paidBy: text("paid_by"),
    paymentMethod: text("payment_method"),
    status: depositStatus("status").notNull().default("pending"),
    notes: text("notes"),
  },
  (table) => [
    index("deposits_event_due_idx").on(table.eventId, table.dueDate),
    index("deposits_payment_plan_idx").on(table.paymentPlanId),
    check("deposits_amount_nonnegative_check", sql`${table.amountCents} >= 0`),
    check("deposits_total_nonnegative_check", sql`${table.totalAmountCents} is null or ${table.totalAmountCents} >= 0`),
    check("deposits_amount_within_total_check", sql`${table.totalAmountCents} is null or ${table.amountCents} <= ${table.totalAmountCents}`),
  ],
);

export const vendorPaymentPlans = pgTable(
  "vendor_payment_plans",
  {
    ...eventChild,
    vendorName: text("vendor_name").notNull(),
    vendorKey: text("vendor_key").notNull(),
    totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull(),
    balanceDueDate: timestamp("balance_due_date", { withTimezone: true }).notNull(),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("vendor_payment_plans_event_vendor_idx").on(table.eventId, table.vendorKey),
    check("vendor_payment_plans_total_nonnegative_check", sql`${table.totalAmountCents} >= 0`),
  ],
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

/**
 * Rooms, plural. `event_id` was the primary key when an event could only have one plan;
 * it is an indexed foreign key now so indoor/outdoor and upstairs/downstairs can each be
 * drawn separately, which is how the events actually run.
 */
export const floorplans = pgTable(
  "floorplans",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Room layout"),
    /** Versioned room document. Legacy rows contain a bare array and are decoded compatibly. */
    items: jsonb("items").$type<unknown>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("floorplans_event_idx").on(table.eventId)],
);

/** Public capability links are isolated from audit history and scoped to one room. */
export const floorplanShareLinks = pgTable(
  "floorplan_share_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    floorplanId: text("floorplan_id")
      .notNull()
      .references(() => floorplans.id, { onDelete: "cascade" }),
    publicToken: text("public_token").notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("floorplan_share_links_floorplan_idx").on(table.floorplanId),
    index("floorplan_share_links_event_idx").on(table.workspaceId, table.eventId),
  ],
);

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
    fairMarketValueCents: bigint("fair_market_value_cents", { mode: "number" }),
    fmvZeroConfirmed: boolean("fmv_zero_confirmed").notNull().default(false),
    benefitsDescription: text("benefits_description"),
    /** 0 means unlimited. */
    quantityTotal: integer("quantity_total").notNull().default(0),
    /** Maintained by the checkout transaction, never by the client. */
    quantitySold: integer("quantity_sold").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    collectGuestNames: boolean("collect_guest_names").notNull().default(true),
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
    buyerPhone: text("buyer_phone"),
    gradeTags: text("grade_tags").array().notNull().default([]),
    quantity: integer("quantity").notNull().default(1),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    applicationFeeCents: bigint("application_fee_cents", { mode: "number" }).notNull().default(0),
    donationAddOnCents: bigint("donation_add_on_cents", { mode: "number" }).notNull().default(0),
    benefitsDeclined: boolean("benefits_declined").notNull().default(false),
    autoChargeOptIn: boolean("auto_charge_opt_in").notNull().default(false),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: paymentStatus("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeConnectedAccountId: text("stripe_connected_account_id"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    stripeRefundId: text("stripe_refund_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("ticket_orders_event_idx").on(table.eventId, table.status)],
);

export const ticketOrderGuests = pgTable(
  "ticket_order_guests",
  {
    id: id(),
    orderId: text("order_id").notNull().references(() => ticketOrders.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    createdAt: createdAt(),
  },
  (table) => [index("ticket_order_guests_order_idx").on(table.orderId)],
);

export const ticketInvitations = pgTable(
  "ticket_invitations",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    recipientName: text("recipient_name").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    publicToken: text("public_token").notNull().unique(),
    status: invitationDeliveryStatus("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("ticket_invitations_event_email_idx").on(table.eventId, table.recipientEmail),
    index("ticket_invitations_event_status_idx").on(table.eventId, table.status),
  ],
);

export const auctionDonors = pgTable(
  "auction_donors",
  {
    ...eventChild,
    businessName: text("business_name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    donorKind: text("donor_kind").notNull().default("family"),
    website: text("website"),
    logoUrl: text("logo_url"),
    gradeTags: text("grade_tags").array().notNull().default([]),
    publicToken: text("public_token").notNull().unique(),
    solicitedBy: text("solicited_by"),
    solicitationStatus: auctionDonorStatus("solicitation_status").notNull().default("prospect"),
    previousDonations: text("previous_donations"),
    notes: text("notes"),
    recognitionPreference: text("recognition_preference"),
    thankYouStatus: auctionThankYouStatus("thank_you_status").notNull().default("pending"),
  },
  (table) => [index("auction_donors_event_status_idx").on(table.eventId, table.solicitationStatus)],
);

export const auctionItems = pgTable(
  "auction_items",
  {
    ...eventChild,
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    photoUrls: text("photo_urls").array().notNull().default([]),
    estimatedValueCents: bigint("estimated_value_cents", { mode: "number" }),
    startingBidCents: bigint("starting_bid_cents", { mode: "number" }),
    currentBidCents: bigint("current_bid_cents", { mode: "number" }),
    fairMarketValueCents: bigint("fair_market_value_cents", { mode: "number" }),
    winnerName: text("winner_name"),
    donorName: text("donor_name"),
    donorId: text("donor_id").references(() => auctionDonors.id, { onDelete: "set null" }),
    itemSubmissionId: text("item_submission_id"),
    itemType: text("item_type").notNull().default("silent"),
    category: text("category"),
    restrictions: text("restrictions"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deliveryDetails: text("delivery_details"),
    deliveryMethod: text("delivery_method"),
    creditText: text("credit_text"),
    showFairMarketValue: boolean("show_fair_market_value").notNull().default(true),
    buyNowCents: bigint("buy_now_cents", { mode: "number" }),
    reserveCents: bigint("reserve_cents", { mode: "number" }),
    incrementRule: text("increment_rule").notNull().default("tiered"),
    closingWave: text("closing_wave"),
    notesToSchool: text("notes_to_school"),
    isServiceOrUse: boolean("is_service_or_use").notNull().default(false),
    overFiveThousandFlag: boolean("over_five_thousand_flag").notNull().default(false),
    bidIncrementCents: bigint("bid_increment_cents", { mode: "number" }),
    readinessStatus: auctionReadinessStatus("readiness_status").notNull().default("draft"),
    isPublished: boolean("is_published").notNull().default(false),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    extensionMinutes: integer("extension_minutes").notNull().default(0),
    quantityAvailable: integer("quantity_available").notNull().default(1),
    winningBidderId: text("winning_bidder_id"),
    fulfillmentStatus: auctionFulfillmentStatus("fulfillment_status").notNull().default("pending"),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    paymentMethod: text("payment_method"),
    paymentLink: text("payment_link"),
    paymentReceivedAt: timestamp("payment_received_at", { withTimezone: true }),
    status: auctionItemStatus("status").notNull().default("open"),
    auctionType: auctionKind("auction_type").notNull().default("silent"),
    lotNumber: integer("lot_number"),
  },
  (table) => [index("auction_event_idx").on(table.eventId, table.lotNumber)],
);

export const auctionBidders = pgTable(
  "auction_bidders",
  {
    ...eventChild,
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    householdId: text("household_id").references(() => households.id, { onDelete: "set null" }),
    attendeeId: text("attendee_id").references(() => guests.id, { onDelete: "set null" }),
    paddleNumber: integer("paddle_number"),
    paymentMethodId: text("payment_method_id"),
    stripeCustomerId: text("stripe_customer_id"),
    autoChargeOptIn: boolean("auto_charge_opt_in").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    participantType: auctionParticipantType("participant_type").notNull().default("gala"),
    publicToken: text("public_token").notNull().unique(),
    status: text("status").notNull().default("active"),
  },
  (table) => [
    uniqueIndex("auction_bidders_event_email_idx").on(table.eventId, table.email),
    index("auction_bidders_event_status_idx").on(table.eventId, table.status),
  ],
);

export const auctionBids = pgTable(
  "auction_bids",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => auctionItems.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    maximumAmountCents: bigint("maximum_amount_cents", { mode: "number" }).notNull(),
    isAutomatic: boolean("is_automatic").notNull().default(false),
    channel: text("channel").notNull().default("remote"),
    createdAt: createdAt(),
  },
  (table) => [
    index("auction_bids_item_created_idx").on(table.itemId, table.createdAt),
    index("auction_bids_bidder_created_idx").on(table.bidderId, table.createdAt),
  ],
);

export const auctionOrders = pgTable(
  "auction_orders",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => auctionItems.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    applicationFeeCents: bigint("application_fee_cents", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: paymentStatus("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeConnectedAccountId: text("stripe_connected_account_id"),
    stripeRefundId: text("stripe_refund_id"),
    certificateToken: text("certificate_token").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("auction_orders_item_bidder_idx").on(table.itemId, table.bidderId)],
);

export const auctionCategories = pgTable(
  "auction_categories",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("auction_categories_workspace_name_idx").on(table.workspaceId, table.name)],
);

export const itemSubmissions = pgTable(
  "item_submissions",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    donorId: text("donor_id").references(() => auctionDonors.id, { onDelete: "set null" }),
    submittedBy: text("submitted_by").notNull(),
    publicToken: text("public_token").notNull().unique(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: itemSubmissionStatus("status").notNull().default("submitted"),
    auctionItemId: text("auction_item_id").references(() => auctionItems.id, { onDelete: "set null" }),
    requestedChanges: text("requested_changes"),
    submittedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("item_submissions_event_status_idx").on(table.eventId, table.status)],
);

export const auctionWatches = pgTable(
  "auction_watches",
  {
    itemId: text("item_id").notNull().references(() => auctionItems.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.bidderId] })],
);

export const auctionItemWinners = pgTable(
  "auction_item_winners",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => auctionItems.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    awardedAt: createdAt(),
    awardedBy: text("awarded_by").notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("auction_item_winners_item_bidder_idx").on(table.itemId, table.bidderId)],
);

export const fundraisingPledges = pgTable(
  "fundraising_pledges",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").references(() => auctionBidders.id, { onDelete: "set null" }),
    householdId: text("household_id").references(() => households.id, { onDelete: "set null" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    appeal: text("appeal").notNull().default("fund-a-need"),
    designation: text("designation"),
    channel: text("channel").notNull().default("remote"),
    anonymous: boolean("anonymous").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index("fundraising_pledges_event_idx").on(table.eventId, table.createdAt)],
);

export const bidderBills = pgTable(
  "bidder_bills",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    publicToken: text("public_token").notNull().unique(),
    itemsTotalCents: bigint("items_total_cents", { mode: "number" }).notNull().default(0),
    pledgesTotalCents: bigint("pledges_total_cents", { mode: "number" }).notNull().default(0),
    feesCoveredCents: bigint("fees_covered_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    applicationFeeCents: bigint("application_fee_cents", { mode: "number" }).notNull().default(0),
    status: bidderBillStatus("status").notNull().default("draft"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeConnectedAccountId: text("stripe_connected_account_id"),
    paymentMethod: text("payment_method"),
    payoutAvailableAt: timestamp("payout_available_at", { withTimezone: true }),
    receiptId: text("receipt_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    stripeRefundId: text("stripe_refund_id"),
    reminder24SentAt: timestamp("reminder_24_sent_at", { withTimezone: true }),
    reminder72SentAt: timestamp("reminder_72_sent_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    checkoutGeneration: integer("checkout_generation").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("bidder_bills_event_bidder_idx").on(table.eventId, table.bidderId)],
);

export const fundraisingReceipts = pgTable(
  "fundraising_receipts",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    householdId: text("household_id").references(() => households.id, { onDelete: "set null" }),
    type: receiptType("type").notNull(),
    receiptNumber: text("receipt_number").notNull(),
    publicToken: text("public_token").notNull().unique(),
    payerName: text("payer_name").notNull(),
    payerEmail: text("payer_email"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    fairMarketValueCents: bigint("fair_market_value_cents", { mode: "number" }).notNull().default(0),
    deductibleCents: bigint("deductible_cents", { mode: "number" }).notNull().default(0),
    lineItems: jsonb("line_items").$type<Array<Record<string, unknown>>>().notNull().default([]),
    supersedesReceiptId: text("supersedes_receipt_id"),
    issuedAt: createdAt(),
    pdfUrl: text("pdf_url"),
  },
  (table) => [
    uniqueIndex("fundraising_receipts_number_idx").on(table.workspaceId, table.receiptNumber),
    index("fundraising_receipts_household_idx").on(table.householdId, table.issuedAt),
  ],
);

export const yearEndStatementDeliveries = pgTable(
  "year_end_statement_deliveries",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    householdId: text("household_id").references(() => households.id, { onDelete: "cascade" }),
    payerEmail: text("payer_email").notNull(),
    payerName: text("payer_name").notNull(),
    taxYear: integer("tax_year").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    deductibleCents: bigint("deductible_cents", { mode: "number" }).notNull().default(0),
    receiptCount: integer("receipt_count").notNull().default(0),
    status: invitationDeliveryStatus("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("year_end_statement_household_year_idx").on(table.workspaceId, table.householdId, table.taxYear).where(sql`${table.householdId} is not null`),
    uniqueIndex("year_end_statement_email_year_idx").on(table.workspaceId, table.payerEmail, table.taxYear).where(sql`${table.householdId} is null`),
  ],
);

export const inKindAcknowledgments = pgTable(
  "in_kind_acknowledgments",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    itemSubmissionId: text("item_submission_id").references(() => itemSubmissions.id, { onDelete: "set null" }),
    donorId: text("donor_id").references(() => auctionDonors.id, { onDelete: "set null" }),
    donorName: text("donor_name").notNull(),
    donorEmail: text("donor_email"),
    description: text("description").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("in_kind_acknowledgments_event_idx").on(table.eventId, table.createdAt)],
);

export const fundraisingBroadcasts = pgTable(
  "fundraising_broadcasts",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    sentBy: text("sent_by").notNull(),
    audienceFilter: jsonb("audience_filter").$type<Record<string, unknown>>().notNull().default({}),
    itemIds: text("item_ids").array().notNull().default([]),
    channels: text("channels").array().notNull().default([]),
    message: text("message").notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentAt: createdAt(),
  },
  (table) => [index("fundraising_broadcasts_event_idx").on(table.eventId, table.sentAt)],
);

export const fundraisingBroadcastRecipients = pgTable(
  "fundraising_broadcast_recipients",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    broadcastId: text("broadcast_id").notNull().references(() => fundraisingBroadcasts.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id").notNull().references(() => auctionBidders.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    sentAt: createdAt(),
  },
  (table) => [index("fundraising_broadcast_recipient_cooldown_idx").on(table.eventId, table.bidderId, table.sentAt)],
);

export const auctionCloseChanges = pgTable(
  "auction_close_changes",
  {
    id: id(),
    itemId: text("item_id").notNull().references(() => auctionItems.id, { onDelete: "cascade" }),
    previousClosesAt: timestamp("previous_closes_at", { withTimezone: true }),
    newClosesAt: timestamp("new_closes_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    changedBy: text("changed_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("auction_close_changes_item_idx").on(table.itemId, table.createdAt)],
);

export const bidderOtpChallenges = pgTable(
  "bidder_otp_challenges",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("bidder_otp_event_phone_idx").on(table.eventId, table.phone, table.createdAt)],
);

export const donationCampaigns = pgTable(
  "donation_campaigns",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    publicToken: text("public_token").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    goalCents: bigint("goal_cents", { mode: "number" }),
    suggestedAmountsCents: bigint("suggested_amounts_cents", { mode: "number" }).array().notNull().default([]),
    designations: text("designations").array().notNull().default([]),
    defaultDesignation: text("default_designation"),
    monthlyEnabled: boolean("monthly_enabled").notNull().default(true),
    coverFeesEnabled: boolean("cover_fees_enabled").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("donation_campaigns_workspace_idx").on(table.workspaceId, table.createdAt)],
);

export const donations = pgTable(
  "donations",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull().references(() => donationCampaigns.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    householdId: text("household_id").references(() => households.id, { onDelete: "set null" }),
    donorName: text("donor_name").notNull(),
    donorEmail: text("donor_email").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    frequency: text("frequency").notNull().default("one-time"),
    designation: text("designation"),
    tributeType: text("tribute_type"),
    tributeName: text("tribute_name"),
    tributeNotifyEmail: text("tribute_notify_email"),
    anonymous: boolean("anonymous").notNull().default(false),
    employer: text("employer"),
    gradeTags: text("grade_tags").array().notNull().default([]),
    feesCoveredCents: bigint("fees_covered_cents", { mode: "number" }).notNull().default(0),
    status: paymentStatus("status").notNull().default("pending"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionEndedAt: timestamp("subscription_ended_at", { withTimezone: true }),
    receiptId: text("receipt_id").references(() => fundraisingReceipts.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("donations_campaign_idx").on(table.campaignId, table.createdAt)],
);

export const raffleItems = pgTable(
  "raffle_items",
  {
    ...eventChild,
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    ticketPriceCents: bigint("ticket_price_cents", { mode: "number" }).notNull().default(0),
    fairMarketValueCents: bigint("fair_market_value_cents", { mode: "number" }),
    totalTickets: integer("total_tickets").notNull().default(0),
    soldTickets: integer("sold_tickets").notNull().default(0),
    winnerName: text("winner_name"),
    winnerEmail: text("winner_email"),
    winnerTicketId: text("winner_ticket_id"),
    drawnAt: timestamp("drawn_at", { withTimezone: true }),
    w2gReviewRequired: boolean("w2g_review_required").notNull().default(false),
    taxpayerIdCollectionStatus: text("taxpayer_id_collection_status").notNull().default("not_required"),
    taxpayerIdCollectedAt: timestamp("taxpayer_id_collected_at", { withTimezone: true }),
    taxpayerIdCollectedBy: text("taxpayer_id_collected_by"),
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
  checkInStations: many(checkInStations),
  volunteerNeeds: many(volunteerNeeds),
  volunteerShifts: many(volunteerShifts),
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
