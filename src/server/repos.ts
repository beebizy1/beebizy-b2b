/**
 * Server-side data access.
 *
 * Every customer-facing function takes a `RequestContext` and filters by its
 * `workspaceId`. The one cross-workspace query is the pilot-feedback inbox, which checks
 * the caller against the three-person Beebizy operator list before reading anything.
 *
 * Three things the relational model does that the document model could not, and which
 * this file exists to use:
 *   - joins, so `locationRecord` and `vendor` are read rather than denormalized and
 *     kept in sync by hand;
 *   - `SUM`/`COUNT` in the database, so portfolio analytics is one round trip instead of
 *     one query per event;
 *   - transactions and unique constraints, so overselling a ticket allocation is
 *     prevented by the database rather than by a check that a concurrent request can
 *     race past.
 */

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { workspaceFitsPlanSeatLimit } from "./entitlements.ts";
import * as s from "./schema.ts";
import {
  HttpError,
  lookupUsers,
  newId,
  requireBeebizyOperator,
  requireEventAccess,
  requireRole,
  requireWorkspaceAccess,
  revokeInvitationEmail,
  sendInvitationEmail,
  type RequestContext,
} from "./auth.ts";
import * as map from "./mappers.ts";
import { parseDate, parseOptionalDate } from "./mappers.ts";
import type {
  Canvas,
  CanvasCard,
  CustomReportRow,
  Event,
  AssignmentSummaryResult,
  EventHealth,
  EventHistoryChange,
  EventHistoryEntry,
  FeedbackInboxItem,
  Floorplan,
  FloorplanDraft,
  Location,
  OpenTask,
  PortfolioSummary,
  ProductFeedback,
  ProductFeedbackDraft,
  Registration,
  RegistrationWithGuest,
  TemplateContents,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
  HistoryResource,
  CheckInStation,
  InviteResult,
  VolunteerShift,
  WalkInRegistrationDraft,
  WorkspaceMember,
  TeamUpdate,
  PublicAssignmentPayload,
  PublicRegistrationDraft,
  PublicVolunteerSignupDraft,
  PublicRfpPayload,
  PublicVendorConversation,
  Rfp,
  RfpWithResponses,
} from "../data/entities.ts";

import { REGISTRATION_STATUSES, RFP_EVENT_TYPES, RFP_RESPONSE_STATUSES, RFP_STATUSES, RFP_TARGET_TYPES, TEAM_UPDATE_KINDS, VOLUNTEER_STATUSES, WORKSPACE_ROLES } from "../data/entities.ts";
import { effectivePlan, PLAN_NAMES, PLAN_SEAT_LIMITS, SOLO_LIMITS } from "../data/plans.ts";
import { workspaceInviteInsertSelection } from "./workspaceMemberInsert.ts";
import { feedbackDraftSchema, feedbackValidationMessage } from "../data/feedback.ts";
import { buildAttention, computeEventHealth, computePortfolio } from "../data/derive.ts";
import { describeHistoryChange } from "../data/history.ts";
import { daysBetweenInZone } from "../lib/datetime.ts";
import { readStoredFloorplan, writeStoredFloorplan } from "../data/floorplan.ts";
import { teamUpdateFromHistory, teamUpdateKind } from "../data/teamUpdates.ts";
import { volunteerCompletionTransition, type AssignmentCompletionAction } from "../data/assignmentCompletion.ts";
import { timeAfterMinutes } from "../data/assignmentCalendar.ts";
import { rfpDraftSchema, rfpSpaceRequirementSchema, validHotelRfp, validRfpBudget } from "../data/rfp.ts";
import {
  notifyAssignmentSummary,
  notifyFeedbackSubmission,
  notifyRfpInvitation,
  notifyTeamUpdate,
  notifyVendorMessage,
  notifyVolunteerAssignment,
} from "./notify.ts";
import { PRIVATE_BETA_ORIGIN } from "../lib/privateBetaHost.ts";
import { invitationAcceptanceUrl } from "../lib/invitation.ts";
import { volunteerCoverage } from "../data/santaClara.ts";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage } from "../data/registrationPage.ts";
import { assignmentDeliveryEmail, assignmentSummaryCounts } from "../data/assignmentSummary.ts";

/**
 * Where a notification should send someone. Configurable because the private-beta origin
 * is a stopgap: an email is the one place a stale URL is permanent, since it outlives the
 * deployment that sent it.
 */
function appOrigin(): string {
  return process.env.APP_ORIGIN ?? PRIVATE_BETA_ORIGIN;
}
import { selectSimilarPastEvents, type PastEventPlanningRecord } from "../data/planner.ts";

type Body = Record<string, unknown>;

const runOfShowOrderColumns = () => [
  asc(s.runOfShowItems.dayNumber),
  asc(s.runOfShowItems.startTime),
  asc(s.runOfShowItems.sortOrder),
] as const;

function isQuotaConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return ["23505", "23514"].includes(String(candidate.code)) || String(candidate.message ?? "").includes("event_quota_slots");
}

/**
 * Pilot workspaces are not metered against the Solo event limit.
 *
 * They joined before Beebizy published plans and several hold more events in a year than
 * Solo includes, so the limit is applied from the day a workspace signs up rather than
 * backwards over work that already exists.
 */
async function isEventQuotaExempt(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ exempt: s.workspaces.eventQuotaExempt })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId))
    .limit(1);
  return Boolean(row?.exempt);
}

function nextEventQuotaSlot(workspaceId: string, calendarYear: number) {
  return sql<number>`coalesce((
    select min(slots.candidate)
    from generate_series(1, ${SOLO_LIMITS.eventsPerYear}) as slots(candidate)
    where not exists (
      select 1
      from ${s.eventQuotaSlots} as existing
      where existing.workspace_id = ${workspaceId}
        and existing.calendar_year = ${calendarYear}
        and existing.slot = slots.candidate
    )
  ), 1)::integer`;
}

const str = (body: Body, key: string, fallback?: string): string => {
  const value = body[key];
  if (typeof value === "string" && value.trim() !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new HttpError(400, `${key} is required.`);
};
const optStr = (body: Body, key: string): string | null => {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${key} must be a string.`);
  return value;
};
const optInt = (body: Body, key: string): number | null => {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new HttpError(400, `${key} must be a number.`);
  return Math.trunc(parsed);
};
const positiveInt = (body: Body, key: string, fallback = 1): number => {
  const value = optInt(body, key) ?? fallback;
  if (value < 1) throw new HttpError(400, `${key} must be at least 1.`);
  return value;
};
const optBool = (body: Body, key: string): boolean | undefined =>
  body[key] === undefined ? undefined : Boolean(body[key]);
const optLocalTime = (body: Body, key: string): string | null => {
  const value = optStr(body, key);
  if (value !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${key} must use HH:mm.`);
  }
  return value;
};
const rfpSpaces = (body: Body) => {
  const parsed = rfpSpaceRequirementSchema.array().max(50).safeParse(body.spaceRequirements ?? []);
  if (!parsed.success) throw new HttpError(400, "Check every function space date, time, capacity and description.");
  return parsed.data;
};

/** Only assigns keys the client actually sent, so a patch never blanks a field. */
function patchFrom<T extends object>(body: Body, spec: Record<string, (body: Body) => unknown>): T {
  const patch: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(spec)) {
    if (key in body) patch[key] = read(body);
  }
  return patch as T;
}

function historyValues(
  ctx: RequestContext,
  input: EventHistoryChange,
) {
  return {
    id: newId("hist"),
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    summary: describeHistoryChange(input),
    ...input,
  };
}

/**
 * Whether a failed write was rejected by this named database constraint.
 *
 * The name is not in the error's message. Drizzle reports "Failed query: insert into
 * ..." and hangs the driver's error off `cause`, where Postgres puts the SQLSTATE and the
 * constraint. Matching on the message alone therefore never matched, and a duplicate
 * email came back to the user as a 500 with the raw SQL in it.
 */
function isConstraintViolation(error: unknown, constraint: string): boolean {
  for (let current: unknown = error, depth = 0; current != null && depth < 5; depth += 1) {
    const candidate = current as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (candidate.constraint === constraint) return true;
    if (typeof candidate.message === "string" && candidate.message.includes(constraint)) return true;
    current = candidate.cause;
  }
  return false;
}

async function requireOwnedEvent(ctx: RequestContext, eventId: string): Promise<void> {
  requireEventAccess(ctx, eventId);
  const [row] = await db
    .select({ id: s.events.id })
    .from(s.events)
    .where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw new HttpError(404, "That event no longer exists.");
}

/* --------------------------------------------------------------- events */

/** Registration counts for a set of events, in one grouped query. */
async function registrationCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: s.registrations.eventId, total: count() })
    .from(s.registrations)
    .where(and(inArray(s.registrations.eventId, eventIds), sql`${s.registrations.status} <> 'cancelled'`))
    .groupBy(s.registrations.eventId);
  return new Map(rows.map((row) => [row.eventId, Number(row.total)]));
}

export const events = {
  async list(ctx: RequestContext, filter: { status?: string; category?: string; locationId?: string; search?: string } = {}): Promise<Event[]> {
    const conditions = [eq(s.events.workspaceId, ctx.workspaceId)];
    if (ctx.eventScopeId) conditions.push(eq(s.events.id, ctx.eventScopeId));
    if (filter.status) conditions.push(eq(s.events.status, filter.status as "draft"));
    if (filter.category) conditions.push(eq(s.events.category, filter.category));
    if (filter.locationId) conditions.push(eq(s.events.locationId, filter.locationId));
    if (filter.search) {
      const needle = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          sql`${s.events.title} ILIKE ${needle}`,
          sql`${s.events.category} ILIKE ${needle}`,
          sql`coalesce(${s.events.venue}, '') ILIKE ${needle}`,
          sql`coalesce(${s.locations.name}, '') ILIKE ${needle}`,
        )!,
      );
    }

    // The join is the point: no denormalized venue snapshot to keep in step.
    const rows = await db
      .select({ event: s.events, location: s.locations })
      .from(s.events)
      .leftJoin(s.locations, eq(s.events.locationId, s.locations.id))
      .where(and(...conditions))
      .orderBy(desc(s.events.startsAt));

    const counts = await registrationCounts(rows.map((row) => row.event.id));
    return rows.map((row) =>
      map.toEvent(row.event, { location: row.location, registrationCount: counts.get(row.event.id) ?? 0 }),
    );
  },

  async get(ctx: RequestContext, id: string): Promise<Event | null> {
    requireEventAccess(ctx, id);
    const [row] = await db
      .select({ event: s.events, location: s.locations })
      .from(s.events)
      .leftJoin(s.locations, eq(s.events.locationId, s.locations.id))
      .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!row) return null;
    const counts = await registrationCounts([id]);
    return map.toEvent(row.event, { location: row.location, registrationCount: counts.get(id) ?? 0 });
  },

  async create(ctx: RequestContext, body: Body): Promise<Event> {
    requireWorkspaceAccess(ctx);
    const id = newId("evt");
    const createdAt = new Date();
    const values = {
      id,
      workspaceId: ctx.workspaceId,
      title: str(body, "title"),
      description: optStr(body, "description"),
      startsAt: parseDate(body.date, "date"),
      endsAt: parseOptionalDate(body.endDate, "endDate"),
      venue: optStr(body, "location"),
      locationId: optStr(body, "locationId"),
      capacity: optInt(body, "capacity"),
      status: (optStr(body, "status") ?? "draft") as "draft",
      category: str(body, "category", "Other"),
      imageUrl: optStr(body, "imageUrl"),
      registrationPage: normalizeRegistrationPage(body.registrationPage ?? DEFAULT_REGISTRATION_PAGE),
      createdAt,
    };
    const location = values.locationId ? await locations.get(ctx, values.locationId) : null;
    if (values.locationId && !location) throw new HttpError(400, "That venue is not available in this workspace.");

    /*
     * Solo is sold as a fixed number of events a year, so the number is counted here
     * rather than left to the pricing page to assert.
     *
     * Events count towards the year they happen in, not the year they were created:
     * a planner booking next spring should not be turned away because this spring is
     * already full. Beta workspaces resolve to the enterprise plan and are untouched.
     */
    if (effectivePlan(ctx.access) === "solo" && !(await isEventQuotaExempt(ctx.workspaceId))) {
      const year = values.startsAt.getUTCFullYear();
      const [used] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(s.events)
        .where(
          and(
            eq(s.events.workspaceId, ctx.workspaceId),
            sql`extract(year from ${s.events.startsAt}) = ${year}`,
          ),
        );
      if ((used?.count ?? 0) >= SOLO_LIMITS.eventsPerYear) {
        throw new HttpError(
          403,
          `The Solo plan includes ${SOLO_LIMITS.eventsPerYear} events a year, and ${year} is full. Upgrade to Team for unlimited events.`,
        );
      }
    }
    const after: Event = {
      id,
      ownerId: ctx.workspaceId,
      title: values.title,
      description: values.description,
      date: values.startsAt.toISOString(),
      endDate: values.endsAt?.toISOString() ?? null,
      location: values.venue ?? (location ? [location.name, location.city].filter(Boolean).join(", ") : null),
      locationId: values.locationId,
      locationRecord: location,
      capacity: values.capacity,
      status: values.status as Event["status"],
      category: values.category,
      imageUrl: values.imageUrl,
      registrationCount: 0,
      shareToken: null,
      registrationPage: values.registrationPage ?? { ...DEFAULT_REGISTRATION_PAGE },
      createdAt: createdAt.toISOString(),
    };
    const eventInsert = db.insert(s.events).values(values);
    const historyInsert = db.insert(s.eventHistory).values(
      historyValues(ctx, {
        eventId: id,
        resource: "event",
        resourceId: id,
        action: "created",
        before: null,
        after: after as unknown as Record<string, unknown>,
      }),
    );
    const entitlementLock = db.select({
      locked: sql<number>`pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`,
    }).from(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId)).limit(1);
    const quotaInsert = db.insert(s.eventQuotaSlots).select(
      db
        .select({
          workspaceId: s.workspaces.id,
          calendarYear: sql<number>`${values.startsAt.getUTCFullYear()}::integer`.as("calendar_year"),
          slot: nextEventQuotaSlot(ctx.workspaceId, values.startsAt.getUTCFullYear()).as("slot"),
          eventId: sql<string>`${id}::text`.as("event_id"),
        })
        .from(s.workspaces)
        .where(
          and(
            eq(s.workspaces.id, ctx.workspaceId),
            eq(s.workspaces.eventQuotaExempt, false),
            or(
              and(
                eq(s.workspaces.subscriptionStatus, "active"),
                eq(s.workspaces.subscriptionPlan, "solo"),
              ),
              isNotNull(s.workspaces.stripeCheckoutSessionId),
            ),
          ),
        ),
    );
    try {
      await db.batch([entitlementLock, eventInsert, quotaInsert, historyInsert]);
    } catch (error) {
      if (isQuotaConflict(error)) {
        throw new HttpError(
          403,
          `The Solo plan includes ${SOLO_LIMITS.eventsPerYear} events in ${values.startsAt.getUTCFullYear()}. Upgrade to create another.`,
        );
      }
      throw error;
    }
    const created = await events.get(ctx, id);
    if (!created) throw new HttpError(500, "Event was created but could not be read back.");
    return created;
  },

  async update(ctx: RequestContext, id: string, body: Body): Promise<Event> {
    const before = await events.get(ctx, id);
    if (!before) throw new HttpError(404, "That event no longer exists.");
    const patch = patchFrom<Record<string, unknown>>(body, {
      title: (b) => str(b, "title"),
      description: (b) => optStr(b, "description"),
      capacity: (b) => optInt(b, "capacity"),
      status: (b) => optStr(b, "status") ?? "draft",
      category: (b) => str(b, "category", "Other"),
      imageUrl: (b) => optStr(b, "imageUrl"),
      registrationPage: (b) => normalizeRegistrationPage(b.registrationPage),
      locationId: (b) => optStr(b, "locationId"),
    });
    if ("date" in body) patch.startsAt = parseDate(body.date, "date");
    if ("endDate" in body) patch.endsAt = parseOptionalDate(body.endDate, "endDate");
    if ("location" in body) patch.venue = optStr(body, "location");

    const after: Event = { ...before };
    if ("title" in body) after.title = patch.title as string;
    if ("description" in body) after.description = patch.description as string | null;
    if ("capacity" in body) after.capacity = patch.capacity as number | null;
    if ("status" in body) after.status = patch.status as Event["status"];
    if ("category" in body) after.category = patch.category as string;
    if ("imageUrl" in body) after.imageUrl = patch.imageUrl as string | null;
    if ("registrationPage" in body) after.registrationPage = normalizeRegistrationPage(patch.registrationPage);
    if ("date" in body) after.date = (patch.startsAt as Date).toISOString();
    if ("endDate" in body) after.endDate = (patch.endsAt as Date | null)?.toISOString() ?? null;
    if ("location" in body) after.location = patch.venue as string | null;
    if ("locationId" in body) {
      const locationId = patch.locationId as string | null;
      const location = locationId ? await locations.get(ctx, locationId) : null;
      if (locationId && !location) throw new HttpError(400, "That venue is not available in this workspace.");
      after.locationId = locationId;
      after.locationRecord = location;
      if (location && after.location === null) after.location = [location.name, location.city].filter(Boolean).join(", ");
    }

    const updatedAt = new Date();
    after.updatedAt = updatedAt.toISOString();
    const eventUpdate = db
      .update(s.events)
      .set({ ...patch, updatedAt })
      .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
      .returning({ id: s.events.id });
    const historyInsert = db.insert(s.eventHistory).values(
      historyValues(ctx, {
        eventId: id,
        resource: "event",
        resourceId: id,
        action: "updated",
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      }),
    );
    const entitlementLock = db.select({
      locked: sql<number>`pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`,
    }).from(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId)).limit(1);
    const quotaInsert = db.insert(s.eventQuotaSlots).select(
      db
        .select({
          workspaceId: s.workspaces.id,
          calendarYear: sql<number>`${new Date(after.date).getUTCFullYear()}::integer`.as("calendar_year"),
          slot: nextEventQuotaSlot(ctx.workspaceId, new Date(after.date).getUTCFullYear()).as("slot"),
          eventId: sql<string>`${id}::text`.as("event_id"),
        })
        .from(s.workspaces)
        .where(
          and(
            eq(s.workspaces.id, ctx.workspaceId),
            eq(s.workspaces.eventQuotaExempt, false),
            or(
              and(
                eq(s.workspaces.subscriptionStatus, "active"),
                eq(s.workspaces.subscriptionPlan, "solo"),
              ),
              isNotNull(s.workspaces.stripeCheckoutSessionId),
            ),
          ),
        ),
    );
    let updated: { id: string }[];
    try {
      [, updated] = await db.batch([
        entitlementLock,
        eventUpdate,
        db.delete(s.eventQuotaSlots).where(eq(s.eventQuotaSlots.eventId, id)),
        quotaInsert,
        historyInsert,
      ]);
    } catch (error) {
      if (isQuotaConflict(error)) {
        throw new HttpError(
          403,
          `The Solo plan already has ${SOLO_LIMITS.eventsPerYear} events in ${new Date(after.date).getUTCFullYear()}.`,
        );
      }
      throw error;
    }
    if (updated.length === 0) throw new HttpError(404, "That event no longer exists.");

    const result = await events.get(ctx, id);
    if (!result) throw new HttpError(404, "That event no longer exists.");
    return result;
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireWorkspaceAccess(ctx);
    requireRole(ctx, ["owner", "admin"]);
    const before = await events.get(ctx, id);
    if (!before) throw new HttpError(404, "That event no longer exists.");
    // No manual cascade: the foreign keys do it, which is eleven hand-written subcollection
    // deletes the document model needed and this does not.
    const [deleted] = await db.batch([
      db
        .delete(s.events)
        .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
        .returning({ id: s.events.id }),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId: id,
          resource: "event",
          resourceId: id,
          action: "deleted",
          before: before as unknown as Record<string, unknown>,
          after: null,
        }),
      ),
    ]);
    if (deleted.length === 0) throw new HttpError(404, "That event no longer exists.");
  },

  async share(ctx: RequestContext, id: string): Promise<{ shareToken: string }> {
    const [existing] = await db
      .select({ shareToken: s.events.shareToken })
      .from(s.events)
      .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!existing) throw new HttpError(404, "That event no longer exists.");
    if (existing.shareToken) return { shareToken: existing.shareToken };

    // Unguessable, unlike the sequential ids: the token is the only credential a guest has.
    const shareToken = crypto.randomUUID().replaceAll("-", "");
    await db.update(s.events).set({ shareToken, updatedAt: new Date() }).where(eq(s.events.id, id));
    return { shareToken };
  },

  async createFromTemplate(ctx: RequestContext, templateId: string, body: Body): Promise<Event> {
    requireWorkspaceAccess(ctx);
    const [template] = await db
      .select()
      .from(s.templates)
      .where(and(eq(s.templates.id, templateId), eq(s.templates.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!template) throw new HttpError(404, "That template no longer exists.");

    const created = await events.create(ctx, body);
    const contents = map.toTemplateContents(template);
    const base = { workspaceId: ctx.workspaceId, eventId: created.id };

    if (contents.checklistItems.length > 0) {
      await db.insert(s.checklistItems).values(
        contents.checklistItems.map((item, index) => ({
          ...base,
          id: newId("cl"),
          title: item.title,
          description: item.description ?? null,
          category: item.category ?? "General",
          completed: false,
          sortOrder: index + 1,
        })),
      );
    }
    if (contents.runOfShowItems.length > 0) {
      const rows = contents.runOfShowItems.map((item, index) => ({
          ...base,
          id: newId("ros"),
          dayNumber: item.dayNumber ?? 1,
          startTime: item.startTime,
          durationMinutes: item.duration ?? null,
          title: item.title,
          description: item.description ?? null,
          responsible: item.responsible ?? null,
          sortOrder: index + 1,
        }));
      await db.batch([
        db.insert(s.runOfShowItems).values(rows),
        db.insert(s.eventHistory).values(
          rows.map((row) =>
            historyValues(ctx, {
              eventId: created.id,
              resource: "run-of-show",
              resourceId: row.id,
              action: "created",
              before: null,
              after: {
                id: row.id,
                eventId: created.id,
                dayNumber: row.dayNumber,
                startTime: row.startTime,
                duration: row.durationMinutes,
                title: row.title,
                description: row.description,
                responsible: row.responsible,
                sortOrder: row.sortOrder,
                sourceTemplateId: templateId,
              },
            }),
          ),
        ),
      ]);
    }
    if (contents.budgetItems.length > 0) {
      const rows = contents.budgetItems.map((item, index) => ({
          ...base,
          id: newId("bud"),
          name: item.name,
          category: item.category ?? "General",
          type: item.type,
          estimatedCents: item.estimatedCents,
          actualCents: null,
          notes: item.notes ?? null,
          sortOrder: index + 1,
        }));
      await db.batch([
        db.insert(s.budgetItems).values(rows),
        db.insert(s.eventHistory).values(
          rows.map((row) =>
            historyValues(ctx, {
              eventId: created.id,
              resource: "budget",
              resourceId: row.id,
              action: "created",
              before: null,
              after: {
                id: row.id,
                eventId: created.id,
                name: row.name,
                category: row.category,
                type: row.type,
                estimatedCents: row.estimatedCents,
                actualCents: null,
                notes: row.notes,
                sortOrder: row.sortOrder,
                sourceTemplateId: templateId,
              },
            }),
          ),
        ),
      ]);
    }
    return created;
  },

  async saveAsTemplate(ctx: RequestContext, eventId: string, body: Body) {
    requireWorkspaceAccess(ctx);
    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");

    const [checklist, runOfShow, budget] = await Promise.all([
      db.select().from(s.checklistItems).where(eq(s.checklistItems.eventId, eventId)).orderBy(asc(s.checklistItems.sortOrder)),
      db
        .select()
        .from(s.runOfShowItems)
        .where(eq(s.runOfShowItems.eventId, eventId))
        .orderBy(...runOfShowOrderColumns()),
      db.select().from(s.budgetItems).where(eq(s.budgetItems.eventId, eventId)).orderBy(asc(s.budgetItems.sortOrder)),
    ]);

    // Progress is not part of a template: completion and actuals are stripped.
    const contents: TemplateContents = {
      checklistItems: checklist.map((row) => ({ ...map.toChecklistItem(row), completed: false, dueDate: null, eventId: undefined as never })),
      runOfShowItems: runOfShow.map((row) => ({ ...map.toRunOfShowItem(row), assignedEmail: null, completed: false, eventId: undefined as never })),
      budgetItems: budget.map((row) => ({ ...map.toBudgetItem(row), actualCents: null, eventId: undefined as never })),
    };

    const id = newId("tpl");
    await db.insert(s.templates).values({
      id,
      workspaceId: ctx.workspaceId,
      name: str(body, "name"),
      description: optStr(body, "description"),
      category: event.category,
      defaultCapacity: event.capacity,
      contents,
    });
    const [row] = await db.select().from(s.templates).where(eq(s.templates.id, id)).limit(1);
    return map.toTemplate(row!);
  },

  async sendAssignmentSummaries(ctx: RequestContext, eventId: string): Promise<AssignmentSummaryResult> {
    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");

    const [taskRows, cueRows, shiftRows] = await Promise.all([
      db.select({
        id: s.checklistItems.id,
        title: s.checklistItems.title,
        assigneeName: s.checklistItems.assignedTo,
        email: s.checklistItems.assignedEmail,
        dueDate: s.checklistItems.dueDate,
      }).from(s.checklistItems).where(and(
        eq(s.checklistItems.workspaceId, ctx.workspaceId),
        eq(s.checklistItems.eventId, eventId),
        eq(s.checklistItems.completed, false),
        or(isNotNull(s.checklistItems.assignedTo), isNotNull(s.checklistItems.assignedEmail)),
      )).orderBy(asc(s.checklistItems.dueDate), asc(s.checklistItems.sortOrder)),
      db.select({
        id: s.runOfShowItems.id,
        title: s.runOfShowItems.title,
        assigneeName: s.runOfShowItems.responsible,
        email: s.runOfShowItems.assignedEmail,
        dayNumber: s.runOfShowItems.dayNumber,
        startTime: s.runOfShowItems.startTime,
      }).from(s.runOfShowItems).where(and(
        eq(s.runOfShowItems.workspaceId, ctx.workspaceId),
        eq(s.runOfShowItems.eventId, eventId),
        eq(s.runOfShowItems.completed, false),
        or(isNotNull(s.runOfShowItems.responsible), isNotNull(s.runOfShowItems.assignedEmail)),
      )).orderBy(...runOfShowOrderColumns()),
      db.select({
        id: s.volunteerShifts.id,
        title: s.volunteerShifts.role,
        assigneeName: s.volunteerShifts.name,
        email: s.volunteerShifts.email,
        dayNumber: s.volunteerShifts.dayNumber,
        startTime: s.volunteerShifts.startTime,
        endTime: s.volunteerShifts.endTime,
      }).from(s.volunteerShifts).where(and(
        eq(s.volunteerShifts.workspaceId, ctx.workspaceId),
        eq(s.volunteerShifts.eventId, eventId),
        sql`${s.volunteerShifts.status} not in ('completed', 'cancelled')`,
      )).orderBy(asc(s.volunteerShifts.dayNumber), asc(s.volunteerShifts.startTime), asc(s.volunteerShifts.sortOrder)),
    ]);

    type SummaryDraft = {
      kind: "checklist" | "run-of-show" | "volunteer";
      id: string;
      email: string | null;
      assigneeName: string | null;
      title: string;
      label: "Checklist" | "Run of show" | "Volunteer shift";
      timing: string;
    };
    const drafts: SummaryDraft[] = [
      ...taskRows.map((row): SummaryDraft => ({
        kind: "checklist",
        id: row.id,
        email: row.email,
        assigneeName: row.assigneeName,
        title: row.title,
        label: "Checklist",
        timing: row.dueDate
          ? `Due ${row.dueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`
          : "No due date",
      })),
      ...cueRows.map((row): SummaryDraft => ({
        kind: "run-of-show",
        id: row.id,
        email: row.email,
        assigneeName: row.assigneeName,
        title: row.title,
        label: "Run of show",
        timing: `Day ${row.dayNumber} at ${row.startTime}`,
      })),
      ...shiftRows.map((row): SummaryDraft => ({
        kind: "volunteer",
        id: row.id,
        email: row.email,
        assigneeName: row.assigneeName,
        title: row.title,
        label: "Volunteer shift",
        timing: `Day ${row.dayNumber}, ${row.startTime}-${row.endTime}`,
      })),
    ];
    const counts = assignmentSummaryCounts(drafts);
    const deliverable = drafts.flatMap((draft) => {
      const email = assignmentDeliveryEmail(draft.email);
      return email ? [{ ...draft, email }] : [];
    });
    const groups = new Map<string, typeof deliverable>();
    for (const draft of deliverable) {
      groups.set(draft.email, [...(groups.get(draft.email) ?? []), draft]);
    }

    const outcomes = await Promise.all(Array.from(groups.entries()).map(async ([email, items]) => {
      const linkedItems = await Promise.all(items.map(async (item) => ({
        kind: item.label,
        title: item.title,
        timing: item.timing,
        url: await createAssignmentAccess(ctx, eventId, { kind: item.kind, id: item.id, email }),
      })));
      return notifyAssignmentSummary({
        to: email,
        assigneeName: items.find((item) => item.assigneeName)?.assigneeName ?? email,
        eventTitle: event.title,
        items: linkedItems,
      });
    }));
    const sent = outcomes.filter((outcome) => outcome.status === "sent").length;
    return {
      recipients: groups.size,
      assignments: deliverable.length,
      missingEmail: counts.missingEmail,
      sent,
      failed: outcomes.length - sent,
    };
  },
};

/**
 * Public: resolves a share token with no session at all.
 *
 * The workspace joins in for one reason — its time zone. The guest has no settings of
 * their own, so the event has to arrive already knowing which zone its times are in.
 */
export async function eventByShareToken(
  token: string,
): Promise<{ event: Event; timeZone: string } | null> {
  const [row] = await db
    .select({ event: s.events, location: s.locations, timeZone: s.workspaces.timeZone })
    .from(s.events)
    .leftJoin(s.locations, eq(s.events.locationId, s.locations.id))
    .innerJoin(s.workspaces, eq(s.events.workspaceId, s.workspaces.id))
    .where(eq(s.events.shareToken, token))
    .limit(1);
  if (!row) return null;
  const counts = await registrationCounts([row.event.id]);
  return {
    event: map.toEvent(row.event, {
      location: row.location,
      registrationCount: counts.get(row.event.id) ?? 0,
    }),
    timeZone: row.timeZone,
  };
}

/**
 * Public reads for a shared event. Deliberately narrow: the agenda and the ticket types
 * on sale, nothing else. The guest payload is built from these rather than filtered from
 * a fuller object, so budgets and guest lists cannot leak by omission.
 */
export async function publicAgenda(eventId: string) {
  const rows = await db
    .select({
      id: s.runOfShowItems.id,
      eventId: s.runOfShowItems.eventId,
      dayNumber: s.runOfShowItems.dayNumber,
      startTime: s.runOfShowItems.startTime,
      duration: s.runOfShowItems.durationMinutes,
      title: s.runOfShowItems.title,
      description: s.runOfShowItems.description,
      responsible: s.runOfShowItems.responsible,
      sortOrder: s.runOfShowItems.sortOrder,
      createdAt: s.runOfShowItems.createdAt,
    })
    .from(s.runOfShowItems)
    .where(eq(s.runOfShowItems.eventId, eventId))
    .orderBy(...runOfShowOrderColumns());
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function publicTickets(eventId: string) {
  const rows = await db
    .select()
    .from(s.ticketTypes)
    .where(and(eq(s.ticketTypes.eventId, eventId), eq(s.ticketTypes.isActive, true)))
    .orderBy(asc(s.ticketTypes.sortOrder));
  return rows.map(map.toTicketType);
}

/** Public-safe volunteer openings. Names and contact details stay server-side. */
export async function publicVolunteerNeeds(eventId: string) {
  const [needs, shifts] = await Promise.all([
    db.select().from(s.volunteerNeeds)
      .where(eq(s.volunteerNeeds.eventId, eventId))
      .orderBy(asc(s.volunteerNeeds.dayNumber), asc(s.volunteerNeeds.startTime), asc(s.volunteerNeeds.sortOrder)),
    db.select().from(s.volunteerShifts).where(eq(s.volunteerShifts.eventId, eventId)),
  ]);
  return volunteerCoverage(needs.map(map.toVolunteerNeed), shifts.map(map.toVolunteerShift));
}

async function sharedEventForWrite(token: string) {
  const [row] = await db.select().from(s.events).where(eq(s.events.shareToken, token)).limit(1);
  if (!row || row.status === "cancelled" || row.status === "completed") {
    throw new HttpError(404, "This event link is no longer active.");
  }
  return row;
}

/** Registers a guest from one segment-specific public link. */
export async function publicRegistration(token: string, body: Body): Promise<Registration> {
  const event = await sharedEventForWrite(token);
  const draft: PublicRegistrationDraft = {
    name: str(body, "name").trim(),
    email: str(body, "email").trim().toLowerCase(),
    segment: labelFrom(body, "segment") ?? "General",
    organization: labelFrom(body, "organization", 120),
  };
  const page = normalizeRegistrationPage(event.registrationPage);
  if (!page.registrationTypes.includes(draft.segment)) throw new HttpError(400, "That guest type is not available for this event.");
  if (!page.collectOrganization) draft.organization = null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) throw new HttpError(400, "Enter a valid email address.");
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(s.registrations)
    .where(and(eq(s.registrations.eventId, event.id), sql`${s.registrations.status} <> 'cancelled'`));
  if (event.capacity !== null && Number(total) >= event.capacity) {
    throw new HttpError(409, `${event.title} is at capacity (${event.capacity}).`);
  }

  const guestId = newId("att");
  await db.insert(s.guests).values({
    id: guestId,
    workspaceId: event.workspaceId,
    name: draft.name,
    contact: draft.email,
    notes: "Registered through the public event page.",
  }).onConflictDoNothing({ target: [s.guests.workspaceId, s.guests.contact] });
  const [guest] = await db.select({ id: s.guests.id }).from(s.guests).where(and(
    eq(s.guests.workspaceId, event.workspaceId),
    eq(s.guests.contact, draft.email),
  )).limit(1);
  if (!guest) throw new HttpError(500, "The guest record could not be created.");

  const id = newId("reg");
  try {
    await db.insert(s.registrations).values({
      id,
      workspaceId: event.workspaceId,
      eventId: event.id,
      guestId: guest.id,
      status: "confirmed",
      segment: draft.segment,
      organization: draft.organization,
    });
  } catch (error) {
    if (isConstraintViolation(error, "registrations_event_guest_idx")) {
      throw new HttpError(409, "This email is already registered for the event.");
    }
    throw error;
  }
  const [row] = await db.select().from(s.registrations).where(eq(s.registrations.id, id)).limit(1);
  return map.toRegistration(row!, event.title);
}

/** Claims an available volunteer opening without exposing the workspace or its roster. */
export async function publicVolunteerSignup(token: string, body: Body): Promise<VolunteerShift> {
  const event = await sharedEventForWrite(token);
  if (!normalizeRegistrationPage(event.registrationPage).showVolunteerSignup) {
    throw new HttpError(404, "Volunteer signup is not available for this event.");
  }
  const draft: PublicVolunteerSignupDraft = {
    needId: str(body, "needId"),
    name: str(body, "name").trim(),
    email: str(body, "email").trim().toLowerCase(),
    phone: labelFrom(body, "phone", 60),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) throw new HttpError(400, "Enter a valid email address.");
  const [need] = await db.select().from(s.volunteerNeeds).where(and(
    eq(s.volunteerNeeds.id, draft.needId),
    eq(s.volunteerNeeds.eventId, event.id),
    eq(s.volunteerNeeds.workspaceId, event.workspaceId),
    eq(s.volunteerNeeds.signupOpen, true),
  )).limit(1);
  if (!need) throw new HttpError(404, "That volunteer shift is no longer available.");
  const existing = await db.select({ id: s.volunteerShifts.id }).from(s.volunteerShifts).where(and(
    eq(s.volunteerShifts.eventId, event.id),
    eq(s.volunteerShifts.email, draft.email),
    eq(s.volunteerShifts.needId, need.id),
    sql`${s.volunteerShifts.status} <> 'cancelled'`,
  )).limit(1);
  if (existing.length > 0) throw new HttpError(409, "This email is already signed up for that shift.");
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(s.volunteerShifts).where(and(
    eq(s.volunteerShifts.eventId, event.id),
    eq(s.volunteerShifts.needId, need.id),
    sql`${s.volunteerShifts.status} <> 'cancelled'`,
  ));
  if (Number(total) >= need.requiredCount) throw new HttpError(409, "That volunteer shift is already full.");
  const id = newId("vol");
  try {
    await db.insert(s.volunteerShifts).values({
      id,
      workspaceId: event.workspaceId,
      eventId: event.id,
      needId: need.id,
      dayNumber: need.dayNumber,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      role: need.role,
      startTime: need.startTime,
      endTime: need.endTime,
      status: "confirmed",
      notes: need.notes,
    });
  } catch (error) {
    if (isConstraintViolation(error, "volunteer_need_capacity_check")) {
      throw new HttpError(409, "That volunteer shift is already full.");
    }
    throw error;
  }
  const [row] = await db.select().from(s.volunteerShifts).where(eq(s.volunteerShifts.id, id)).limit(1);
  const shift = map.toVolunteerShift(row!);
  try {
    const publicContext: RequestContext = {
      userId: `public:${draft.email}`,
      email: draft.email,
      workspaceId: event.workspaceId,
      role: "member",
    };
    const url = await createAssignmentAccess(publicContext, event.id, {
      kind: "volunteer",
      id: shift.id,
      email: draft.email,
    });
    await notifyVolunteerAssignment({
      to: draft.email,
      volunteerName: shift.name,
      role: shift.role,
      eventTitle: event.title,
      dayNumber: shift.dayNumber,
      startTime: shift.startTime,
      endTime: shift.endTime,
      url,
    });
  } catch (error) {
    console.warn("VOLUNTEER_ASSIGNMENT_NOTIFICATION_FAILED", error instanceof Error ? error.message : String(error));
  }
  return shift;
}

/** Public, token-scoped read that exposes one current assignment and no surrounding workspace data. */
export async function publicAssignment(token: string): Promise<PublicAssignmentPayload | null> {
  const [link] = await db.select().from(s.eventHistory)
    .where(and(eq(s.eventHistory.resource, "assignment-link"), eq(s.eventHistory.resourceId, token)))
    .limit(1);
  if (!link || !link.after) return null;
  const kind = link.after.kind;
  const assignmentId = link.after.assignmentId;
  const email = link.after.email;
  if ((kind !== "checklist" && kind !== "run-of-show" && kind !== "volunteer") || typeof assignmentId !== "string" || typeof email !== "string") return null;

  const [eventRow] = await db.select({ event: s.events, location: s.locations, timeZone: s.workspaces.timeZone }).from(s.events)
    .leftJoin(s.locations, eq(s.events.locationId, s.locations.id))
    .innerJoin(s.workspaces, eq(s.events.workspaceId, s.workspaces.id))
    .where(and(eq(s.events.id, link.eventId), eq(s.events.workspaceId, link.workspaceId))).limit(1);
  if (!eventRow) return null;
  const eventFields = {
    eventTitle: eventRow.event.title,
    eventDate: eventRow.event.startsAt.toISOString(),
    eventEndDate: eventRow.event.endsAt?.toISOString() ?? null,
    timeZone: eventRow.timeZone,
    location: eventRow.location
      ? [eventRow.location.name, eventRow.location.city].filter(Boolean).join(", ")
      : eventRow.event.venue,
  };

  if (kind === "checklist") {
    const [item] = await db.select().from(s.checklistItems).where(and(
      eq(s.checklistItems.id, assignmentId),
      eq(s.checklistItems.eventId, link.eventId),
      eq(s.checklistItems.workspaceId, link.workspaceId),
      eq(s.checklistItems.assignedEmail, email),
    )).limit(1);
    if (!item) return null;
    return {
      kind,
      ...eventFields,
      assignee: item.assignedTo ?? email,
      title: item.title,
      description: item.description,
      dueDate: item.dueDate?.toISOString() ?? null,
      dueDateCivil: item.dueDate?.toISOString().slice(0, 10) ?? null,
      completed: item.completed,
      appPath: `/app/events/${encodeURIComponent(link.eventId)}/checklist?task=${encodeURIComponent(item.id)}`,
      dayNumber: null,
      startTime: null,
      endTime: null,
      endDayOffset: 0,
    };
  }

  if (kind === "run-of-show") {
    const [cue] = await db.select().from(s.runOfShowItems).where(and(
      eq(s.runOfShowItems.id, assignmentId),
      eq(s.runOfShowItems.eventId, link.eventId),
      eq(s.runOfShowItems.workspaceId, link.workspaceId),
      eq(s.runOfShowItems.assignedEmail, email),
    )).limit(1);
    if (!cue) return null;
    const cueEnd = cue.durationMinutes !== null && cue.durationMinutes > 0
      ? timeAfterMinutes(cue.startTime, cue.durationMinutes)
      : null;
    return {
      kind,
      ...eventFields,
      assignee: cue.responsible ?? email,
      title: cue.title,
      description: cue.description,
      dueDate: null,
      dueDateCivil: null,
      completed: cue.completed,
      appPath: `/app/events/${encodeURIComponent(link.eventId)}/run-of-show?day=${cue.dayNumber}&cue=${encodeURIComponent(cue.id)}`,
      dayNumber: cue.dayNumber,
      startTime: cue.startTime,
      endTime: cueEnd?.time ?? null,
      endDayOffset: cueEnd?.dayOffset ?? 0,
    };
  }

  const [shift] = await db.select().from(s.volunteerShifts).where(and(
    eq(s.volunteerShifts.id, assignmentId),
    eq(s.volunteerShifts.eventId, link.eventId),
    eq(s.volunteerShifts.workspaceId, link.workspaceId),
    eq(s.volunteerShifts.email, email),
  )).limit(1);
  if (!shift || shift.status === "cancelled") return null;
  return {
    kind,
    ...eventFields,
    assignee: shift.name,
    title: shift.role,
    description: shift.notes,
    dueDate: null,
    dueDateCivil: null,
    completed: shift.status === "completed",
    appPath: `/app/events/${encodeURIComponent(link.eventId)}/volunteers?shift=${encodeURIComponent(shift.id)}`,
    dayNumber: shift.dayNumber,
    startTime: shift.startTime,
    endTime: shift.endTime,
    endDayOffset: shift.endTime <= shift.startTime ? 1 : 0,
  };
}

/** A private assignment link can change only the task, cue or shift it was issued for. */
async function setPublicAssignmentCompletion(token: string, action: AssignmentCompletionAction): Promise<PublicAssignmentPayload | null> {
  const [link] = await db.select().from(s.eventHistory)
    .where(and(eq(s.eventHistory.resource, "assignment-link"), eq(s.eventHistory.resourceId, token)))
    .limit(1);
  const linkDetails = link?.after;
  const assignmentId = linkDetails?.assignmentId;
  const email = linkDetails?.email;
  const kind = linkDetails?.kind;
  if (!link || !linkDetails || typeof assignmentId !== "string" || typeof email !== "string") return null;
  const completed = action === "complete";

  if (kind === "checklist") {
    await db.update(s.checklistItems)
      .set({ completed, updatedAt: new Date() })
      .where(and(
        eq(s.checklistItems.id, assignmentId),
        eq(s.checklistItems.eventId, link.eventId),
        eq(s.checklistItems.workspaceId, link.workspaceId),
        eq(s.checklistItems.assignedEmail, email),
        eq(s.checklistItems.completed, !completed),
      ));
  } else if (kind === "run-of-show") {
    await db.update(s.runOfShowItems)
      .set({ completed, updatedAt: new Date() })
      .where(and(
        eq(s.runOfShowItems.id, assignmentId),
        eq(s.runOfShowItems.eventId, link.eventId),
        eq(s.runOfShowItems.workspaceId, link.workspaceId),
        eq(s.runOfShowItems.assignedEmail, email),
        eq(s.runOfShowItems.completed, !completed),
      ));
  } else if (kind === "volunteer") {
    const [shift] = await db.select({
      status: s.volunteerShifts.status,
      statusBeforeCompletion: s.volunteerShifts.statusBeforeCompletion,
    }).from(s.volunteerShifts).where(and(
      eq(s.volunteerShifts.id, assignmentId),
      eq(s.volunteerShifts.eventId, link.eventId),
      eq(s.volunteerShifts.workspaceId, link.workspaceId),
      eq(s.volunteerShifts.email, email),
    )).limit(1);
    if (!shift) return null;
    const transition = volunteerCompletionTransition(action, shift.status, shift.statusBeforeCompletion);
    if (!transition) return publicAssignment(token);
    await db.update(s.volunteerShifts)
      .set({
        status: transition.status,
        statusBeforeCompletion: transition.previousStatus,
        updatedAt: new Date(),
      })
      .where(and(
        eq(s.volunteerShifts.id, assignmentId),
        eq(s.volunteerShifts.eventId, link.eventId),
        eq(s.volunteerShifts.workspaceId, link.workspaceId),
        eq(s.volunteerShifts.email, email),
        eq(s.volunteerShifts.status, shift.status),
      ));
  } else {
    return null;
  }
  return publicAssignment(token);
}

export async function completePublicAssignment(token: string): Promise<PublicAssignmentPayload | null> {
  return setPublicAssignmentCompletion(token, "complete");
}

/** Reopens an accidentally completed assignment without exposing the surrounding event. */
export async function reopenPublicAssignment(token: string): Promise<PublicAssignmentPayload | null> {
  return setPublicAssignmentCompletion(token, "reopen");
}

/* ------------------------------------------------------------- locations */

export const locations = {
  async list(ctx: RequestContext): Promise<Location[]> {
    const conditions = [eq(s.locations.workspaceId, ctx.workspaceId)];
    if (ctx.eventScopeId) {
      const [assignedEvent] = await db
        .select({ locationId: s.events.locationId })
        .from(s.events)
        .where(and(eq(s.events.workspaceId, ctx.workspaceId), eq(s.events.id, ctx.eventScopeId)))
        .limit(1);
      if (!assignedEvent?.locationId) return [];
      conditions.push(eq(s.locations.id, assignedEvent.locationId));
    }
    // eventCount computed, never stored: a counter column is a thing that drifts.
    const rows = await db
      .select({
        location: s.locations,
        eventCount: sql<number>`(select count(*) from ${s.events} where ${s.events.locationId} = ${s.locations.id})`,
      })
      .from(s.locations)
      .where(and(...conditions))
      .orderBy(asc(s.locations.name));
    return rows.map((row) => ({ ...map.toLocation(row.location), eventCount: Number(row.eventCount) }));
  },

  async get(ctx: RequestContext, id: string): Promise<Location | null> {
    const all = await locations.list(ctx);
    return all.find((row) => row.id === id) ?? null;
  },

  async create(ctx: RequestContext, body: Body): Promise<Location> {
    requireWorkspaceAccess(ctx);
    const id = newId("loc");
    await db.insert(s.locations).values({
      id,
      workspaceId: ctx.workspaceId,
      name: str(body, "name"),
      corporationName: str(body, "corporationName", ""),
      address: optStr(body, "address"),
      city: optStr(body, "city"),
      state: optStr(body, "state"),
      country: str(body, "country", "USA"),
      phone: optStr(body, "phone"),
    });
    const created = await locations.get(ctx, id);
    return created!;
  },

  async update(ctx: RequestContext, id: string, body: Body): Promise<Location> {
    requireWorkspaceAccess(ctx);
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      corporationName: (b) => str(b, "corporationName", ""),
      address: (b) => optStr(b, "address"),
      city: (b) => optStr(b, "city"),
      state: (b) => optStr(b, "state"),
      country: (b) => str(b, "country", "USA"),
      phone: (b) => optStr(b, "phone"),
    });
    const updated = await db
      .update(s.locations)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.locations.id, id), eq(s.locations.workspaceId, ctx.workspaceId)))
      .returning({ id: s.locations.id });
    if (updated.length === 0) throw new HttpError(404, "That venue no longer exists.");
    return (await locations.get(ctx, id))!;
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    requireWorkspaceAccess(ctx);
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(s.events)
      .where(and(eq(s.events.locationId, id), eq(s.events.workspaceId, ctx.workspaceId)));
    if (Number(total) > 0) {
      throw new HttpError(409, "This venue still has events. Move or delete them first.");
    }
    await db.delete(s.locations).where(and(eq(s.locations.id, id), eq(s.locations.workspaceId, ctx.workspaceId)));
  },
};

/* -------------------------------------------------------------- guests */

function scopedGuestCondition(ctx: RequestContext) {
  if (!ctx.eventScopeId) return null;
  return inArray(
    s.guests.id,
    db
      .select({ guestId: s.registrations.guestId })
      .from(s.registrations)
      .where(eq(s.registrations.eventId, ctx.eventScopeId)),
  );
}

export const guests = {
  async list(ctx: RequestContext) {
    const conditions = [eq(s.guests.workspaceId, ctx.workspaceId)];
    const eventScope = scopedGuestCondition(ctx);
    if (eventScope) conditions.push(eventScope);
    const rows = await db
      .select()
      .from(s.guests)
      .where(and(...conditions))
      .orderBy(asc(s.guests.name));
    return rows.map(map.toGuest);
  },
  async create(ctx: RequestContext, body: Body) {
    const id = newId("att");
    const contact = str(body, "contact");
    try {
      await db.insert(s.guests).values({
        id,
        workspaceId: ctx.workspaceId,
        name: str(body, "name"),
        contact,
        notes: optStr(body, "notes"),
      });
    } catch (error) {
      // The unique index on (workspace, contact) is what makes this a real rule.
      if (isConstraintViolation(error, "guests_workspace_contact_idx")) {
        throw new HttpError(409, `Someone with the email ${contact} is already in your people list.`);
      }
      throw error;
    }
    const [row] = await db.select().from(s.guests).where(eq(s.guests.id, id)).limit(1);
    return map.toGuest(row!);
  },
  async update(ctx: RequestContext, id: string, body: Body) {
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      contact: (b) => str(b, "contact"),
      notes: (b) => optStr(b, "notes"),
    });
    const conditions = [eq(s.guests.id, id), eq(s.guests.workspaceId, ctx.workspaceId)];
    const eventScope = scopedGuestCondition(ctx);
    if (eventScope) conditions.push(eventScope);
    const updated = await db
      .update(s.guests)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That person no longer exists.");
    return map.toGuest(updated[0]!);
  },
  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    requireWorkspaceAccess(ctx);
    await db.delete(s.guests).where(and(eq(s.guests.id, id), eq(s.guests.workspaceId, ctx.workspaceId)));
  },
};

/* ---------------------------------------------------------- registrations */

async function joinRegistrations(where: ReturnType<typeof and>): Promise<RegistrationWithGuest[]> {
  const rows = await db
    .select({ registration: s.registrations, guest: s.guests, eventTitle: s.events.title })
    .from(s.registrations)
    .innerJoin(s.events, eq(s.registrations.eventId, s.events.id))
    .leftJoin(s.guests, eq(s.registrations.guestId, s.guests.id))
    .where(where)
    .orderBy(desc(s.registrations.registeredAt));
  return rows.map((row) => ({
    ...map.toRegistration(row.registration, row.eventTitle),
    guest: row.guest ? map.toGuest(row.guest) : null,
  }));
}

/**
 * A guest-list category, normalised. Free text, so it is trimmed and bounded here rather
 * than trusted: the picker offers existing values back to the user, and an untrimmed
 * "VIP " would sit alongside "VIP" as a second, identical-looking category.
 */
function labelFrom(body: Body, key: string, limit = 60): string | null {
  const value = optStr(body, key);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > limit) throw new HttpError(400, `${key} must be ${limit} characters or fewer.`);
  return trimmed;
}

export const registrations = {
  list: (ctx: RequestContext) =>
    joinRegistrations(
      and(
        eq(s.registrations.workspaceId, ctx.workspaceId),
        ...(ctx.eventScopeId ? [eq(s.registrations.eventId, ctx.eventScopeId)] : []),
      ),
    ),
  async listForEvent(ctx: RequestContext, eventId: string) {
    await requireOwnedEvent(ctx, eventId);
    return joinRegistrations(and(eq(s.registrations.workspaceId, ctx.workspaceId), eq(s.registrations.eventId, eventId)));
  },

  async create(ctx: RequestContext, body: Body): Promise<Registration> {
    const eventId = str(body, "eventId");
    const guestId = str(body, "guestId");

    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");

    // Duplicate before capacity: telling someone already on the list that the event is
    // full is both wrong and unactionable. The unique index below still backs this up
    // against two concurrent requests.
    const [duplicate] = await db
      .select({ id: s.registrations.id })
      .from(s.registrations)
      .where(and(eq(s.registrations.eventId, eventId), eq(s.registrations.guestId, guestId)))
      .limit(1);
    if (duplicate) throw new HttpError(409, "That guest is already registered for this event.");

    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new HttpError(409, `${event.title} is at capacity (${event.capacity}).`);
    }

    const id = newId("reg");
    try {
      await db.insert(s.registrations).values({
        id,
        workspaceId: ctx.workspaceId,
        eventId,
        guestId,
        status: (optStr(body, "status") ?? "pending") as "pending",
        segment: labelFrom(body, "segment"),
        organization: labelFrom(body, "organization", 120),
      });
    } catch (error) {
      if (isConstraintViolation(error, "registrations_event_guest_idx")) {
        throw new HttpError(409, "That guest is already registered for this event.");
      }
      throw error;
    }
    const [row] = await db.select().from(s.registrations).where(eq(s.registrations.id, id)).limit(1);
    return map.toRegistration(row!, event.title);
  },

  async createWalkIn(ctx: RequestContext, eventId: string, body: Body): Promise<RegistrationWithGuest> {
    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");
    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new HttpError(409, `${event.title} is at capacity (${event.capacity}).`);
    }

    const draft: WalkInRegistrationDraft = {
      name: str(body, "name").trim(),
      contact: str(body, "contact").trim(),
      segment: labelFrom(body, "segment"),
      organization: labelFrom(body, "organization", 120),
      checkInStation: labelFrom(body, "checkInStation", 80),
      checkInNotes: labelFrom(body, "checkInNotes", 500),
    };
    const [existingGuest] = await db
      .select({ id: s.guests.id })
      .from(s.guests)
      .where(and(eq(s.guests.workspaceId, ctx.workspaceId), eq(s.guests.contact, draft.contact)))
      .limit(1);
    if (existingGuest) {
      throw new HttpError(409, "That email is already in the people list. Search for the guest and check them in instead.");
    }

    const guestId = newId("att");
    const registrationId = newId("reg");
    const checkedInAt = new Date();
    const guestInsert = db
      .insert(s.guests)
      .values({
        id: guestId,
        workspaceId: ctx.workspaceId,
        name: draft.name,
        contact: draft.contact,
        notes: "Registered at event check-in.",
      })
      .returning();
    const registrationInsert = db
      .insert(s.registrations)
      .values({
        id: registrationId,
        workspaceId: ctx.workspaceId,
        eventId,
        guestId,
        status: "confirmed",
        segment: draft.segment?.trim() || "Walk-in",
        organization: draft.organization?.trim() || null,
        checkedInAt,
        checkInStation: draft.checkInStation?.trim() || null,
        checkInNotes: draft.checkInNotes?.trim() || "Registered on site.",
      })
      .returning();

    try {
      const [guestRows, registrationRows] = await db.batch([guestInsert, registrationInsert]);
      const guest = map.toGuest(guestRows[0]!);
      return { ...map.toRegistration(registrationRows[0]!, event.title), guest };
    } catch (error) {
      if (isConstraintViolation(error, "guests_workspace_contact_idx")) {
        throw new HttpError(409, "That email is already in the people list. Search for the guest and check them in instead.");
      }
      throw error;
    }
  },

  /**
   * Applies whichever of status and segment the client sent. One method rather than two
   * endpoints because they are edited from the same row and often in the same breath, and
   * because a patch that only assigns what it was given cannot blank the other field.
   */
  async update(ctx: RequestContext, id: string, body: Body): Promise<Registration> {
    const patch: {
      status?: Registration["status"];
      segment?: string | null;
      organization?: string | null;
      checkedInAt?: Date | null;
      checkInStation?: string | null;
      checkInNotes?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if ("status" in body) {
      const status = str(body, "status");
      if (!(REGISTRATION_STATUSES as readonly string[]).includes(status)) {
        throw new HttpError(400, `status must be one of ${REGISTRATION_STATUSES.join(", ")}.`);
      }
      patch.status = status as Registration["status"];
    }
    if ("segment" in body) patch.segment = labelFrom(body, "segment");
    if ("organization" in body) patch.organization = labelFrom(body, "organization", 120);
    if ("checkedInAt" in body) {
      patch.checkedInAt = parseOptionalDate(body.checkedInAt, "checkedInAt");
      // Someone who arrives has accepted the invitation in the most concrete way.
      if (patch.checkedInAt) patch.status = "confirmed";
    }
    if ("checkInStation" in body) patch.checkInStation = labelFrom(body, "checkInStation", 80);
    if ("checkInNotes" in body) patch.checkInNotes = labelFrom(body, "checkInNotes", 500);

    const conditions = [eq(s.registrations.id, id), eq(s.registrations.workspaceId, ctx.workspaceId)];
    if (ctx.eventScopeId) conditions.push(eq(s.registrations.eventId, ctx.eventScopeId));
    const updated = await db
      .update(s.registrations)
      .set(patch)
      .where(and(...conditions))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That registration no longer exists.");
    const [event] = await db.select({ title: s.events.title }).from(s.events).where(eq(s.events.id, updated[0]!.eventId)).limit(1);
    return map.toRegistration(updated[0]!, event?.title ?? "");
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const conditions = [eq(s.registrations.id, id), eq(s.registrations.workspaceId, ctx.workspaceId)];
    if (ctx.eventScopeId) conditions.push(eq(s.registrations.eventId, ctx.eventScopeId));
    await db.delete(s.registrations).where(and(...conditions));
  },
};

/* ----------------------------------------------------------------- vendors */

/** Thread summaries for every vendor in one query, rather than one per vendor. */
async function vendorThreads(workspaceId: string) {
  const rows = await db
    .select({
      vendorId: s.vendorMessages.vendorId,
      lastMessage: sql<string | null>`(array_agg(${s.vendorMessages.body} order by ${s.vendorMessages.createdAt} desc))[1]`,
      lastMessageAt: sql<Date | null>`max(${s.vendorMessages.createdAt})`,
      lastDirection: sql<"inbound" | "outbound" | null>`(array_agg(${s.vendorMessages.direction}::text order by ${s.vendorMessages.createdAt} desc))[1]`,
      unreadCount: sql<number>`count(*) filter (where ${s.vendorMessages.direction} = 'inbound' and ${s.vendorMessages.isRead} = false)`,
    })
    .from(s.vendorMessages)
    .where(eq(s.vendorMessages.workspaceId, workspaceId))
    .groupBy(s.vendorMessages.vendorId);

  return new Map(
    rows.map((row) => [
      row.vendorId,
      {
        lastMessage: row.lastMessage,
        lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : null,
        lastDirection: row.lastDirection,
        unreadCount: Number(row.unreadCount),
      },
    ]),
  );
}

export const vendors = {
  async list(ctx: RequestContext): Promise<Vendor[]> {
    const conditions = [eq(s.vendors.workspaceId, ctx.workspaceId)];
    if (ctx.eventScopeId) {
      conditions.push(
        inArray(
          s.vendors.id,
          db
            .select({ vendorId: s.eventVendors.vendorId })
            .from(s.eventVendors)
            .where(
              and(
                eq(s.eventVendors.workspaceId, ctx.workspaceId),
                eq(s.eventVendors.eventId, ctx.eventScopeId),
              ),
            ),
        ),
      );
    }
    const [rows, threads] = await Promise.all([
      db.select().from(s.vendors).where(and(...conditions)).orderBy(asc(s.vendors.name)),
      vendorThreads(ctx.workspaceId),
    ]);
    return rows.map((row) => map.toVendor(row, threads.get(row.id)));
  },
  async get(ctx: RequestContext, id: string): Promise<Vendor | null> {
    const all = await vendors.list(ctx);
    return all.find((row) => row.id === id) ?? null;
  },
  async create(ctx: RequestContext, body: Body): Promise<Vendor> {
    requireWorkspaceAccess(ctx);
    const id = newId("ven");
    const rating = body.rating;
    await db.insert(s.vendors).values({
      id,
      workspaceId: ctx.workspaceId,
      name: str(body, "name"),
      category: str(body, "category", "Other"),
      description: optStr(body, "description"),
      contactEmail: optStr(body, "contactEmail"),
      contactPhone: optStr(body, "contactPhone"),
      website: optStr(body, "website"),
      logoUrl: optStr(body, "logoUrl"),
      ratingTenths: typeof rating === "number" ? Math.round(rating * 10) : null,
      city: optStr(body, "city"),
      state: optStr(body, "state"),
      country: optStr(body, "country"),
    });
    return (await vendors.get(ctx, id))!;
  },
  async update(ctx: RequestContext, id: string, body: Body): Promise<Vendor> {
    requireWorkspaceAccess(ctx);
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      category: (b) => str(b, "category", "Other"),
      description: (b) => optStr(b, "description"),
      contactEmail: (b) => optStr(b, "contactEmail"),
      contactPhone: (b) => optStr(b, "contactPhone"),
      website: (b) => optStr(b, "website"),
      logoUrl: (b) => optStr(b, "logoUrl"),
      city: (b) => optStr(b, "city"),
      state: (b) => optStr(b, "state"),
      country: (b) => optStr(b, "country"),
    });
    if ("rating" in body) {
      patch.ratingTenths = typeof body.rating === "number" ? Math.round(body.rating * 10) : null;
    }
    if ("contactEmail" in body) {
      patch.portalToken = sql`case when ${s.vendors.contactEmail} is distinct from ${patch.contactEmail ?? null} then null else ${s.vendors.portalToken} end`;
    }
    const updated = await db
      .update(s.vendors)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.vendors.id, id), eq(s.vendors.workspaceId, ctx.workspaceId)))
      .returning({ id: s.vendors.id });
    if (updated.length === 0) throw new HttpError(404, "That vendor no longer exists.");
    return (await vendors.get(ctx, id))!;
  },
  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    requireWorkspaceAccess(ctx);
    await db.delete(s.vendors).where(and(eq(s.vendors.id, id), eq(s.vendors.workspaceId, ctx.workspaceId)));
  },
};

export const vendorMessages = {
  async list(ctx: RequestContext, vendorId: string) {
    if (!(await vendors.get(ctx, vendorId))) throw new HttpError(404, "That vendor no longer exists.");
    const rows = await db
      .select()
      .from(s.vendorMessages)
      .where(and(eq(s.vendorMessages.workspaceId, ctx.workspaceId), eq(s.vendorMessages.vendorId, vendorId)))
      .orderBy(asc(s.vendorMessages.createdAt));
    return rows.map(map.toVendorMessage);
  },
  async create(ctx: RequestContext, vendorId: string, body: Body) {
    const vendor = await vendors.get(ctx, vendorId);
    if (!vendor) throw new HttpError(404, "That vendor no longer exists.");
    if (!vendor.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.contactEmail)) throw new HttpError(409, "Add a valid contact email before messaging this vendor.");

    const id = newId("vm");
    const senderName = str(body, "senderName", "Beebizy");
    const subject = optStr(body, "subject");
    const content = str(body, "content");
    if (content.length > 10_000 || senderName.length > 120 || (subject?.length ?? 0) > 200) throw new HttpError(400, "This message is too long.");
    const eventId = optStr(body, "eventId");
    if (eventId) await requireOwnedEvent(ctx, eventId);
    const [portal] = await db.update(s.vendors).set({
      portalToken: sql`coalesce(${s.vendors.portalToken}, ${crypto.randomUUID()})`,
    }).where(and(eq(s.vendors.id, vendorId), eq(s.vendors.workspaceId, ctx.workspaceId)))
      .returning({ token: s.vendors.portalToken });
    await db.insert(s.vendorMessages).values({
      id,
      workspaceId: ctx.workspaceId,
      vendorId,
      eventId,
      direction: "outbound",
      senderName,
      subject,
      body: content,
      isRead: true,
    });

    const outcome = await notifyVendorMessage({
      to: vendor.contactEmail,
      vendorName: vendor.name,
      senderName,
      subject,
      message: content,
      url: `${appOrigin()}/vendor-conversation/${portal!.token}`,
    });
    await vendorMessages.markDelivered(id, outcome.status === "sent" ? null : outcome.reason);
    const [row] = await db.select().from(s.vendorMessages).where(eq(s.vendorMessages.id, id)).limit(1);
    return map.toVendorMessage(row!);
  },
  async markThreadRead(ctx: RequestContext, vendorId: string): Promise<void> {
    if (!(await vendors.get(ctx, vendorId))) throw new HttpError(404, "That vendor no longer exists.");
    await db
      .update(s.vendorMessages)
      .set({ isRead: true })
      .where(and(eq(s.vendorMessages.workspaceId, ctx.workspaceId), eq(s.vendorMessages.vendorId, vendorId)));
  },
  async markDelivered(id: string, error: string | null): Promise<void> {
    await db
      .update(s.vendorMessages)
      .set({ deliveredAt: error ? null : new Date(), deliveryError: error })
      .where(eq(s.vendorMessages.id, id));
  },
};

export async function publicVendorConversation(token: string): Promise<PublicVendorConversation | null> {
  const [vendor] = await db.select().from(s.vendors).where(eq(s.vendors.portalToken, token)).limit(1);
  if (!vendor) return null;
  const rows = await db.select({
    id: s.vendorMessages.id, direction: s.vendorMessages.direction, senderName: s.vendorMessages.senderName,
    subject: s.vendorMessages.subject, content: s.vendorMessages.body, createdAt: s.vendorMessages.createdAt,
  }).from(s.vendorMessages).where(and(eq(s.vendorMessages.vendorId, vendor.id), eq(s.vendorMessages.workspaceId, vendor.workspaceId)))
    .orderBy(desc(s.vendorMessages.createdAt)).limit(500);
  return { vendorName: vendor.name, messages: rows.reverse().map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

export async function publicVendorReply(token: string, body: Body): Promise<void> {
  const [vendor] = await db.select().from(s.vendors).where(eq(s.vendors.portalToken, token)).limit(1);
  if (!vendor) throw new HttpError(404, "This conversation link is no longer active.");
  const content = str(body, "content").trim();
  if (content.length > 10_000) throw new HttpError(400, "Keep your message under 10,000 characters.");
  await db.insert(s.vendorMessages).values({
    id: newId("vm"), workspaceId: vendor.workspaceId, vendorId: vendor.id,
    direction: "inbound", senderName: vendor.name, body: content, isRead: false,
  });
}

/* ---------------------------------------------------------- requests for proposal */

function readRfpStatus(body: Body): Rfp["status"] {
  const value = str(body, "status", "draft");
  if (!(RFP_STATUSES as readonly string[]).includes(value)) throw new HttpError(400, "Choose a valid RFP status.");
  return value as Rfp["status"];
}

function readRfpTargetType(body: Body): Rfp["targetType"] {
  const value = str(body, "targetType", "vendor");
  if (!(RFP_TARGET_TYPES as readonly string[]).includes(value)) throw new HttpError(400, "Choose venue or vendor.");
  return value as Rfp["targetType"];
}

function readRfpEventType(body: Body): Rfp["eventType"] {
  const value = optStr(body, "eventType");
  if (value !== null && !(RFP_EVENT_TYPES as readonly string[]).includes(value)) {
    throw new HttpError(400, "Choose a valid event type.");
  }
  return value;
}

function requireValidRfpDraft(body: Body): void {
  const parsed = rfpDraftSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the RFP details.");
}

const RFP_CONTENT_KEYS = new Set([
  "title", "targetType", "vendorCategory", "description", "eventType", "eventDate", "startTime", "endTime",
  "headcount", "roomBlockRequired", "roomsRequired", "checkInDate", "checkOutDate", "spaceRequirements",
  "foodBeverageSpendCents", "ancillarySpendCents", "ancillarySpendNotes", "city", "location", "budgetMinCents",
  "budgetMaxCents", "deadline", "requirements",
]);

async function requireRfp(ctx: RequestContext, eventId: string, rfpId: string) {
  const [row] = await db.select().from(s.rfps).where(and(
    eq(s.rfps.id, rfpId),
    eq(s.rfps.eventId, eventId),
    eq(s.rfps.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!row) throw new HttpError(404, "That RFP no longer exists.");
  return row;
}

export const rfps = {
  async list(ctx: RequestContext, eventId: string): Promise<RfpWithResponses[]> {
    await requireOwnedEvent(ctx, eventId);
    const rows = await db.select().from(s.rfps).where(and(
      eq(s.rfps.workspaceId, ctx.workspaceId),
      eq(s.rfps.eventId, eventId),
    )).orderBy(desc(s.rfps.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [responses, invitations] = await Promise.all([
      db.select().from(s.rfpResponses).where(and(
        eq(s.rfpResponses.workspaceId, ctx.workspaceId),
        inArray(s.rfpResponses.rfpId, ids),
      )).orderBy(asc(s.rfpResponses.createdAt)),
      db.select({ invitation: s.rfpInvitations, vendor: s.vendors })
        .from(s.rfpInvitations)
        .innerJoin(s.vendors, eq(s.rfpInvitations.vendorId, s.vendors.id))
        .where(and(
          eq(s.rfpInvitations.workspaceId, ctx.workspaceId),
          inArray(s.rfpInvitations.rfpId, ids),
        ))
        .orderBy(asc(s.rfpInvitations.sentAt)),
    ]);
    return rows.map((row) => ({
      ...map.toRfp(row),
      responses: responses.filter((response) => response.rfpId === row.id).map(map.toRfpResponse),
      invitations: invitations
        .filter(({ invitation }) => invitation.rfpId === row.id)
        .map(({ invitation, vendor }) => map.toRfpInvitation(invitation, vendor)),
    }));
  },

  async create(ctx: RequestContext, eventId: string, body: Body): Promise<Rfp> {
    await requireOwnedEvent(ctx, eventId);
    requireValidRfpDraft(body);
    if (!validRfpBudget(body)) throw new HttpError(400, "The maximum budget must be at least the minimum.");
    if (!validHotelRfp(body)) throw new HttpError(400, "Room blocks require a room count and check-out after check-in.");
    const id = newId("rfp");
    await db.insert(s.rfps).values({
      id,
      workspaceId: ctx.workspaceId,
      eventId,
      title: str(body, "title"),
      targetType: readRfpTargetType(body),
      vendorCategory: str(body, "vendorCategory", "Other"),
      description: optStr(body, "description"),
      eventType: readRfpEventType(body),
      eventDate: parseOptionalDate(body.eventDate, "eventDate"),
      startTime: optLocalTime(body, "startTime"),
      endTime: optLocalTime(body, "endTime"),
      headcount: optInt(body, "headcount"),
      roomBlockRequired: optBool(body, "roomBlockRequired") ?? false,
      roomsRequired: optInt(body, "roomsRequired"),
      checkInDate: parseOptionalDate(body.checkInDate, "checkInDate"),
      checkOutDate: parseOptionalDate(body.checkOutDate, "checkOutDate"),
      spaceRequirements: rfpSpaces(body),
      foodBeverageSpendCents: optInt(body, "foodBeverageSpendCents"),
      ancillarySpendCents: optInt(body, "ancillarySpendCents"),
      ancillarySpendNotes: optStr(body, "ancillarySpendNotes"),
      city: optStr(body, "city"),
      location: optStr(body, "location"),
      budgetMinCents: optInt(body, "budgetMinCents"),
      budgetMaxCents: optInt(body, "budgetMaxCents"),
      deadline: parseOptionalDate(body.deadline, "deadline"),
      requirements: optStr(body, "requirements"),
      status: readRfpStatus(body),
    });
    const [row] = await db.select().from(s.rfps).where(eq(s.rfps.id, id)).limit(1);
    return map.toRfp(row!);
  },

  async update(ctx: RequestContext, eventId: string, id: string, body: Body): Promise<Rfp> {
    const current = await requireRfp(ctx, eventId, id);
    if (Object.keys(body).some((key) => RFP_CONTENT_KEYS.has(key))) requireValidRfpDraft({ ...map.toRfp(current), ...body });
    if (!validRfpBudget({ ...current, ...body })) throw new HttpError(400, "The maximum budget must be at least the minimum.");
    if (!validHotelRfp({ ...current, ...body })) throw new HttpError(400, "Room blocks require a room count and check-out after check-in.");
    const patch = patchFrom<Record<string, unknown>>(body, {
      title: (b) => str(b, "title"),
      targetType: readRfpTargetType,
      vendorCategory: (b) => str(b, "vendorCategory", "Other"),
      description: (b) => optStr(b, "description"),
      eventType: readRfpEventType,
      eventDate: (b) => parseOptionalDate(b.eventDate, "eventDate"),
      startTime: (b) => optLocalTime(b, "startTime"),
      endTime: (b) => optLocalTime(b, "endTime"),
      headcount: (b) => optInt(b, "headcount"),
      roomBlockRequired: (b) => optBool(b, "roomBlockRequired") ?? false,
      roomsRequired: (b) => optInt(b, "roomsRequired"),
      checkInDate: (b) => parseOptionalDate(b.checkInDate, "checkInDate"),
      checkOutDate: (b) => parseOptionalDate(b.checkOutDate, "checkOutDate"),
      spaceRequirements: rfpSpaces,
      foodBeverageSpendCents: (b) => optInt(b, "foodBeverageSpendCents"),
      ancillarySpendCents: (b) => optInt(b, "ancillarySpendCents"),
      ancillarySpendNotes: (b) => optStr(b, "ancillarySpendNotes"),
      city: (b) => optStr(b, "city"),
      location: (b) => optStr(b, "location"),
      budgetMinCents: (b) => optInt(b, "budgetMinCents"),
      budgetMaxCents: (b) => optInt(b, "budgetMaxCents"),
      deadline: (b) => parseOptionalDate(b.deadline, "deadline"),
      requirements: (b) => optStr(b, "requirements"),
      status: readRfpStatus,
    });
    const [row] = await db.update(s.rfps).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.rfps.id, id), eq(s.rfps.workspaceId, ctx.workspaceId)))
      .returning();
    return map.toRfp(row!);
  },

  async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
    await requireRfp(ctx, eventId, id);
    await db.delete(s.rfps).where(and(eq(s.rfps.id, id), eq(s.rfps.workspaceId, ctx.workspaceId)));
  },

  async addResponse(ctx: RequestContext, eventId: string, rfpId: string, body: Body) {
    await requireRfp(ctx, eventId, rfpId);
    const id = newId("rfpres");
    await db.insert(s.rfpResponses).values({
      id,
      workspaceId: ctx.workspaceId,
      rfpId,
      vendorName: str(body, "vendorName"),
      contactName: optStr(body, "contactName"),
      contactEmail: optStr(body, "contactEmail"),
      contactPhone: optStr(body, "contactPhone"),
      quotedAmountCents: optInt(body, "quotedAmountCents"),
      notes: optStr(body, "notes"),
      status: str(body, "status", "received"),
    });
    const [row] = await db.select().from(s.rfpResponses).where(eq(s.rfpResponses.id, id)).limit(1);
    return map.toRfpResponse(row!);
  },

  async setResponseStatus(ctx: RequestContext, eventId: string, rfpId: string, responseId: string, status: string) {
    await requireRfp(ctx, eventId, rfpId);
    if (!(RFP_RESPONSE_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Choose a valid response status.");
    const [row] = await db.update(s.rfpResponses).set({ status, updatedAt: new Date() }).where(and(
      eq(s.rfpResponses.id, responseId),
      eq(s.rfpResponses.rfpId, rfpId),
      eq(s.rfpResponses.workspaceId, ctx.workspaceId),
    )).returning();
    if (!row) throw new HttpError(404, "That proposal no longer exists.");
    return map.toRfpResponse(row);
  },

  async removeResponse(ctx: RequestContext, eventId: string, rfpId: string, responseId: string): Promise<void> {
    await requireRfp(ctx, eventId, rfpId);
    await db.delete(s.rfpResponses).where(and(
      eq(s.rfpResponses.id, responseId),
      eq(s.rfpResponses.rfpId, rfpId),
      eq(s.rfpResponses.workspaceId, ctx.workspaceId),
    ));
  },

  async inviteVendor(ctx: RequestContext, eventId: string, rfpId: string, vendorId: string) {
    const rfp = await requireRfp(ctx, eventId, rfpId);
    if (rfp.status === "closed") throw new HttpError(409, "Reopen this RFP before inviting vendors.");
    const [vendor, event] = await Promise.all([
      db.select().from(s.vendors).where(and(eq(s.vendors.id, vendorId), eq(s.vendors.workspaceId, ctx.workspaceId))).limit(1).then((rows) => rows[0]),
      events.get(ctx, eventId),
    ]);
    if (!vendor) throw new HttpError(404, "That vendor no longer exists.");
    if (!vendor.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.contactEmail)) throw new HttpError(409, "Add a valid contact email before sending this RFP.");
    if (!event) throw new HttpError(404, "That event no longer exists.");

    await db.insert(s.rfpInvitations).values({
      id: newId("rfpinv"), workspaceId: ctx.workspaceId, rfpId, vendorId,
      recipientEmail: vendor.contactEmail, publicToken: crypto.randomUUID(),
    }).onConflictDoUpdate({
      target: [s.rfpInvitations.rfpId, s.rfpInvitations.vendorId],
      set: {
        publicToken: sql`case when ${s.rfpInvitations.recipientEmail} is distinct from ${vendor.contactEmail} then ${crypto.randomUUID()} else ${s.rfpInvitations.publicToken} end`,
        recipientEmail: vendor.contactEmail,
      },
    });
    const [existing] = await db.select().from(s.rfpInvitations).where(and(
      eq(s.rfpInvitations.rfpId, rfpId),
      eq(s.rfpInvitations.vendorId, vendorId),
    )).limit(1);
    const invitationId = existing!.id;
    const publicToken = existing!.publicToken;

    const outcome = await notifyRfpInvitation({
      // Each explicit send is a new attempt; any provider retry of this attempt reuses its key.
      invitationId: `${invitationId}-${crypto.randomUUID()}`,
      to: vendor.contactEmail,
      vendorName: vendor.name,
      eventTitle: event.title,
      rfpTitle: rfp.title,
      deadline: rfp.deadline?.toISOString() ?? null,
      url: `${appOrigin()}/rfp/${publicToken}`,
    });
    const deliveryError = outcome.status === "sent" ? null : outcome.reason;
    const [invitation] = await db.update(s.rfpInvitations).set({
      recipientEmail: vendor.contactEmail,
      deliveredAt: deliveryError ? null : new Date(),
      deliveryError,
    }).where(eq(s.rfpInvitations.id, invitationId)).returning();
    if (rfp.status === "draft" && !deliveryError) await db.update(s.rfps).set({ status: "sent", updatedAt: new Date() }).where(eq(s.rfps.id, rfpId));
    return map.toRfpInvitation(invitation!, vendor);
  },
};

export async function publicRfp(token: string): Promise<PublicRfpPayload | null> {
  const [row] = await db.select({ invitation: s.rfpInvitations, rfp: s.rfps, event: s.events, vendor: s.vendors })
    .from(s.rfpInvitations)
    .innerJoin(s.rfps, eq(s.rfpInvitations.rfpId, s.rfps.id))
    .innerJoin(s.events, eq(s.rfps.eventId, s.events.id))
    .innerJoin(s.vendors, eq(s.rfpInvitations.vendorId, s.vendors.id))
    .where(eq(s.rfpInvitations.publicToken, token)).limit(1);
  if (!row || row.invitation.recipientEmail !== row.vendor.contactEmail || row.rfp.status === "closed" || row.event.status === "cancelled" || row.event.status === "completed") return null;
  const [response] = await db.select().from(s.rfpResponses).where(eq(s.rfpResponses.invitationId, row.invitation.id)).limit(1);
  return {
    rfp: map.toRfp(row.rfp),
    eventTitle: row.event.title,
    vendorName: row.vendor.name,
    response: response ? map.toRfpResponse(response) : null,
  };
}

export async function publicRfpResponse(token: string, body: Body) {
  const payload = await publicRfp(token);
  if (!payload) throw new HttpError(404, "This proposal link is no longer active.");
  const [invitation] = await db.select().from(s.rfpInvitations).where(eq(s.rfpInvitations.publicToken, token)).limit(1);
  if (!invitation) throw new HttpError(404, "This proposal link is no longer active.");
  const email = optStr(body, "contactEmail")?.trim().toLowerCase() ?? invitation.recipientEmail;
  const values = {
    vendorName: payload.vendorName,
    contactName: optStr(body, "contactName"),
    contactEmail: email,
    contactPhone: optStr(body, "contactPhone"),
    quotedAmountCents: optInt(body, "quotedAmountCents"),
    notes: optStr(body, "notes"),
    status: "received",
    updatedAt: new Date(),
  } as const;
  const [existing] = await db.select().from(s.rfpResponses).where(eq(s.rfpResponses.invitationId, invitation.id)).limit(1);
  if (existing) {
    return map.toRfpResponse(existing);
  }
  const id = newId("rfpres");
  await db.insert(s.rfpResponses).values({
    id,
    workspaceId: invitation.workspaceId,
    rfpId: invitation.rfpId,
    invitationId: invitation.id,
    ...values,
  }).onConflictDoNothing({ target: s.rfpResponses.invitationId });
  const [created] = await db.select().from(s.rfpResponses).where(eq(s.rfpResponses.invitationId, invitation.id)).limit(1);
  return map.toRfpResponse(created!);
}

/* -------------------------------------------------- event-scoped resources */

/**
 * One implementation for every event subcollection. They differ only in their table, their
 * mapper, and how a body becomes a row — so that is all each entry supplies.
 */
function eventScoped<Entity>(config: {
  table: never;
  mapper: (row: never) => Entity;
  insert: (ctx: RequestContext, eventId: string, body: Body, sortOrder: number) => Record<string, unknown>;
  patch: Record<string, (body: Body) => unknown>;
  idPrefix: string;
  order?: "sortOrder" | "runOfShow" | "lotNumber" | "createdAt";
  historyResource?: HistoryResource;
  /**
   * Runs after a successful write, for side effects that must not be able to fail it —
   * notifying an assignee, for instance. Awaited so the request does not return before it
   * settles, but its own errors are swallowed by the implementer, not thrown here.
   */
  afterWrite?: (ctx: RequestContext, eventId: string, after: Entity, before: Entity | null) => Promise<void>;
  /** Validates related records and tenant ownership before create or patch. */
  beforeWrite?: (ctx: RequestContext, eventId: string, body: Body, current: Entity | null) => Promise<void>;
}) {
  const table = config.table as unknown as typeof s.checklistItems;
  const orderColumns = () => {
    switch (config.order) {
      case "runOfShow":
        return runOfShowOrderColumns();
      case "lotNumber":
        return [asc(s.auctionItems.lotNumber)];
      case "createdAt":
        return [asc(table.createdAt)];
      default:
        return [asc(table.sortOrder)];
    }
  };

  return {
    async list(ctx: RequestContext, eventId: string): Promise<Entity[]> {
      await requireOwnedEvent(ctx, eventId);
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
        .orderBy(...orderColumns());
      return rows.map((row) => config.mapper(row as never));
    },

    async create(ctx: RequestContext, eventId: string, body: Body): Promise<Entity> {
      await requireOwnedEvent(ctx, eventId);
      await config.beforeWrite?.(ctx, eventId, body, null);
      const [{ maxOrder } = { maxOrder: 0 }] = await db
        .select({ maxOrder: sql<number>`coalesce(max(${table.sortOrder}), 0)` })
        .from(table)
        .where(eq(table.eventId, eventId));

      const id = newId(config.idPrefix);
      const values: Record<string, unknown> = {
        ...config.insert(ctx, eventId, body, Number(maxOrder) + 1),
        id,
        createdAt: new Date(),
      };
      const insert = db.insert(table).values(values as never);
      if (config.historyResource) {
        await db.batch([
          insert,
          db.insert(s.eventHistory).values(
            historyValues(ctx, {
              eventId,
              resource: config.historyResource,
              resourceId: id,
              action: "created",
              before: null,
              after: config.mapper(values as never) as Record<string, unknown>,
            }),
          ),
        ]);
      } else {
        await insert;
      }
      const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
      const created = config.mapper(row as never);
      await config.afterWrite?.(ctx, eventId, created, null);
      return created;
    },

    async update(ctx: RequestContext, eventId: string, id: string, body: Body): Promise<Entity> {
      await requireOwnedEvent(ctx, eventId);
      let currentRow: typeof table.$inferSelect | null = null;
      let previous: Entity | null = null;
      if (config.beforeWrite || config.historyResource || config.afterWrite) {
        const [current] = await db
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
          .limit(1);
        if (!current) throw new HttpError(404, "That record no longer exists.");
        currentRow = current;
        previous = config.mapper(current as never);
      }
      await config.beforeWrite?.(ctx, eventId, body, previous);
      const patch = patchFrom<Record<string, unknown>>(body, config.patch);
      const updatedAt = new Date();
      const buildUpdate = () =>
        db
          .update(table)
          .set({ ...patch, updatedAt } as never)
          .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
          .returning();
      let updated;
      // The prior row is read when history needs it, and also when a post-write hook does
      // — notifying on assignment requires knowing whether the assignee actually changed.
      if (config.historyResource || config.afterWrite) {
        const current = currentRow!;
        const before = previous as Record<string, unknown>;
        [updated] = config.historyResource
          ? await db.batch([
          buildUpdate(),
          db.insert(s.eventHistory).values(
            historyValues(ctx, {
              eventId,
              resource: config.historyResource,
              resourceId: id,
              action: "updated",
              before,
              after: config.mapper({ ...current, ...patch, updatedAt } as never) as Record<string, unknown>,
            }),
          ),
        ])
          : [await buildUpdate()];
      } else {
        updated = await buildUpdate();
      }
      if (updated.length === 0) throw new HttpError(404, "That record no longer exists.");
      const after = config.mapper(updated[0] as never);
      await config.afterWrite?.(ctx, eventId, after, previous);
      return after;
    },

    async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
      await requireOwnedEvent(ctx, eventId);
      const remove = db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
        .returning({ id: table.id });
      let deleted;
      if (config.historyResource) {
        const [current] = await db
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
          .limit(1);
        if (!current) throw new HttpError(404, "That record no longer exists.");
        [deleted] = await db.batch([
          remove,
          db.insert(s.eventHistory).values(
            historyValues(ctx, {
              eventId,
              resource: config.historyResource,
              resourceId: id,
              action: "deleted",
              before: config.mapper(current as never) as Record<string, unknown>,
              after: null,
            }),
          ),
        ]);
      } else {
        deleted = await remove;
      }
      if (deleted.length === 0) throw new HttpError(404, "That record no longer exists.");
    },
  };
}

const scope = (ctx: RequestContext, eventId: string) => ({ workspaceId: ctx.workspaceId, eventId });

const optionalEmail = (body: Body, key: string): string | null => {
  const email = labelFrom(body, key, 320)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, `${key} must be a valid email address.`);
  }
  return email;
};

async function createAssignmentAccess(
  ctx: RequestContext,
  eventId: string,
  assignment: { kind: "checklist" | "run-of-show" | "volunteer"; id: string; email: string },
): Promise<string> {
  const token = `assignment_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.insert(s.eventHistory).values({
    id: newId("hist"),
    workspaceId: ctx.workspaceId,
    eventId,
    actorId: ctx.userId,
    resource: "assignment-link",
    resourceId: token,
    action: "created",
    summary: "Created a secure assignment link",
    before: null,
    after: { kind: assignment.kind, assignmentId: assignment.id, email: assignment.email },
  });
  return `${appOrigin()}/assignment/${token}`;
}

export const checklist = eventScoped({
  table: s.checklistItems as never,
  mapper: map.toChecklistItem as never,
  idPrefix: "cl",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    title: str(body, "title"),
    description: optStr(body, "description"),
    completed: Boolean(body.completed),
    dueDate: parseOptionalDate(body.dueDate, "dueDate"),
    assignedTo: optStr(body, "assignedTo"),
    assignedEmail: optionalEmail(body, "assignedEmail"),
    vendorId: optStr(body, "vendorId"),
    category: str(body, "category", "General"),
    sortOrder,
  }),
  patch: {
    title: (b) => str(b, "title"),
    description: (b) => optStr(b, "description"),
    completed: (b) => Boolean(b.completed),
    dueDate: (b) => parseOptionalDate(b.dueDate, "dueDate"),
    assignedTo: (b) => optStr(b, "assignedTo"),
    assignedEmail: (b) => optionalEmail(b, "assignedEmail"),
    vendorId: (b) => optStr(b, "vendorId"),
    category: (b) => str(b, "category", "General"),
    sortOrder: (b) => optInt(b, "sortOrder") ?? 0,
  },
  beforeWrite: async (ctx, _eventId, body) => {
    if (!("vendorId" in body) || body.vendorId === null || body.vendorId === "") return;
    const vendorId = str(body, "vendorId");
    const [vendor] = await db.select({ id: s.vendors.id }).from(s.vendors).where(and(
      eq(s.vendors.id, vendorId),
      eq(s.vendors.workspaceId, ctx.workspaceId),
    )).limit(1);
    if (!vendor) throw new HttpError(400, "That vendor is not available in this workspace.");
  },

});

export const checkInStations = eventScoped({
  table: s.checkInStations as never,
  mapper: map.toCheckInStation as never,
  idPrefix: "station",
  historyResource: "check-in-station",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    name: labelFrom(body, "name", 80) ?? str(body, "name"),
    lane: labelFrom(body, "lane", 120) ?? str(body, "lane"),
    leadVolunteerId: optStr(body, "leadVolunteerId"),
    lead: labelFrom(body, "lead", 120),
    deviceCount: Math.max(0, optInt(body, "deviceCount") ?? 1),
    notes: labelFrom(body, "notes", 500),
    sortOrder,
  }),
  patch: {
    name: (b) => labelFrom(b, "name", 80) ?? str(b, "name"),
    lane: (b) => labelFrom(b, "lane", 120) ?? str(b, "lane"),
    leadVolunteerId: (b) => optStr(b, "leadVolunteerId"),
    lead: (b) => labelFrom(b, "lead", 120),
    deviceCount: (b) => Math.max(0, optInt(b, "deviceCount") ?? 0),
    notes: (b) => labelFrom(b, "notes", 500),
    sortOrder: (b) => optInt(b, "sortOrder") ?? 0,
  },
  beforeWrite: async (ctx, eventId, body, current) => {
    const station = current as CheckInStation | null;
    const volunteerId = "leadVolunteerId" in body ? optStr(body, "leadVolunteerId") : station?.leadVolunteerId;
    if (!volunteerId) {
      if ("leadVolunteerId" in body) body.lead = null;
      return;
    }
    const [volunteer] = await db.select({ id: s.volunteerShifts.id, name: s.volunteerShifts.name }).from(s.volunteerShifts).where(and(
      eq(s.volunteerShifts.id, volunteerId),
      eq(s.volunteerShifts.eventId, eventId),
      eq(s.volunteerShifts.workspaceId, ctx.workspaceId),
      sql`${s.volunteerShifts.status} <> 'cancelled'`,
    )).limit(1);
    if (!volunteer) throw new HttpError(400, "That volunteer is not available for this event.");
    body.leadVolunteerId = volunteer.id;
    body.lead = volunteer.name;
  },
});

export const runOfShow = eventScoped({
  table: s.runOfShowItems as never,
  mapper: map.toRunOfShowItem as never,
  idPrefix: "ros",
  historyResource: "run-of-show",
  order: "runOfShow",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    dayNumber: positiveInt(body, "dayNumber"),
    startTime: str(body, "startTime"),
    durationMinutes: optInt(body, "duration"),
    title: str(body, "title"),
    description: optStr(body, "description"),
    responsible: optStr(body, "responsible"),
    assignedEmail: optionalEmail(body, "assignedEmail"),
    completed: Boolean(body.completed),
    sortOrder,
  }),
  patch: {
    dayNumber: (b) => positiveInt(b, "dayNumber"),
    startTime: (b) => str(b, "startTime"),
    durationMinutes: (b) => optInt(b, "duration"),
    title: (b) => str(b, "title"),
    description: (b) => optStr(b, "description"),
    responsible: (b) => optStr(b, "responsible"),
    assignedEmail: (b) => optionalEmail(b, "assignedEmail"),
    completed: (b) => Boolean(b.completed),
  },
});

const localTime = (body: Body, key: string): string => {
  const value = str(body, key).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, `${key} must use HH:mm.`);
  return value;
};

const volunteerStatus = (body: Body): VolunteerShift["status"] => {
  const value = str(body, "status", "scheduled");
  if (!(VOLUNTEER_STATUSES as readonly string[]).includes(value)) {
    throw new HttpError(400, `status must be one of ${VOLUNTEER_STATUSES.join(", ")}.`);
  }
  return value as VolunteerShift["status"];
};

const volunteerDayNumber = (body: Body): number => {
  const value = body.dayNumber;
  if (value === null || value === undefined || value === "") return 1;
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) throw new HttpError(400, "dayNumber must be a whole number from 1 to 365.");
  const parsed = Number(text);
  if (parsed < 1 || parsed > 365) throw new HttpError(400, "dayNumber must be a whole number from 1 to 365.");
  return parsed;
};

export const volunteerNeeds = eventScoped({
  table: s.volunteerNeeds as never,
  mapper: map.toVolunteerNeed as never,
  idPrefix: "vneed",
  order: "sortOrder",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    dayNumber: volunteerDayNumber(body),
    role: labelFrom(body, "role", 120) ?? str(body, "role"),
    startTime: localTime(body, "startTime"),
    endTime: localTime(body, "endTime"),
    requiredCount: Math.min(500, positiveInt(body, "requiredCount")),
    notes: labelFrom(body, "notes", 1_000),
    signupOpen: body.signupOpen === undefined ? true : Boolean(body.signupOpen),
    sortOrder,
  }),
  patch: {
    dayNumber: (b) => volunteerDayNumber(b),
    role: (b) => labelFrom(b, "role", 120) ?? str(b, "role"),
    startTime: (b) => localTime(b, "startTime"),
    endTime: (b) => localTime(b, "endTime"),
    requiredCount: (b) => Math.min(500, positiveInt(b, "requiredCount")),
    notes: (b) => labelFrom(b, "notes", 1_000),
    signupOpen: (b) => Boolean(b.signupOpen),
    sortOrder: (b) => optInt(b, "sortOrder") ?? 0,
  },
});

export const volunteers = eventScoped({
  table: s.volunteerShifts as never,
  mapper: map.toVolunteerShift as never,
  idPrefix: "vol",
  historyResource: "volunteer",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    needId: optStr(body, "needId"),
    dayNumber: volunteerDayNumber(body),
    name: labelFrom(body, "name", 120) ?? str(body, "name"),
    email: optionalEmail(body, "email"),
    phone: labelFrom(body, "phone", 60),
    role: labelFrom(body, "role", 120) ?? str(body, "role"),
    startTime: localTime(body, "startTime"),
    endTime: localTime(body, "endTime"),
    status: volunteerStatus(body),
    notes: labelFrom(body, "notes", 1_000),
    sortOrder,
  }),
  patch: {
    needId: (b) => optStr(b, "needId"),
    dayNumber: (b) => volunteerDayNumber(b),
    name: (b) => labelFrom(b, "name", 120) ?? str(b, "name"),
    email: (b) => optionalEmail(b, "email"),
    phone: (b) => labelFrom(b, "phone", 60),
    role: (b) => labelFrom(b, "role", 120) ?? str(b, "role"),
    startTime: (b) => localTime(b, "startTime"),
    endTime: (b) => localTime(b, "endTime"),
    status: (b) => volunteerStatus(b),
    notes: (b) => labelFrom(b, "notes", 1_000),
    sortOrder: (b) => optInt(b, "sortOrder") ?? 0,
  },
  beforeWrite: async (ctx, eventId, body, current) => {
    const currentShift = current as VolunteerShift | null;
    const effectiveNeedId = "needId" in body ? optStr(body, "needId") : currentShift?.needId;
    if (!effectiveNeedId) return;
    const [need] = await db.select().from(s.volunteerNeeds).where(and(
      eq(s.volunteerNeeds.id, effectiveNeedId),
      eq(s.volunteerNeeds.eventId, eventId),
      eq(s.volunteerNeeds.workspaceId, ctx.workspaceId),
    )).limit(1);
    if (!need) throw new HttpError(400, "That staffing requirement is not available for this event.");
    body.needId = need.id;
    body.dayNumber = need.dayNumber;
    body.role = need.role;
    body.startTime = need.startTime;
    body.endTime = need.endTime;
  },
});

export const budget = eventScoped({
  table: s.budgetItems as never,
  mapper: map.toBudgetItem as never,
  idPrefix: "bud",
  historyResource: "budget",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    name: str(body, "name"),
    category: str(body, "category", "General"),
    type: str(body, "type"),
    estimatedCents: optInt(body, "estimatedCents") ?? 0,
    actualCents: optInt(body, "actualCents"),
    notes: optStr(body, "notes"),
    sortOrder,
  }),
  patch: {
    name: (b) => str(b, "name"),
    category: (b) => str(b, "category", "General"),
    type: (b) => str(b, "type"),
    estimatedCents: (b) => optInt(b, "estimatedCents") ?? 0,
    actualCents: (b) => optInt(b, "actualCents"),
    notes: (b) => optStr(b, "notes"),
  },
});

export const menu = eventScoped({
  table: s.menuItems as never,
  mapper: map.toMenuItem as never,
  idPrefix: "menu",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    name: str(body, "name"),
    description: optStr(body, "description"),
    course: str(body, "course", "Main"),
    dietaryTags: Array.isArray(body.dietaryTags) ? body.dietaryTags : [],
    priceCents: optInt(body, "priceCents"),
    serves: optInt(body, "serves"),
    notes: optStr(body, "notes"),
    sortOrder,
  }),
  patch: {
    name: (b) => str(b, "name"),
    description: (b) => optStr(b, "description"),
    course: (b) => str(b, "course", "Main"),
    dietaryTags: (b) => (Array.isArray(b.dietaryTags) ? b.dietaryTags : []),
    priceCents: (b) => optInt(b, "priceCents"),
    serves: (b) => optInt(b, "serves"),
    notes: (b) => optStr(b, "notes"),
  },
});

export const moodBoard = eventScoped({
  table: s.moodBoardImages as never,
  mapper: map.toMoodBoardImage as never,
  idPrefix: "insp",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    url: str(body, "url"),
    caption: optStr(body, "caption"),
    sortOrder,
  }),
  patch: { caption: (b) => optStr(b, "caption"), sortOrder: (b) => optInt(b, "sortOrder") ?? 0 },
});

export const auction = eventScoped({
  table: s.auctionItems as never,
  mapper: map.toAuctionItem as never,
  idPrefix: "auc",
  order: "lotNumber",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    title: str(body, "title"),
    description: optStr(body, "description"),
    imageUrl: optStr(body, "imageUrl"),
    startingBidCents: optInt(body, "startingBidCents"),
    currentBidCents: optInt(body, "currentBidCents"),
    fairMarketValueCents: optInt(body, "fairMarketValueCents"),
    winnerName: optStr(body, "winnerName"),
    donorName: optStr(body, "donorName"),
    paymentMethod: optStr(body, "paymentMethod"),
    paymentLink: optStr(body, "paymentLink"),
    status: str(body, "status", "open"),
    auctionType: str(body, "auctionType", "silent"),
    lotNumber: optInt(body, "lotNumber"),
    sortOrder,
  }),
  patch: {
    title: (b) => str(b, "title"),
    description: (b) => optStr(b, "description"),
    startingBidCents: (b) => optInt(b, "startingBidCents"),
    currentBidCents: (b) => optInt(b, "currentBidCents"),
    fairMarketValueCents: (b) => optInt(b, "fairMarketValueCents"),
    winnerName: (b) => optStr(b, "winnerName"),
    donorName: (b) => optStr(b, "donorName"),
    paymentMethod: (b) => optStr(b, "paymentMethod"),
    paymentLink: (b) => optStr(b, "paymentLink"),
    status: (b) => str(b, "status", "open"),
    auctionType: (b) => str(b, "auctionType", "silent"),
    lotNumber: (b) => optInt(b, "lotNumber"),
  },
});

export const sponsorships = eventScoped({
  table: s.sponsorships as never,
  mapper: map.toSponsorship as never,
  idPrefix: "spo",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    companyName: str(body, "companyName"),
    tier: str(body, "tier", "custom"),
    amountCents: optInt(body, "amountCents"),
    logoUrl: optStr(body, "logoUrl"),
    contactEmail: optStr(body, "contactEmail"),
    contactName: optStr(body, "contactName"),
    notes: optStr(body, "notes"),
    status: str(body, "status", "pending"),
    sortOrder,
  }),
  patch: {
    companyName: (b) => str(b, "companyName"),
    tier: (b) => str(b, "tier", "custom"),
    amountCents: (b) => optInt(b, "amountCents"),
    contactEmail: (b) => optStr(b, "contactEmail"),
    contactName: (b) => optStr(b, "contactName"),
    notes: (b) => optStr(b, "notes"),
    status: (b) => str(b, "status", "pending"),
  },
});

export const eventVendors = {
  async list(ctx: RequestContext, eventId: string) {
    const rows = await db
      .select({ booking: s.eventVendors, vendor: s.vendors })
      .from(s.eventVendors)
      .leftJoin(s.vendors, eq(s.eventVendors.vendorId, s.vendors.id))
      .where(and(eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId)))
      .orderBy(asc(s.eventVendors.createdAt));
    return rows.map((row) => map.toEventVendor(row.booking, row.vendor));
  },
  async create(ctx: RequestContext, eventId: string, body: Body) {
    await requireOwnedEvent(ctx, eventId);
    const id = newId("ev");
    const values = {
      id,
      workspaceId: ctx.workspaceId,
      eventId,
      vendorId: str(body, "vendorId"),
      status: (optStr(body, "status") ?? "pending") as "pending",
      feeCents: optInt(body, "feeCents"),
      notes: optStr(body, "notes"),
      createdAt: new Date(),
      updatedAt: null,
    };
    try {
      await db.batch([
        db.insert(s.eventVendors).values(values),
        db.insert(s.eventHistory).values(
          historyValues(ctx, {
            eventId,
            resource: "vendor-booking",
            resourceId: id,
            action: "created",
            before: null,
            after: map.toEventVendor(values, null) as unknown as Record<string, unknown>,
          }),
        ),
      ]);
    } catch (error) {
      if (isConstraintViolation(error, "event_vendors_event_vendor_idx")) {
        throw new HttpError(409, "That vendor is already booked on this event.");
      }
      throw error;
    }
    const all = await eventVendors.list(ctx, eventId);
    return all.find((row) => row.id === id)!;
  },
  async update(ctx: RequestContext, eventId: string, id: string, body: Body) {
    const [current] = await db
      .select()
      .from(s.eventVendors)
      .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId)))
      .limit(1);
    if (!current) throw new HttpError(404, "That booking no longer exists.");
    const patch = patchFrom<Record<string, unknown>>(body, {
      status: (b) => optStr(b, "status") ?? "pending",
      feeCents: (b) => optInt(b, "feeCents"),
      notes: (b) => optStr(b, "notes"),
    });
    const updatedAt = new Date();
    const [updated] = await db.batch([
      db
        .update(s.eventVendors)
        .set({ ...patch, updatedAt })
        .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId)))
        .returning({ id: s.eventVendors.id }),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId,
          resource: "vendor-booking",
          resourceId: id,
          action: "updated",
          before: map.toEventVendor(current, null) as unknown as Record<string, unknown>,
          after: map.toEventVendor({ ...current, ...patch, updatedAt }, null) as unknown as Record<string, unknown>,
        }),
      ),
    ]);
    if (updated.length === 0) throw new HttpError(404, "That booking no longer exists.");
    const all = await eventVendors.list(ctx, eventId);
    return all.find((row) => row.id === id)!;
  },
  async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
    const [current] = await db
      .select()
      .from(s.eventVendors)
      .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId)))
      .limit(1);
    if (!current) throw new HttpError(404, "That booking no longer exists.");
    await db.batch([
      db
        .delete(s.eventVendors)
        .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId))),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId,
          resource: "vendor-booking",
          resourceId: id,
          action: "deleted",
          before: map.toEventVendor(current, null) as unknown as Record<string, unknown>,
          after: null,
        }),
      ),
    ]);
  },
};

/* ----------------------------------------------------------------- tickets */

export const tickets = {
  async list(ctx: RequestContext, eventId: string) {
    const rows = await db
      .select()
      .from(s.ticketTypes)
      .where(and(eq(s.ticketTypes.workspaceId, ctx.workspaceId), eq(s.ticketTypes.eventId, eventId)))
      .orderBy(asc(s.ticketTypes.sortOrder));
    return rows.map(map.toTicketType);
  },

  async listAll(ctx: RequestContext): Promise<TicketTypeWithEvent[]> {
    const rows = await db
      .select({ ticket: s.ticketTypes, event: s.events })
      .from(s.ticketTypes)
      .innerJoin(s.events, eq(s.ticketTypes.eventId, s.events.id))
      .where(eq(s.ticketTypes.workspaceId, ctx.workspaceId))
      .orderBy(asc(s.events.startsAt), asc(s.ticketTypes.sortOrder));
    return rows.map((row) => ({
      ...map.toTicketType(row.ticket),
      eventTitle: row.event.title,
      eventDate: row.event.startsAt.toISOString(),
      eventStatus: row.event.status,
      eventCategory: row.event.category,
    }));
  },

  async create(ctx: RequestContext, eventId: string, body: Body) {
    const [{ maxOrder } = { maxOrder: 0 }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${s.ticketTypes.sortOrder}), 0)` })
      .from(s.ticketTypes)
      .where(eq(s.ticketTypes.eventId, eventId));
    const id = newId("tt");
    await db.insert(s.ticketTypes).values({
      id,
      workspaceId: ctx.workspaceId,
      eventId,
      name: str(body, "name"),
      description: optStr(body, "description"),
      priceCents: optInt(body, "priceCents") ?? 0,
      quantityTotal: optInt(body, "quantityTotal") ?? 0,
      isActive: optBool(body, "isActive") ?? true,
      sortOrder: Number(maxOrder) + 1,
    });
    const [row] = await db.select().from(s.ticketTypes).where(eq(s.ticketTypes.id, id)).limit(1);
    return map.toTicketType(row!);
  },

  async update(ctx: RequestContext, eventId: string, id: string, body: Body) {
    const [current] = await db
      .select()
      .from(s.ticketTypes)
      .where(and(eq(s.ticketTypes.id, id), eq(s.ticketTypes.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!current) throw new HttpError(404, "That ticket type no longer exists.");

    const nextTotal = "quantityTotal" in body ? (optInt(body, "quantityTotal") ?? 0) : current.quantityTotal;
    if (nextTotal !== 0 && nextTotal < current.quantitySold) {
      throw new HttpError(409, `${current.quantitySold} of these are already sold — the allocation can't go below that.`);
    }

    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      description: (b) => optStr(b, "description"),
      priceCents: (b) => optInt(b, "priceCents") ?? 0,
      quantityTotal: (b) => optInt(b, "quantityTotal") ?? 0,
      isActive: (b) => Boolean(b.isActive),
    });
    const updated = await db
      .update(s.ticketTypes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(s.ticketTypes.id, id))
      .returning();
    return map.toTicketType(updated[0]!);
  },

  async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
    await db
      .delete(s.ticketTypes)
      .where(and(eq(s.ticketTypes.id, id), eq(s.ticketTypes.workspaceId, ctx.workspaceId), eq(s.ticketTypes.eventId, eventId)));
  },
};

/* ------------------------------------------------------------------ raffle */

export const raffle = {
  async list(ctx: RequestContext, eventId: string) {
    const rows = await db
      .select()
      .from(s.raffleItems)
      .where(and(eq(s.raffleItems.workspaceId, ctx.workspaceId), eq(s.raffleItems.eventId, eventId)))
      .orderBy(asc(s.raffleItems.createdAt));
    return rows.map(map.toRaffleItem);
  },
  async create(ctx: RequestContext, eventId: string, body: Body) {
    const id = newId("raf");
    await db.insert(s.raffleItems).values({
      id,
      workspaceId: ctx.workspaceId,
      eventId,
      name: str(body, "name"),
      description: optStr(body, "description"),
      imageUrl: optStr(body, "imageUrl"),
      ticketPriceCents: optInt(body, "ticketPriceCents") ?? 0,
      totalTickets: optInt(body, "totalTickets") ?? 0,
    });
    const [row] = await db.select().from(s.raffleItems).where(eq(s.raffleItems.id, id)).limit(1);
    return map.toRaffleItem(row!);
  },
  async update(ctx: RequestContext, eventId: string, id: string, body: Body) {
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      description: (b) => optStr(b, "description"),
      ticketPriceCents: (b) => optInt(b, "ticketPriceCents") ?? 0,
      totalTickets: (b) => optInt(b, "totalTickets") ?? 0,
      status: (b) => str(b, "status", "open"),
    });
    const updated = await db
      .update(s.raffleItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.raffleItems.id, id), eq(s.raffleItems.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That raffle no longer exists.");
    return map.toRaffleItem(updated[0]!);
  },
  async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
    await db
      .delete(s.raffleItems)
      .where(and(eq(s.raffleItems.id, id), eq(s.raffleItems.workspaceId, ctx.workspaceId), eq(s.raffleItems.eventId, eventId)));
  },
  async listTickets(ctx: RequestContext, eventId: string, raffleItemId: string) {
    const rows = await db
      .select()
      .from(s.raffleTickets)
      .where(and(eq(s.raffleTickets.workspaceId, ctx.workspaceId), eq(s.raffleTickets.raffleItemId, raffleItemId)))
      .orderBy(desc(s.raffleTickets.createdAt));
    return rows.map(map.toRaffleTicket);
  },

  async sellTickets(ctx: RequestContext, eventId: string, raffleItemId: string, body: Body) {
    const quantity = optInt(body, "quantity") ?? 1;
    const id = newId("rt");

    // One statement, so the remaining-allocation check and the increment cannot be split
    // by a concurrent sale. `sold_tickets` only moves if there is room.
    const [updated] = await db
      .update(s.raffleItems)
      .set({ soldTickets: sql`${s.raffleItems.soldTickets} + ${quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(s.raffleItems.id, raffleItemId),
          eq(s.raffleItems.workspaceId, ctx.workspaceId),
          eq(s.raffleItems.status, "open"),
          or(
            eq(s.raffleItems.totalTickets, 0),
            sql`${s.raffleItems.soldTickets} + ${quantity} <= ${s.raffleItems.totalTickets}`,
          )!,
        ),
      )
      .returning();

    if (!updated) {
      const [item] = await db.select().from(s.raffleItems).where(eq(s.raffleItems.id, raffleItemId)).limit(1);
      if (!item) throw new HttpError(404, "That raffle no longer exists.");
      if (item.status !== "open") throw new HttpError(409, `${item.name} is closed.`);
      const remaining = item.totalTickets === 0 ? Infinity : item.totalTickets - item.soldTickets;
      throw new HttpError(409, `Only ${remaining} tickets left for ${item.name}.`);
    }

    await db.insert(s.raffleTickets).values({
      id,
      workspaceId: ctx.workspaceId,
      eventId,
      raffleItemId,
      buyerName: str(body, "buyerName"),
      buyerEmail: str(body, "buyerEmail"),
      quantity,
    });
    const [row] = await db.select().from(s.raffleTickets).where(eq(s.raffleTickets.id, id)).limit(1);
    return map.toRaffleTicket(row!);
  },

  async draw(ctx: RequestContext, eventId: string, raffleItemId: string) {
    const entries = await db
      .select()
      .from(s.raffleTickets)
      .where(and(eq(s.raffleTickets.workspaceId, ctx.workspaceId), eq(s.raffleTickets.raffleItemId, raffleItemId)));
    if (entries.length === 0) throw new HttpError(409, "No tickets have been sold yet.");

    // Weighted by quantity: ten tickets is ten chances, not one.
    const pool = entries.flatMap((entry) => Array.from({ length: entry.quantity }, () => entry));
    const winner = pool[Math.floor(Math.random() * pool.length)]!;

    const updated = await db
      .update(s.raffleItems)
      .set({
        winnerName: winner.buyerName,
        winnerEmail: winner.buyerEmail,
        winnerTicketId: winner.id,
        drawnAt: new Date(),
        status: "drawn",
        updatedAt: new Date(),
      })
      .where(and(eq(s.raffleItems.id, raffleItemId), eq(s.raffleItems.workspaceId, ctx.workspaceId)))
      .returning();
    return map.toRaffleItem(updated[0]!);
  },
};

/* -------------------------------------------------- templates, boards, misc */

export const templates = {
  async list(ctx: RequestContext) {
    const rows = await db
      .select()
      .from(s.templates)
      .where(eq(s.templates.workspaceId, ctx.workspaceId))
      .orderBy(asc(s.templates.name));
    return rows.map(map.toTemplate);
  },
  async get(ctx: RequestContext, id: string) {
    const [row] = await db
      .select()
      .from(s.templates)
      .where(and(eq(s.templates.id, id), eq(s.templates.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!row) return null;
    return { ...map.toTemplate(row), ...map.toTemplateContents(row) };
  },
  async create(ctx: RequestContext, body: Body) {
    const id = newId("tpl");
    await db.insert(s.templates).values({
      id,
      workspaceId: ctx.workspaceId,
      name: str(body, "name"),
      description: optStr(body, "description"),
      category: str(body, "category", "Other"),
      defaultCapacity: optInt(body, "defaultCapacity"),
    });
    return (await templates.get(ctx, id))!;
  },
  async update(ctx: RequestContext, id: string, body: Body) {
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      description: (b) => optStr(b, "description"),
      category: (b) => str(b, "category", "Other"),
      defaultCapacity: (b) => optInt(b, "defaultCapacity"),
    });
    const updated = await db
      .update(s.templates)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.templates.id, id), eq(s.templates.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That template no longer exists.");
    return map.toTemplate(updated[0]!);
  },
  async replaceContents(ctx: RequestContext, id: string, contents: TemplateContents) {
    const updated = await db
      .update(s.templates)
      .set({ contents, updatedAt: new Date() })
      .where(and(eq(s.templates.id, id), eq(s.templates.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That template no longer exists.");
    return { ...map.toTemplate(updated[0]!), ...map.toTemplateContents(updated[0]!) };
  },
  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    await db.delete(s.templates).where(and(eq(s.templates.id, id), eq(s.templates.workspaceId, ctx.workspaceId)));
  },
};

export const canvases = {
  async list(ctx: RequestContext): Promise<Canvas[]> {
    const rows = await db
      .select()
      .from(s.canvases)
      .where(eq(s.canvases.workspaceId, ctx.workspaceId))
      .orderBy(desc(s.canvases.createdAt));
    return rows.map(map.toCanvas);
  },
  async get(ctx: RequestContext, id: string): Promise<Canvas | null> {
    const [row] = await db
      .select()
      .from(s.canvases)
      .where(and(eq(s.canvases.id, id), eq(s.canvases.workspaceId, ctx.workspaceId)))
      .limit(1);
    return row ? map.toCanvas(row) : null;
  },
  async create(ctx: RequestContext, body: Body): Promise<Canvas> {
    const id = newId("cvs");
    await db.insert(s.canvases).values({
      id,
      workspaceId: ctx.workspaceId,
      name: str(body, "name"),
      description: optStr(body, "description"),
      eventId: optStr(body, "eventId"),
    });
    return (await canvases.get(ctx, id))!;
  },
  async update(ctx: RequestContext, id: string, body: Body): Promise<Canvas> {
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      description: (b) => optStr(b, "description"),
      eventId: (b) => optStr(b, "eventId"),
    });
    const updated = await db
      .update(s.canvases)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.canvases.id, id), eq(s.canvases.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That board no longer exists.");
    return map.toCanvas(updated[0]!);
  },
  async replaceCards(ctx: RequestContext, id: string, cards: CanvasCard[]): Promise<Canvas> {
    const updated = await db
      .update(s.canvases)
      .set({ cards, updatedAt: new Date() })
      .where(and(eq(s.canvases.id, id), eq(s.canvases.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That board no longer exists.");
    return map.toCanvas(updated[0]!);
  },
  async remove(ctx: RequestContext, id: string): Promise<void> {
    await db.delete(s.canvases).where(and(eq(s.canvases.id, id), eq(s.canvases.workspaceId, ctx.workspaceId)));
  },
};

/** The event context a floorplan history entry carries, so the plan can be read back. */
async function floorplanContext(ctx: RequestContext, eventId: string) {
  const event = await events.get(ctx, eventId);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  return {
    locationId: event.locationId,
    location: event.location,
    guestCount: event.registrationCount,
    capacity: event.capacity,
  };
}

async function ownedFloorplan(ctx: RequestContext, id: string) {
  const [row] = await db
    .select()
    .from(s.floorplans)
    .where(and(eq(s.floorplans.id, id), eq(s.floorplans.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw new HttpError(404, "That floorplan no longer exists.");
  requireEventAccess(ctx, row.eventId);
  return row;
}

export const floorplan = {
  async list(ctx: RequestContext, eventId: string): Promise<Floorplan[]> {
    await requireOwnedEvent(ctx, eventId);
    const rows = await db
      .select()
      .from(s.floorplans)
      .where(and(eq(s.floorplans.eventId, eventId), eq(s.floorplans.workspaceId, ctx.workspaceId)))
      .orderBy(asc(s.floorplans.createdAt));
    return rows.map(map.toFloorplan);
  },

  async create(ctx: RequestContext, eventId: string, draft: FloorplanDraft): Promise<Floorplan> {
    const context = await floorplanContext(ctx, eventId);
    const id = newId("fp");
    const updatedAt = new Date();
    const stored = writeStoredFloorplan(draft);
    const [saved] = await db.batch([
      db
        .insert(s.floorplans)
        .values({ id, eventId, workspaceId: ctx.workspaceId, name: draft.name, items: stored, updatedAt })
        .returning(),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId,
          resource: "floorplan",
          resourceId: id,
          action: "created",
          before: null,
          after: { id, eventId, ...draft, updatedAt: updatedAt.toISOString(), ...context },
        }),
      ),
    ]);
    return map.toFloorplan(saved[0]!);
  },

  async save(ctx: RequestContext, id: string, draft: FloorplanDraft): Promise<Floorplan> {
    const before = await ownedFloorplan(ctx, id);
    const context = await floorplanContext(ctx, before.eventId);
    const updatedAt = new Date();
    const stored = writeStoredFloorplan(draft);
    const [saved] = await db.batch([
      db
        .update(s.floorplans)
        .set({ name: draft.name, items: stored, updatedAt })
        .where(and(eq(s.floorplans.id, id), eq(s.floorplans.workspaceId, ctx.workspaceId)))
        .returning(),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId: before.eventId,
          resource: "floorplan",
          resourceId: id,
          action: "updated",
          before: map.toFloorplan(before) as unknown as Record<string, unknown>,
          after: { id, eventId: before.eventId, ...draft, updatedAt: updatedAt.toISOString(), ...context },
        }),
      ),
    ]);
    return map.toFloorplan(saved[0]!);
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const before = await ownedFloorplan(ctx, id);
    await db.batch([
      db.delete(s.floorplans).where(and(eq(s.floorplans.id, id), eq(s.floorplans.workspaceId, ctx.workspaceId))),
      db.insert(s.eventHistory).values(
        historyValues(ctx, {
          eventId: before.eventId,
          resource: "floorplan",
          resourceId: id,
          action: "deleted",
          before: map.toFloorplan(before) as unknown as Record<string, unknown>,
          after: null,
        }),
      ),
    ]);
  },
};

/* ----------------------------------------------------------------- members */

/**
 * Who can do what in this workspace.
 *
 * Only an owner changes roles or removes people — the "super admin" of the request. An
 * owner cannot demote or remove the last owner, because a workspace nobody can administer
 * is unrecoverable without support.
 */
export const members = {
  /** Everyone with a seat: those who have signed in, and those still holding an invite. */
  async list(ctx: RequestContext): Promise<WorkspaceMember[]> {
    const [rows, invites] = await Promise.all([
      db
        .select({ member: s.workspaceMembers, eventScopeTitle: s.events.title })
        .from(s.workspaceMembers)
        .leftJoin(s.events, eq(s.workspaceMembers.eventScopeId, s.events.id))
        .where(eq(s.workspaceMembers.workspaceId, ctx.workspaceId))
        .orderBy(asc(s.workspaceMembers.createdAt)),
      db
        .select({ invite: s.workspaceInvites, eventScopeTitle: s.events.title })
        .from(s.workspaceInvites)
        .leftJoin(s.events, eq(s.workspaceInvites.eventScopeId, s.events.id))
        .where(and(eq(s.workspaceInvites.workspaceId, ctx.workspaceId), isNull(s.workspaceInvites.acceptedAt)))
        .orderBy(asc(s.workspaceInvites.createdAt)),
    ]);

    // One call for the whole page rather than one per member.
    const directory = await lookupUsers(rows.map((row) => row.member.userId));
    const active: WorkspaceMember[] = rows.map((row) => ({
      userId: row.member.userId,
      role: row.member.role,
      status: "active",
      name: directory.get(row.member.userId)?.name ?? null,
      email: directory.get(row.member.userId)?.email ?? null,
      isSelf: row.member.userId === ctx.userId,
      joinedAt: row.member.createdAt.toISOString(),
      eventScopeId: row.member.eventScopeId,
      eventScopeTitle: row.eventScopeTitle,
    }));

    const pending: WorkspaceMember[] = invites.map(({ invite, eventScopeTitle }) => ({
      userId: null,
      role: invite.role,
      status: "invited",
      name: null,
      email: invite.email,
      isSelf: false,
      joinedAt: invite.createdAt.toISOString(),
      eventScopeId: invite.eventScopeId,
      eventScopeTitle,
    }));

    return [...active, ...pending];
  },

  /**
   * Grants someone a seat before they have ever signed in.
   *
   * The invite is what lets them through the door *and* what puts them in this workspace
   * with the intended role. Without it a new address is refused outright, and an address
   * that is somehow let through lands in a fresh empty workspace of its own.
   */
  async invite(
    ctx: RequestContext,
    rawEmail: string,
    role: string,
    rawEventScopeId?: string | null,
  ): Promise<InviteResult> {
    requireRole(ctx, ["owner"]);
    requireWorkspaceAccess(ctx);
    const email = rawEmail.trim().toLowerCase();
    const eventScopeId = rawEventScopeId?.trim() || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That is not a valid email address.");
    if (!(WORKSPACE_ROLES as readonly string[]).includes(role)) {
      throw new HttpError(400, `role must be one of ${WORKSPACE_ROLES.join(", ")}.`);
    }
    if (eventScopeId) {
      if (role !== "member") throw new HttpError(400, "Event collaborators must use the member role.");
      await requireOwnedEvent(ctx, eventScopeId);
    }

    const [existing] = await db
      .select()
      .from(s.workspaceInvites)
      .where(eq(s.workspaceInvites.email, email))
      .limit(1);
    if (existing && existing.acceptedAt === null) {
      if (existing.workspaceId !== ctx.workspaceId) {
        throw new HttpError(409, "That address already has a pending invite to another workspace.");
      }
      // Re-inviting is how the role on an unclaimed seat is corrected.
      const [updated] = await db
        .update(s.workspaceInvites)
        .set({ role: role as "member", eventScopeId })
        .where(eq(s.workspaceInvites.id, existing.id))
        .returning();
      return {
        member: {
          userId: null,
          role: updated!.role,
          status: "invited",
          name: null,
          email,
          isSelf: false,
          joinedAt: updated!.createdAt.toISOString(),
          eventScopeId: updated!.eventScopeId,
          eventScopeTitle: eventScopeId ? (await events.get(ctx, eventScopeId))?.title ?? null : null,
        },
        // Re-inviting corrects a role on a seat already offered; mailing them again to
        // say so would be noise.
        emailSent: false,
      };
    }
    if (existing) throw new HttpError(409, "That address has already joined a workspace.");

    const inviteId = newId("inv");
    const entitlementLock = db
      .select({ locked: sql<number>`pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))` })
      .from(s.workspaces)
      .where(eq(s.workspaces.id, ctx.workspaceId))
      .limit(1);
    const inviteInsert = db
      .insert(s.workspaceInvites)
      .select(
        db
          .select(workspaceInviteInsertSelection(inviteId, email, role as "owner" | "admin" | "member", eventScopeId, ctx.userId))
          .from(s.workspaces)
          .where(
            and(
              eq(s.workspaces.id, ctx.workspaceId),
              isNull(s.workspaces.stripeCheckoutSessionId),
              /*
               * Every metered plan buys a seat count - Solo two, Team ten - and the count
               * is taken from the plan the workspace is actually on.
               *
               * The total is worked out inside the same INSERT ... SELECT, under the
               * advisory lock taken above, so two owners inviting at once cannot both
               * read "one seat left" and both take it. Unclaimed invites count: a seat
               * that has been offered is spent until it is revoked, otherwise a workspace
               * could hold out ten invitations and let whoever answers first through.
               */
              workspaceFitsPlanSeatLimit(s.workspaces.id, 1),
            ),
          ),
      )
      .returning();
    const [, createdRows] = await db.batch([entitlementLock, inviteInsert]);
    const created = createdRows[0];
    if (!created) {
      const plan = effectivePlan(ctx.access);
      const seats = PLAN_SEAT_LIMITS[plan];
      throw new HttpError(
        403,
        seats === null
          ? "That invitation could not be created. Try again in a moment."
          : `${PLAN_NAMES[plan]} includes ${seats} team members, and this workspace has used them.${
              plan === "solo" ? " Upgrade to Team to invite more." : " Contact Beebizy to add more seats."
            }`,
      );
    }

    const emailSent = await sendInvitationEmail(email, invitationAcceptanceUrl(appOrigin()));

    return {
      member: {
        userId: null,
        role: created!.role,
        status: "invited",
        name: null,
        email,
        isSelf: false,
        joinedAt: created!.createdAt.toISOString(),
        eventScopeId: created!.eventScopeId,
        eventScopeTitle: eventScopeId ? (await events.get(ctx, eventScopeId))?.title ?? null : null,
      },
      emailSent,
    };
  },

  /** Takes back an unclaimed seat. */
  async revokeInvite(ctx: RequestContext, rawEmail: string): Promise<void> {
    requireRole(ctx, ["owner"]);
    const email = rawEmail.trim().toLowerCase();
    await db
      .delete(s.workspaceInvites)
      .where(
        and(
          eq(s.workspaceInvites.email, email),
          eq(s.workspaceInvites.workspaceId, ctx.workspaceId),
          isNull(s.workspaceInvites.acceptedAt),
        ),
      );
    // Otherwise the link in their inbox still works after the seat was taken back.
    await revokeInvitationEmail(email);
  },

  async setRole(ctx: RequestContext, userId: string, role: string): Promise<WorkspaceMember> {
    requireRole(ctx, ["owner"]);
    if (!(WORKSPACE_ROLES as readonly string[]).includes(role)) {
      throw new HttpError(400, `role must be one of ${WORKSPACE_ROLES.join(", ")}.`);
    }
    await guardLastOwner(ctx, userId, role === "owner" ? "keep" : "drop");

    const updated = await db
      .update(s.workspaceMembers)
      .set({ role: role as "member" })
      .where(and(eq(s.workspaceMembers.workspaceId, ctx.workspaceId), eq(s.workspaceMembers.userId, userId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That person is not in this workspace.");

    const directory = await lookupUsers([userId]);
    return {
      userId,
      role: updated[0]!.role,
      status: "active",
      name: directory.get(userId)?.name ?? null,
      email: directory.get(userId)?.email ?? null,
      isSelf: userId === ctx.userId,
      joinedAt: updated[0]!.createdAt.toISOString(),
      eventScopeId: updated[0]!.eventScopeId,
      eventScopeTitle: updated[0]!.eventScopeId ? (await events.get(ctx, updated[0]!.eventScopeId))?.title ?? null : null,
    };
  },

  async remove(ctx: RequestContext, userId: string): Promise<void> {
    requireRole(ctx, ["owner"]);
    await guardLastOwner(ctx, userId, "drop");
    await db
      .delete(s.workspaceMembers)
      .where(and(eq(s.workspaceMembers.workspaceId, ctx.workspaceId), eq(s.workspaceMembers.userId, userId)));
  },
};

/** Refuses a change that would leave the workspace with no owner. */
async function guardLastOwner(ctx: RequestContext, userId: string, intent: "keep" | "drop"): Promise<void> {
  if (intent === "keep") return;
  const owners = await db
    .select({ userId: s.workspaceMembers.userId })
    .from(s.workspaceMembers)
    .where(and(eq(s.workspaceMembers.workspaceId, ctx.workspaceId), eq(s.workspaceMembers.role, "owner")));
  if (owners.length <= 1 && owners.some((owner) => owner.userId === userId)) {
    throw new HttpError(409, "A workspace needs at least one owner. Make someone else an owner first.");
  }
}

export const history = {
  async list(ctx: RequestContext, eventId: string): Promise<EventHistoryEntry[]> {
    const rows = await db
      .select()
      .from(s.eventHistory)
      .where(and(eq(s.eventHistory.workspaceId, ctx.workspaceId), eq(s.eventHistory.eventId, eventId)))
      .orderBy(desc(s.eventHistory.createdAt))
      .limit(100);
    return rows.map(map.toEventHistory);
  },
};

export const teamUpdates = {
  async list(ctx: RequestContext, eventId: string): Promise<TeamUpdate[]> {
    await requireOwnedEvent(ctx, eventId);
    const rows = await db.select().from(s.eventHistory)
      .where(and(eq(s.eventHistory.workspaceId, ctx.workspaceId), eq(s.eventHistory.eventId, eventId), eq(s.eventHistory.resource, "team-update")))
      .orderBy(desc(s.eventHistory.createdAt)).limit(50);
    return rows.map(map.toEventHistory).map(teamUpdateFromHistory);
  },
  async create(ctx: RequestContext, eventId: string, body: Body): Promise<TeamUpdate> {
    await requireOwnedEvent(ctx, eventId);
    const message = labelFrom(body, "message", 1_000);
    if (!message) throw new HttpError(400, "Write an update before sending it.");
    const kind = str(body, "kind", "general");
    if (!(TEAM_UPDATE_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Choose a valid update type.");
    const parsedKind = teamUpdateKind(kind);
    const id = newId("update");
    const createdAt = new Date();
    await db.insert(s.eventHistory).values({
      id, workspaceId: ctx.workspaceId, eventId, actorId: ctx.userId, resource: "team-update", resourceId: id,
      action: "created", summary: message, before: null, after: { kind, message }, createdAt,
    });
    const update: TeamUpdate = { id, eventId, actorId: ctx.userId, kind: parsedKind, message, createdAt: createdAt.toISOString() };
    const [event, team] = await Promise.all([events.get(ctx, eventId), members.list(ctx)]);
    if (event) {
      const outcomes = await Promise.all(team.filter((member) => member.status === "active" && member.email).map((member) => notifyTeamUpdate({
        to: member.email!, eventTitle: event.title, kind: parsedKind,
        message, url: `${appOrigin()}/app/events/${eventId}`,
      })));
      update.emailDelivery = {
        sent: outcomes.filter((outcome) => outcome.status === "sent").length,
        notSent: outcomes.filter((outcome) => outcome.status !== "sent").length,
      };
    }
    return update;
  },
};

/**
 * Bounded, workspace-scoped evidence for the planning assistant. This deliberately
 * reads structured completed-event records instead of exposing the raw history log or
 * another customer's data to the model.
 */
export const planningMemory = {
  async list(ctx: RequestContext, target: Event): Promise<PastEventPlanningRecord[]> {
    const completed = await events.list(ctx, { status: "completed" });
    const selected = selectSimilarPastEvents(
      target,
      completed.map((event) => ({ event, budget: [], checklist: [], runOfShow: [], moodCaptions: [], floorplanShapes: [] })),
    );
    const eventIds = selected.map((record) => record.event.id);
    if (eventIds.length === 0) return [];

    const [budgets, checklistRows, cues, moods, planRows] = await Promise.all([
      db.select().from(s.budgetItems).where(and(eq(s.budgetItems.workspaceId, ctx.workspaceId), inArray(s.budgetItems.eventId, eventIds))),
      db.select().from(s.checklistItems).where(and(eq(s.checklistItems.workspaceId, ctx.workspaceId), inArray(s.checklistItems.eventId, eventIds))),
      db.select().from(s.runOfShowItems).where(and(eq(s.runOfShowItems.workspaceId, ctx.workspaceId), inArray(s.runOfShowItems.eventId, eventIds))),
      db.select().from(s.moodBoardImages).where(and(eq(s.moodBoardImages.workspaceId, ctx.workspaceId), inArray(s.moodBoardImages.eventId, eventIds))),
      db.select().from(s.floorplans).where(and(eq(s.floorplans.workspaceId, ctx.workspaceId), inArray(s.floorplans.eventId, eventIds))),
    ]);

    return selected.map(({ event }) => {
      const eventStart = new Date(event.date).getTime();
      // Every room, not just the first: an event laid out across a ballroom and a
      // terrace used both, and planning from one of them describes half the evening.
      const floorplanShapes: PastEventPlanningRecord["floorplanShapes"] = [];
      for (const row of planRows.filter((plan) => plan.eventId === event.id)) {
        try {
          const stored = readStoredFloorplan(row.items);
          floorplanShapes.push(...stored.items.map((item) => item.shape));
        } catch {
          // Older opaque layouts should not prevent the rest of the event evidence
          // from informing a new plan.
        }
      }
      return {
        event,
        budget: budgets.filter((row) => row.eventId === event.id).map((row) => ({
          name: row.name,
          category: row.category,
          type: row.type,
          estimatedCents: row.estimatedCents,
          actualCents: row.actualCents,
          notes: row.notes,
          sortOrder: row.sortOrder,
        })),
        checklist: checklistRows.filter((row) => row.eventId === event.id).map((row) => ({
          title: row.title,
          description: row.description,
          category: row.category,
          completed: row.completed,
          assignedTo: row.assignedTo,
          sortOrder: row.sortOrder,
          dueDaysBefore: row.dueDate
            ? Math.max(0, Math.round((eventStart - row.dueDate.getTime()) / 86_400_000))
            : 14,
        })),
        runOfShow: cues.filter((row) => row.eventId === event.id).map((row) => ({
          dayNumber: row.dayNumber,
          startTime: row.startTime,
          duration: row.durationMinutes,
          title: row.title,
          description: row.description,
          responsible: row.responsible,
          sortOrder: row.sortOrder,
        })),
        moodCaptions: moods
          .filter((row) => row.eventId === event.id && row.caption)
          .map((row) => row.caption!),
        floorplanShapes,
      };
    });
  },
};

export const roi = {
  async get(ctx: RequestContext, eventId: string) {
    const [row] = await db
      .select()
      .from(s.eventRoi)
      .where(and(eq(s.eventRoi.eventId, eventId), eq(s.eventRoi.workspaceId, ctx.workspaceId)))
      .limit(1);
    return row ? map.toRoi(row) : null;
  },
  async save(ctx: RequestContext, eventId: string, body: Body) {
    const values = {
      eventId,
      workspaceId: ctx.workspaceId,
      eventCostCents: optInt(body, "eventCostCents") ?? 0,
      unitsSold: optInt(body, "unitsSold") ?? 0,
      avgItemPriceCents: optInt(body, "avgItemPriceCents") ?? 0,
      notes: optStr(body, "notes") ?? "",
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(s.eventRoi)
      .values(values)
      .onConflictDoUpdate({ target: s.eventRoi.eventId, set: values })
      .returning();
    return map.toRoi(row!);
  },
};

export const settings = {
  async get(ctx: RequestContext): Promise<UserSettings> {
    const [[stored], [workspace]] = await Promise.all([
      db.select().from(s.userSettings).where(eq(s.userSettings.userId, ctx.userId)).limit(1),
      db
        .select({ currency: s.workspaces.currency, timeZone: s.workspaces.timeZone })
        .from(s.workspaces)
        .where(eq(s.workspaces.id, ctx.workspaceId))
        .limit(1),
    ]);
    const row = stored ?? (await db.insert(s.userSettings).values({ userId: ctx.userId }).returning())[0]!;
    const personal = map.toUserSettings(row);
    return {
      ...personal,
      currency: workspace?.currency ?? personal.currency,
      timeZone: workspace?.timeZone ?? personal.timeZone,
    };
  },
  async update(ctx: RequestContext, body: Body): Promise<UserSettings> {
    const patch = patchFrom<Partial<UserSettings>>(body, {
      homeGrouping: (b) => str(b, "homeGrouping", "location"),
      currency: (b) => str(b, "currency", "USD"),
      timeZone: (b) => str(b, "timeZone", "America/Los_Angeles"),
    });
    const savePersonal = db
      .insert(s.userSettings)
      .values({ userId: ctx.userId, ...patch })
      .onConflictDoUpdate({ target: s.userSettings.userId, set: { ...patch, updatedAt: new Date() } });
    const workspacePatch = {
      ...(patch.currency === undefined ? {} : { currency: patch.currency }),
      ...(patch.timeZone === undefined ? {} : { timeZone: patch.timeZone }),
      updatedAt: new Date(),
    };
    if (patch.currency !== undefined || patch.timeZone !== undefined) {
      await db.batch([
        savePersonal,
        db.update(s.workspaces).set(workspacePatch).where(eq(s.workspaces.id, ctx.workspaceId)),
      ]);
    } else {
      await savePersonal;
    }
    return settings.get(ctx);
  },
};

/* ----------------------------------------------------------- product feedback */

export const feedback = {
  async listInbox(ctx: RequestContext): Promise<FeedbackInboxItem[]> {
    requireBeebizyOperator(ctx.email);
    const rows = await db
      .select({ feedback: s.productFeedback, workspaceName: s.workspaces.name })
      .from(s.productFeedback)
      .innerJoin(s.workspaces, eq(s.productFeedback.workspaceId, s.workspaces.id))
      .orderBy(desc(s.productFeedback.createdAt));
    const directory = await lookupUsers([...new Set(rows.map(({ feedback: item }) => item.userId))]);
    return rows.map(({ feedback: item, workspaceName }) => ({
      ...map.toProductFeedback(item),
      userName: directory.get(item.userId)?.name ?? null,
      userEmail: directory.get(item.userId)?.email ?? null,
      workspaceName,
    }));
  },

  async list(ctx: RequestContext): Promise<ProductFeedback[]> {
    const rows = await db
      .select()
      .from(s.productFeedback)
      .where(
        and(
          eq(s.productFeedback.workspaceId, ctx.workspaceId),
          eq(s.productFeedback.userId, ctx.userId),
        ),
      )
      .orderBy(desc(s.productFeedback.createdAt));
    return rows.map(map.toProductFeedback);
  },

  async create(ctx: RequestContext, draft: ProductFeedbackDraft): Promise<ProductFeedback> {
    const parsed = feedbackDraftSchema.safeParse(draft);
    if (!parsed.success) throw new HttpError(400, feedbackValidationMessage(parsed.error));
    const { message, category, pagePath } = parsed.data;

    const [row] = await db
      .insert(s.productFeedback)
      .values({
        id: newId("feedback"),
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        category,
        message,
        pagePath,
      })
      .returning();
    const stored = map.toProductFeedback(row!);
    const [workspace] = await db
      .select({ name: s.workspaces.name })
      .from(s.workspaces)
      .where(eq(s.workspaces.id, ctx.workspaceId))
      .limit(1);
    await notifyFeedbackSubmission({
      feedbackId: stored.id,
      userName: null,
      userEmail: ctx.email,
      workspaceName: workspace?.name ?? ctx.workspaceId,
      category: stored.category,
      message: stored.message,
      pageUrl: stored.pagePath ? `${appOrigin()}${stored.pagePath}` : null,
      createdAt: stored.createdAt,
      inboxUrl: `${appOrigin()}/app/feedback`,
    });
    return stored;
  },

  /** Operator-only resend for feedback submitted before email notifications existed. */
  async notify(ctx: RequestContext, id: string) {
    requireBeebizyOperator(ctx.email);
    const [stored] = await db
      .select({ feedback: s.productFeedback, workspaceName: s.workspaces.name })
      .from(s.productFeedback)
      .innerJoin(s.workspaces, eq(s.productFeedback.workspaceId, s.workspaces.id))
      .where(eq(s.productFeedback.id, id))
      .limit(1);
    if (!stored) throw new HttpError(404, "Feedback not found.");

    const directory = await lookupUsers([stored.feedback.userId]);
    const submitter = directory.get(stored.feedback.userId);
    const item = map.toProductFeedback(stored.feedback);
    return notifyFeedbackSubmission({
      feedbackId: item.id,
      userName: submitter?.name ?? null,
      userEmail: submitter?.email ?? null,
      workspaceName: stored.workspaceName,
      category: item.category,
      message: item.message,
      pageUrl: item.pagePath ? `${appOrigin()}${item.pagePath}` : null,
      createdAt: item.createdAt,
      inboxUrl: `${appOrigin()}/app/feedback`,
    });
  },
};

/* --------------------------------------------------------------- analytics */

/**
 * The zone every derived day-count is measured in.
 *
 * This matters more on the server than in the browser: a Vercel function runs in UTC, so
 * without it "overdue" and "3 days out" are computed against a midnight the customer
 * never experiences — off by up to a day for every workspace west of Greenwich.
 */
async function workspaceTimeZone(ctx: RequestContext): Promise<string> {
  const [row] = await db
    .select({ timeZone: s.workspaces.timeZone })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, ctx.workspaceId))
    .limit(1);
  return row?.timeZone ?? "UTC";
}

/**
 * Everything derived, computed from four queries rather than one per event.
 *
 * The risk rules themselves stay in `@/data/derive` — the same pure functions the
 * in-memory adapter used and the unit tests cover. Only the fetching changes.
 */
async function facts(ctx: RequestContext) {
  const [timeZone, eventRows, checklistRows, vendorRows, budgetRows, ticketRows, sponsorRows, auctionRows, raffleRows, registrationRows] =
    await Promise.all([
      workspaceTimeZone(ctx),
      events.list(ctx),
      db.select().from(s.checklistItems).where(eq(s.checklistItems.workspaceId, ctx.workspaceId)),
      db
        .select({ booking: s.eventVendors, vendor: s.vendors })
        .from(s.eventVendors)
        .leftJoin(s.vendors, eq(s.eventVendors.vendorId, s.vendors.id))
        .where(eq(s.eventVendors.workspaceId, ctx.workspaceId)),
      db.select().from(s.budgetItems).where(eq(s.budgetItems.workspaceId, ctx.workspaceId)),
      db.select().from(s.ticketTypes).where(eq(s.ticketTypes.workspaceId, ctx.workspaceId)),
      db.select().from(s.sponsorships).where(eq(s.sponsorships.workspaceId, ctx.workspaceId)),
      db.select().from(s.auctionItems).where(eq(s.auctionItems.workspaceId, ctx.workspaceId)),
      db.select().from(s.raffleItems).where(eq(s.raffleItems.workspaceId, ctx.workspaceId)),
      db.select().from(s.registrations).where(eq(s.registrations.workspaceId, ctx.workspaceId)),
    ]);

  const byEvent = <T extends { eventId: string }>(rows: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.eventId);
      if (bucket) bucket.push(row);
      else grouped.set(row.eventId, [row]);
    }
    return grouped;
  };

  return {
    timeZone,
    eventRows,
    checklist: byEvent(checklistRows.map(map.toChecklistItem)),
    vendors: byEvent(vendorRows.map((row) => map.toEventVendor(row.booking, row.vendor))),
    budget: byEvent(budgetRows.map(map.toBudgetItem)),
    tickets: byEvent(ticketRows.map(map.toTicketType)),
    sponsorships: byEvent(sponsorRows.map(map.toSponsorship)),
    auction: byEvent(auctionRows.map(map.toAuctionItem)),
    raffle: byEvent(raffleRows.map(map.toRaffleItem)),
    registrations: registrationRows,
  };
}

export const analytics = {
  async customReport(ctx: RequestContext): Promise<CustomReportRow[]> {
    const [eventRows, healthRows] = await Promise.all([events.list(ctx), analytics.health(ctx)]);
    const healthByEvent = new Map(healthRows.map((health) => [health.eventId, health]));
    return eventRows.map((event) => {
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

  async health(ctx: RequestContext, eventIds?: string[]): Promise<EventHealth[]> {
    const f = await facts(ctx);
    const targets = eventIds ? f.eventRows.filter((event) => eventIds.includes(event.id)) : f.eventRows;
    return targets.map((event) =>
      computeEventHealth({
        event,
        checklist: f.checklist.get(event.id) ?? [],
        vendors: f.vendors.get(event.id) ?? [],
        budget: f.budget.get(event.id) ?? [],
        tickets: f.tickets.get(event.id) ?? [],
        sponsorships: f.sponsorships.get(event.id) ?? [],
        auction: f.auction.get(event.id) ?? [],
        raffle: f.raffle.get(event.id) ?? [],
      }, new Date(), f.timeZone),
    );
  },

  async attention(ctx: RequestContext) {
    const [f, healths] = await Promise.all([facts(ctx), analytics.health(ctx)]);
    return buildAttention(f.eventRows, healths);
  },

  async portfolio(ctx: RequestContext): Promise<PortfolioSummary> {
    const f = await facts(ctx);
    const [{ guestCount } = { guestCount: 0 }] = await db
      .select({ guestCount: count() })
      .from(s.guests)
      .where(eq(s.guests.workspaceId, ctx.workspaceId));
    const [{ locationCount } = { locationCount: 0 }] = await db
      .select({ locationCount: count() })
      .from(s.locations)
      .where(eq(s.locations.workspaceId, ctx.workspaceId));
    const [{ vendorCount } = { vendorCount: 0 }] = await db
      .select({ vendorCount: count() })
      .from(s.vendors)
      .where(eq(s.vendors.workspaceId, ctx.workspaceId));

    return computePortfolio({
      events: f.eventRows,
      registrations: f.registrations.map((row) => map.toRegistration(row, "")),
      guestCount: Number(guestCount),
      locationCount: Number(locationCount),
      vendorCount: Number(vendorCount),
      budget: [...f.budget.values()].flat(),
      tickets: [...f.tickets.values()].flat(),
      sponsorships: [...f.sponsorships.values()].flat(),
      auction: [...f.auction.values()].flat(),
      raffle: [...f.raffle.values()].flat(),
    }, new Date(), f.timeZone);
  },

  async openTasks(ctx: RequestContext): Promise<OpenTask[]> {
    // The composite index on (workspace, completed, due_date) serves this directly.
    const rows = await db
      .select({ item: s.checklistItems, event: s.events })
      .from(s.checklistItems)
      .innerJoin(s.events, eq(s.checklistItems.eventId, s.events.id))
      .where(
        and(
          eq(s.checklistItems.workspaceId, ctx.workspaceId),
          eq(s.checklistItems.completed, false),
          inArray(s.events.status, ["draft", "published"]),
        ),
      )
      .orderBy(asc(s.events.startsAt), asc(s.checklistItems.sortOrder));

    const now = new Date();
    const timeZone = await workspaceTimeZone(ctx);
    return rows
      .map(({ item, event }) => {
        return {
          ...map.toChecklistItem(item),
          eventTitle: event.title,
          eventDate: event.startsAt.toISOString(),
          eventStatus: event.status,
          daysUntilEvent: daysBetweenInZone(event.startsAt, timeZone, now),
          overdue: item.dueDate !== null && item.dueDate < now,
        };
      })
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          (a.daysUntilEvent ?? 9999) - (b.daysUntilEvent ?? 9999) ||
          a.sortOrder - b.sortOrder,
      );
  },
};

export { HttpError };
export const health = { isNull, isNotNull };
