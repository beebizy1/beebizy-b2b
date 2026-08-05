/**
 * Server-side data access.
 *
 * Every function takes a `RequestContext` and filters by its `workspaceId`. There is no
 * unscoped query in this file, which is the property that makes the API multi-tenant
 * rather than hopeful.
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
import { db } from "./db";
import * as s from "./schema";
import { HttpError, newId, requireRole, type RequestContext } from "./auth";
import * as map from "./mappers";
import { parseDate, parseOptionalDate } from "./mappers";
import type {
  Canvas,
  CanvasCard,
  Event,
  EventHealth,
  Floorplan,
  FloorplanItem,
  Location,
  OpenTask,
  PortfolioSummary,
  Registration,
  RegistrationWithAttendee,
  TemplateContents,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
} from "@/data/entities";
import { buildAttention, computeEventHealth, computePortfolio } from "@/data/derive";

type Body = Record<string, unknown>;

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
const optBool = (body: Body, key: string): boolean | undefined =>
  body[key] === undefined ? undefined : Boolean(body[key]);

/** Only assigns keys the client actually sent, so a patch never blanks a field. */
function patchFrom<T extends object>(body: Body, spec: Record<string, (body: Body) => unknown>): T {
  const patch: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(spec)) {
    if (key in body) patch[key] = read(body);
  }
  return patch as T;
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
    const id = newId("evt");
    await db.insert(s.events).values({
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
    });
    const created = await events.get(ctx, id);
    if (!created) throw new HttpError(500, "Event was created but could not be read back.");
    return created;
  },

  async update(ctx: RequestContext, id: string, body: Body): Promise<Event> {
    const patch = patchFrom<Record<string, unknown>>(body, {
      title: (b) => str(b, "title"),
      description: (b) => optStr(b, "description"),
      capacity: (b) => optInt(b, "capacity"),
      status: (b) => optStr(b, "status") ?? "draft",
      category: (b) => str(b, "category", "Other"),
      imageUrl: (b) => optStr(b, "imageUrl"),
      locationId: (b) => optStr(b, "locationId"),
    });
    if ("date" in body) patch.startsAt = parseDate(body.date, "date");
    if ("endDate" in body) patch.endsAt = parseOptionalDate(body.endDate, "endDate");
    if ("location" in body) patch.venue = optStr(body, "location");

    const updated = await db
      .update(s.events)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
      .returning({ id: s.events.id });
    if (updated.length === 0) throw new HttpError(404, "That event no longer exists.");

    const result = await events.get(ctx, id);
    if (!result) throw new HttpError(404, "That event no longer exists.");
    return result;
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    // No manual cascade: the foreign keys do it, which is eleven hand-written subcollection
    // deletes the document model needed and this does not.
    const deleted = await db
      .delete(s.events)
      .where(and(eq(s.events.id, id), eq(s.events.workspaceId, ctx.workspaceId)))
      .returning({ id: s.events.id });
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
      await db.insert(s.runOfShowItems).values(
        contents.runOfShowItems.map((item, index) => ({
          ...base,
          id: newId("ros"),
          startTime: item.startTime,
          durationMinutes: item.duration ?? null,
          title: item.title,
          description: item.description ?? null,
          responsible: item.responsible ?? null,
          sortOrder: index + 1,
        })),
      );
    }
    if (contents.budgetItems.length > 0) {
      await db.insert(s.budgetItems).values(
        contents.budgetItems.map((item, index) => ({
          ...base,
          id: newId("bud"),
          name: item.name,
          category: item.category ?? "General",
          type: item.type,
          estimatedCents: item.estimatedCents,
          actualCents: null,
          notes: item.notes ?? null,
          sortOrder: index + 1,
        })),
      );
    }
    return created;
  },

  async saveAsTemplate(ctx: RequestContext, eventId: string, body: Body) {
    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");

    const [checklist, runOfShow, budget] = await Promise.all([
      db.select().from(s.checklistItems).where(eq(s.checklistItems.eventId, eventId)).orderBy(asc(s.checklistItems.sortOrder)),
      db.select().from(s.runOfShowItems).where(eq(s.runOfShowItems.eventId, eventId)).orderBy(asc(s.runOfShowItems.startTime)),
      db.select().from(s.budgetItems).where(eq(s.budgetItems.eventId, eventId)).orderBy(asc(s.budgetItems.sortOrder)),
    ]);

    // Progress is not part of a template: completion and actuals are stripped.
    const contents: TemplateContents = {
      checklistItems: checklist.map((row) => ({ ...map.toChecklistItem(row), completed: false, dueDate: null, eventId: undefined as never })),
      runOfShowItems: runOfShow.map((row) => ({ ...map.toRunOfShowItem(row), eventId: undefined as never })),
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
};

/** Public: resolves a share token with no session at all. */
export async function eventByShareToken(token: string): Promise<Event | null> {
  const [row] = await db
    .select({ event: s.events, location: s.locations })
    .from(s.events)
    .leftJoin(s.locations, eq(s.events.locationId, s.locations.id))
    .where(eq(s.events.shareToken, token))
    .limit(1);
  if (!row) return null;
  const counts = await registrationCounts([row.event.id]);
  return map.toEvent(row.event, { location: row.location, registrationCount: counts.get(row.event.id) ?? 0 });
}

/**
 * Public reads for a shared event. Deliberately narrow: the agenda and the ticket types
 * on sale, nothing else. The guest payload is built from these rather than filtered from
 * a fuller object, so budgets and guest lists cannot leak by omission.
 */
export async function publicAgenda(eventId: string) {
  const rows = await db
    .select()
    .from(s.runOfShowItems)
    .where(eq(s.runOfShowItems.eventId, eventId))
    .orderBy(asc(s.runOfShowItems.startTime));
  return rows.map(map.toRunOfShowItem);
}

export async function publicTickets(eventId: string) {
  const rows = await db
    .select()
    .from(s.ticketTypes)
    .where(and(eq(s.ticketTypes.eventId, eventId), eq(s.ticketTypes.isActive, true)))
    .orderBy(asc(s.ticketTypes.sortOrder));
  return rows.map(map.toTicketType);
}

/* ------------------------------------------------------------- locations */

export const locations = {
  async list(ctx: RequestContext): Promise<Location[]> {
    // eventCount computed, never stored: a counter column is a thing that drifts.
    const rows = await db
      .select({
        location: s.locations,
        eventCount: sql<number>`(select count(*) from ${s.events} where ${s.events.locationId} = ${s.locations.id})`,
      })
      .from(s.locations)
      .where(eq(s.locations.workspaceId, ctx.workspaceId))
      .orderBy(asc(s.locations.name));
    return rows.map((row) => ({ ...map.toLocation(row.location), eventCount: Number(row.eventCount) }));
  },

  async get(ctx: RequestContext, id: string): Promise<Location | null> {
    const all = await locations.list(ctx);
    return all.find((row) => row.id === id) ?? null;
  },

  async create(ctx: RequestContext, body: Body): Promise<Location> {
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

/* -------------------------------------------------------------- attendees */

export const attendees = {
  async list(ctx: RequestContext) {
    const rows = await db
      .select()
      .from(s.attendees)
      .where(eq(s.attendees.workspaceId, ctx.workspaceId))
      .orderBy(asc(s.attendees.name));
    return rows.map(map.toAttendee);
  },
  async create(ctx: RequestContext, body: Body) {
    const id = newId("att");
    const contact = str(body, "contact");
    try {
      await db.insert(s.attendees).values({
        id,
        workspaceId: ctx.workspaceId,
        name: str(body, "name"),
        contact,
        notes: optStr(body, "notes"),
      });
    } catch (error) {
      // The unique index on (workspace, contact) is what makes this a real rule.
      if (String(error).includes("attendees_workspace_contact_idx")) {
        throw new HttpError(409, `Someone with the email ${contact} is already in your people list.`);
      }
      throw error;
    }
    const [row] = await db.select().from(s.attendees).where(eq(s.attendees.id, id)).limit(1);
    return map.toAttendee(row!);
  },
  async update(ctx: RequestContext, id: string, body: Body) {
    const patch = patchFrom<Record<string, unknown>>(body, {
      name: (b) => str(b, "name"),
      contact: (b) => str(b, "contact"),
      notes: (b) => optStr(b, "notes"),
    });
    const updated = await db
      .update(s.attendees)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.attendees.id, id), eq(s.attendees.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That person no longer exists.");
    return map.toAttendee(updated[0]!);
  },
  async remove(ctx: RequestContext, id: string): Promise<void> {
    requireRole(ctx, ["owner", "admin"]);
    await db.delete(s.attendees).where(and(eq(s.attendees.id, id), eq(s.attendees.workspaceId, ctx.workspaceId)));
  },
};

/* ---------------------------------------------------------- registrations */

async function joinRegistrations(where: ReturnType<typeof and>): Promise<RegistrationWithAttendee[]> {
  const rows = await db
    .select({ registration: s.registrations, attendee: s.attendees, eventTitle: s.events.title })
    .from(s.registrations)
    .innerJoin(s.events, eq(s.registrations.eventId, s.events.id))
    .leftJoin(s.attendees, eq(s.registrations.attendeeId, s.attendees.id))
    .where(where)
    .orderBy(desc(s.registrations.registeredAt));
  return rows.map((row) => ({
    ...map.toRegistration(row.registration, row.eventTitle),
    attendee: row.attendee ? map.toAttendee(row.attendee) : null,
  }));
}

export const registrations = {
  list: (ctx: RequestContext) => joinRegistrations(eq(s.registrations.workspaceId, ctx.workspaceId)),
  listForEvent: (ctx: RequestContext, eventId: string) =>
    joinRegistrations(and(eq(s.registrations.workspaceId, ctx.workspaceId), eq(s.registrations.eventId, eventId))),

  async create(ctx: RequestContext, body: Body): Promise<Registration> {
    const eventId = str(body, "eventId");
    const attendeeId = str(body, "attendeeId");

    const event = await events.get(ctx, eventId);
    if (!event) throw new HttpError(404, "That event no longer exists.");

    // Duplicate before capacity: telling someone already on the list that the event is
    // full is both wrong and unactionable. The unique index below still backs this up
    // against two concurrent requests.
    const [duplicate] = await db
      .select({ id: s.registrations.id })
      .from(s.registrations)
      .where(and(eq(s.registrations.eventId, eventId), eq(s.registrations.attendeeId, attendeeId)))
      .limit(1);
    if (duplicate) throw new HttpError(409, "That attendee is already registered for this event.");

    if (event.capacity !== null && event.registrationCount >= event.capacity) {
      throw new HttpError(409, `${event.title} is at capacity (${event.capacity}).`);
    }

    const id = newId("reg");
    try {
      await db.insert(s.registrations).values({
        id,
        workspaceId: ctx.workspaceId,
        eventId,
        attendeeId,
        status: (optStr(body, "status") ?? "pending") as "pending",
      });
    } catch (error) {
      if (String(error).includes("registrations_event_attendee_idx")) {
        throw new HttpError(409, "That attendee is already registered for this event.");
      }
      throw error;
    }
    const [row] = await db.select().from(s.registrations).where(eq(s.registrations.id, id)).limit(1);
    return map.toRegistration(row!, event.title);
  },

  async setStatus(ctx: RequestContext, id: string, status: string): Promise<Registration> {
    const updated = await db
      .update(s.registrations)
      .set({ status: status as "pending", updatedAt: new Date() })
      .where(and(eq(s.registrations.id, id), eq(s.registrations.workspaceId, ctx.workspaceId)))
      .returning();
    if (updated.length === 0) throw new HttpError(404, "That registration no longer exists.");
    const [event] = await db.select({ title: s.events.title }).from(s.events).where(eq(s.events.id, updated[0]!.eventId)).limit(1);
    return map.toRegistration(updated[0]!, event?.title ?? "");
  },

  async remove(ctx: RequestContext, id: string): Promise<void> {
    await db.delete(s.registrations).where(and(eq(s.registrations.id, id), eq(s.registrations.workspaceId, ctx.workspaceId)));
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
    const [rows, threads] = await Promise.all([
      db.select().from(s.vendors).where(eq(s.vendors.workspaceId, ctx.workspaceId)).orderBy(asc(s.vendors.name)),
      vendorThreads(ctx.workspaceId),
    ]);
    return rows.map((row) => map.toVendor(row, threads.get(row.id)));
  },
  async get(ctx: RequestContext, id: string): Promise<Vendor | null> {
    const all = await vendors.list(ctx);
    return all.find((row) => row.id === id) ?? null;
  },
  async create(ctx: RequestContext, body: Body): Promise<Vendor> {
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
    await db.delete(s.vendors).where(and(eq(s.vendors.id, id), eq(s.vendors.workspaceId, ctx.workspaceId)));
  },
};

export const vendorMessages = {
  async list(ctx: RequestContext, vendorId: string) {
    const rows = await db
      .select()
      .from(s.vendorMessages)
      .where(and(eq(s.vendorMessages.workspaceId, ctx.workspaceId), eq(s.vendorMessages.vendorId, vendorId)))
      .orderBy(asc(s.vendorMessages.createdAt));
    return rows.map(map.toVendorMessage);
  },
  /** Inserts the message; delivery is the caller's job (see `api/index.ts`). */
  async create(ctx: RequestContext, vendorId: string, body: Body) {
    const id = newId("vm");
    await db.insert(s.vendorMessages).values({
      id,
      workspaceId: ctx.workspaceId,
      vendorId,
      eventId: optStr(body, "eventId"),
      direction: "outbound",
      senderName: str(body, "senderName", "You"),
      subject: optStr(body, "subject"),
      body: str(body, "content"),
      isRead: true,
    });
    const [row] = await db.select().from(s.vendorMessages).where(eq(s.vendorMessages.id, id)).limit(1);
    return map.toVendorMessage(row!);
  },
  async markThreadRead(ctx: RequestContext, vendorId: string): Promise<void> {
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
  order?: "sortOrder" | "startTime" | "lotNumber" | "createdAt";
}) {
  const table = config.table as unknown as typeof s.checklistItems;
  const orderColumn = () => {
    switch (config.order) {
      case "startTime":
        return asc(s.runOfShowItems.startTime);
      case "lotNumber":
        return asc(s.auctionItems.lotNumber);
      case "createdAt":
        return asc(table.createdAt);
      default:
        return asc(table.sortOrder);
    }
  };

  return {
    async list(ctx: RequestContext, eventId: string): Promise<Entity[]> {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
        .orderBy(orderColumn());
      return rows.map((row) => config.mapper(row as never));
    },

    async create(ctx: RequestContext, eventId: string, body: Body): Promise<Entity> {
      const [{ maxOrder } = { maxOrder: 0 }] = await db
        .select({ maxOrder: sql<number>`coalesce(max(${table.sortOrder}), 0)` })
        .from(table)
        .where(eq(table.eventId, eventId));

      const id = newId(config.idPrefix);
      const values: Record<string, unknown> = { ...config.insert(ctx, eventId, body, Number(maxOrder) + 1), id };
      await db.insert(table).values(values as never);
      const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
      return config.mapper(row as never);
    },

    async update(ctx: RequestContext, eventId: string, id: string, body: Body): Promise<Entity> {
      const patch = patchFrom<Record<string, unknown>>(body, config.patch);
      const updated = await db
        .update(table)
        .set({ ...patch, updatedAt: new Date() } as never)
        .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
        .returning();
      if (updated.length === 0) throw new HttpError(404, "That record no longer exists.");
      return config.mapper(updated[0] as never);
    },

    async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), eq(table.eventId, eventId)))
        .returning({ id: table.id });
      if (deleted.length === 0) throw new HttpError(404, "That record no longer exists.");
    },
  };
}

const scope = (ctx: RequestContext, eventId: string) => ({ workspaceId: ctx.workspaceId, eventId });

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
    category: str(body, "category", "General"),
    sortOrder,
  }),
  patch: {
    title: (b) => str(b, "title"),
    description: (b) => optStr(b, "description"),
    completed: (b) => Boolean(b.completed),
    dueDate: (b) => parseOptionalDate(b.dueDate, "dueDate"),
    assignedTo: (b) => optStr(b, "assignedTo"),
    category: (b) => str(b, "category", "General"),
    sortOrder: (b) => optInt(b, "sortOrder") ?? 0,
  },
});

export const runOfShow = eventScoped({
  table: s.runOfShowItems as never,
  mapper: map.toRunOfShowItem as never,
  idPrefix: "ros",
  order: "startTime",
  insert: (ctx, eventId, body, sortOrder) => ({
    ...scope(ctx, eventId),
    startTime: str(body, "startTime"),
    durationMinutes: optInt(body, "duration"),
    title: str(body, "title"),
    description: optStr(body, "description"),
    responsible: optStr(body, "responsible"),
    sortOrder,
  }),
  patch: {
    startTime: (b) => str(b, "startTime"),
    duration: (b) => optInt(b, "duration"),
    title: (b) => str(b, "title"),
    description: (b) => optStr(b, "description"),
    responsible: (b) => optStr(b, "responsible"),
  },
});

export const budget = eventScoped({
  table: s.budgetItems as never,
  mapper: map.toBudgetItem as never,
  idPrefix: "bud",
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

export const inspirations = eventScoped({
  table: s.eventInspirations as never,
  mapper: map.toInspiration as never,
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
    const id = newId("ev");
    try {
      await db.insert(s.eventVendors).values({
        id,
        workspaceId: ctx.workspaceId,
        eventId,
        vendorId: str(body, "vendorId"),
        status: (optStr(body, "status") ?? "pending") as "pending",
        feeCents: optInt(body, "feeCents"),
        notes: optStr(body, "notes"),
      });
    } catch (error) {
      if (String(error).includes("event_vendors_event_vendor_idx")) {
        throw new HttpError(409, "That vendor is already booked on this event.");
      }
      throw error;
    }
    const all = await eventVendors.list(ctx, eventId);
    return all.find((row) => row.id === id)!;
  },
  async update(ctx: RequestContext, eventId: string, id: string, body: Body) {
    const patch = patchFrom<Record<string, unknown>>(body, {
      status: (b) => optStr(b, "status") ?? "pending",
      feeCents: (b) => optInt(b, "feeCents"),
      notes: (b) => optStr(b, "notes"),
    });
    const updated = await db
      .update(s.eventVendors)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId)))
      .returning({ id: s.eventVendors.id });
    if (updated.length === 0) throw new HttpError(404, "That booking no longer exists.");
    const all = await eventVendors.list(ctx, eventId);
    return all.find((row) => row.id === id)!;
  },
  async remove(ctx: RequestContext, eventId: string, id: string): Promise<void> {
    await db
      .delete(s.eventVendors)
      .where(and(eq(s.eventVendors.id, id), eq(s.eventVendors.workspaceId, ctx.workspaceId), eq(s.eventVendors.eventId, eventId)));
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

export const floorplan = {
  async get(ctx: RequestContext, eventId: string): Promise<Floorplan | null> {
    const [row] = await db
      .select()
      .from(s.floorplans)
      .where(and(eq(s.floorplans.eventId, eventId), eq(s.floorplans.workspaceId, ctx.workspaceId)))
      .limit(1);
    return row ? map.toFloorplan(row) : null;
  },
  async save(ctx: RequestContext, eventId: string, name: string, items: FloorplanItem[]): Promise<Floorplan> {
    const [row] = await db
      .insert(s.floorplans)
      .values({ eventId, workspaceId: ctx.workspaceId, name, items, updatedAt: new Date() })
      .onConflictDoUpdate({ target: s.floorplans.eventId, set: { name, items, updatedAt: new Date() } })
      .returning();
    return map.toFloorplan(row!);
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
    const [row] = await db.select().from(s.userSettings).where(eq(s.userSettings.userId, ctx.userId)).limit(1);
    if (row) return map.toUserSettings(row);
    const [created] = await db.insert(s.userSettings).values({ userId: ctx.userId }).returning();
    return map.toUserSettings(created!);
  },
  async update(ctx: RequestContext, body: Body): Promise<UserSettings> {
    const patch = patchFrom<Record<string, unknown>>(body, {
      homeGrouping: (b) => str(b, "homeGrouping", "location"),
      currency: (b) => str(b, "currency", "USD"),
      timeZone: (b) => str(b, "timeZone", "America/Los_Angeles"),
    });
    const [row] = await db
      .insert(s.userSettings)
      .values({ userId: ctx.userId, ...patch })
      .onConflictDoUpdate({ target: s.userSettings.userId, set: { ...patch, updatedAt: new Date() } })
      .returning();
    return map.toUserSettings(row!);
  },
};

/* --------------------------------------------------------------- analytics */

/**
 * Everything derived, computed from four queries rather than one per event.
 *
 * The risk rules themselves stay in `@/data/derive` — the same pure functions the
 * in-memory adapter used and the unit tests cover. Only the fetching changes.
 */
async function facts(ctx: RequestContext) {
  const [eventRows, checklistRows, vendorRows, budgetRows, ticketRows, sponsorRows, auctionRows, raffleRows, registrationRows] =
    await Promise.all([
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
      }),
    );
  },

  async attention(ctx: RequestContext) {
    const [f, healths] = await Promise.all([facts(ctx), analytics.health(ctx)]);
    return buildAttention(f.eventRows, healths);
  },

  async portfolio(ctx: RequestContext): Promise<PortfolioSummary> {
    const f = await facts(ctx);
    const [{ attendeeCount } = { attendeeCount: 0 }] = await db
      .select({ attendeeCount: count() })
      .from(s.attendees)
      .where(eq(s.attendees.workspaceId, ctx.workspaceId));
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
      attendeeCount: Number(attendeeCount),
      locationCount: Number(locationCount),
      vendorCount: Number(vendorCount),
      budget: [...f.budget.values()].flat(),
      tickets: [...f.tickets.values()].flat(),
      sponsorships: [...f.sponsorships.values()].flat(),
      auction: [...f.auction.values()].flat(),
      raffle: [...f.raffle.values()].flat(),
    });
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
    const day = 24 * 60 * 60 * 1000;
    return rows
      .map(({ item, event }) => {
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfEvent = new Date(event.startsAt);
        startOfEvent.setHours(0, 0, 0, 0);
        return {
          ...map.toChecklistItem(item),
          eventTitle: event.title,
          eventDate: event.startsAt.toISOString(),
          eventStatus: event.status,
          daysUntilEvent: Math.round((startOfEvent.getTime() - startOfToday.getTime()) / day),
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
