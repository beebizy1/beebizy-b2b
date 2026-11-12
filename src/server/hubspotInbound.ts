import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { HUBSPOT_CONTACT_PROPERTIES, hubspotRemotePageSchema, normalizeHubSpotContact, hubspotSelectedIdsSchema, type HubSpotContactFilter, type HubSpotContactPage, type NormalizedHubSpotContact } from "../data/hubspotContacts.ts";
import { db } from "./db.ts";
import * as s from "./schema.ts";
import { HttpError, requireWorkspaceAccess, type RequestContext } from "./auth.ts";
import { connectionForWorkspace, hubspotAuthorizedRequest, hubspotStatus, hubspotSyncFailureMessage, requireHubSpotAdmin, type HubSpotConnection } from "./hubspot.ts";
import { applyHubSpotContactQuery, hubspotContactLocks } from "./hubspotContactStore.ts";

const properties = [...HUBSPOT_CONTACT_PROPERTIES];
async function connection(ctx: RequestContext, admin = false) {
  requireWorkspaceAccess(ctx); if (admin) requireHubSpotAdmin(ctx);
  if (ctx.eventScopeId) throw new HttpError(403, "Only a full workspace user can browse the HubSpot address book.");
  const row = await connectionForWorkspace(ctx.workspaceId);
  if (!row?.enabled) throw new HttpError(409, "Connect HubSpot in Settings first.");
  return row;
}
export async function storeHubSpotContacts(row: HubSpotConnection, contacts: NormalizedHubSpotContact[], runId: string | null) {
  if (!contacts.length) return;
  const unique = [...new Map(contacts.map(contact => [contact.id, contact])).values()];
  await db.batch([db.execute(hubspotContactLocks(row.workspaceId, unique)), ...unique.map(contact => db.execute(applyHubSpotContactQuery(row.id, row.workspaceId, contact, runId)))]);
}
function backgroundImport(id: string) {
  waitUntil(runHubSpotContactImport(id).catch(error => console.error("[hubspot inbound]", id, error instanceof Error ? error.message : "Import failed")));
}
async function queueImport(row: HubSpotConnection) {
  const resume = row.inboundRunId && ["queued", "running", "paused", "error"].includes(row.inboundState);
  if (!resume) await db.update(s.hubspotConnections).set({ inboundRunId: randomUUID(), inboundStartedAt: new Date(), inboundCursor: null, inboundProcessed: 0, inboundState: "queued", inboundLastError: null, inboundLeaseToken: null, inboundLeaseUntil: null }).where(and(eq(s.hubspotConnections.id, row.id), eq(s.hubspotConnections.workspaceId, row.workspaceId)));
  backgroundImport(row.id);
}
export async function setHubSpotContactSync(ctx: RequestContext, enabled: boolean) {
  const row = await connection(ctx, true);
  await db.update(s.hubspotConnections).set({ inboundEnabled: enabled, ...(!enabled ? { inboundState: "paused", inboundLeaseToken: null, inboundLeaseUntil: null } : {}) }).where(eq(s.hubspotConnections.id, row.id));
  if (enabled) await queueImport({ ...row, inboundEnabled: true, ...(!row.inboundEnabled ? { inboundRunId: null, inboundState: "idle" } : {}) });
  return hubspotStatus(ctx);
}
export async function syncHubSpotContacts(ctx: RequestContext) {
  const row = await connection(ctx, true);
  if (!row.inboundEnabled) throw new HttpError(409, "Turn on incoming contact sync first.");
  await queueImport(row); return hubspotStatus(ctx);
}

/** Checkpoints each page. The lease prevents overlapping imports; source versions fence webhooks. */
export async function runHubSpotContactImport(id: string, budgetMs = 240_000) {
  const lease = randomUUID(); const deadline = Date.now() + budgetMs;
  const [claimed] = await db.update(s.hubspotConnections).set({ inboundLeaseToken: lease, inboundLeaseUntil: new Date(Date.now() + 270_000), inboundState: "running", inboundLastError: null }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true), inArray(s.hubspotConnections.inboundState, ["queued", "running", "paused", "error"]), sql`${s.hubspotConnections.inboundRunId} is not null`, sql`(${s.hubspotConnections.inboundLeaseUntil} is null or ${s.hubspotConnections.inboundLeaseUntil}<now())`)).returning();
  if (!claimed?.inboundRunId) return;
  try {
    while (Date.now() < deadline) {
      const [row] = await db.select().from(s.hubspotConnections).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.inboundLeaseToken, lease), eq(s.hubspotConnections.inboundEnabled, true), eq(s.hubspotConnections.enabled, true))).limit(1);
      if (!row) return;
      const query = new URLSearchParams({ limit: "100", properties: properties.join(","), ...(row.inboundCursor ? { after: row.inboundCursor } : {}) });
      const page = await hubspotAuthorizedRequest(row, `/crm/v3/objects/contacts?${query}`, hubspotRemotePageSchema);
      await storeHubSpotContacts(row, page.results.map(normalizeHubSpotContact), row.inboundRunId);
      const next = page.paging?.next?.after ?? null;
      if (next && next === row.inboundCursor) throw new Error("HubSpot returned a repeated page. Progress is saved; retry the import.");
      const [saved] = await db.update(s.hubspotConnections).set({ inboundCursor: next, inboundProcessed: sql`${s.hubspotConnections.inboundProcessed}+${page.results.length}`, ...(!next ? { inboundState: "ready", inboundLastSyncedAt: new Date(), inboundLeaseToken: null, inboundLeaseUntil: null } : {}) }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.inboundLeaseToken, lease), eq(s.hubspotConnections.inboundEnabled, true))).returning();
      if (!saved) return;
      if (!next) {
        if (row.inboundStartedAt) await db.update(s.hubspotInboundContacts).set({ archivedAt: new Date(), sourceUpdatedAt: sql`greatest(${s.hubspotInboundContacts.sourceUpdatedAt},${row.inboundStartedAt.toISOString()}::timestamptz)`, updatedAt: new Date() }).where(and(eq(s.hubspotInboundContacts.connectionId, id), eq(s.hubspotInboundContacts.workspaceId, row.workspaceId), isNull(s.hubspotInboundContacts.archivedAt), sql`${s.hubspotInboundContacts.lastSeenRunId} is distinct from ${row.inboundRunId}`, sql`${s.hubspotInboundContacts.createdAt}<=${row.inboundStartedAt.toISOString()}::timestamptz and coalesce(${s.hubspotInboundContacts.updatedAt},${s.hubspotInboundContacts.createdAt})<=${row.inboundStartedAt.toISOString()}::timestamptz`, sql`exists(select 1 from hubspot_connections where id=${id} and workspace_id=${row.workspaceId} and enabled=true and inbound_enabled=true and inbound_run_id=${row.inboundRunId})`));
        return;
      }
    }
    await db.update(s.hubspotConnections).set({ inboundState: "paused", inboundLeaseToken: null, inboundLeaseUntil: null }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.inboundLeaseToken, lease)));
  } catch (error) {
    const reason = hubspotSyncFailureMessage(error);
    await db.update(s.hubspotConnections).set({ inboundState: "error", inboundLastError: reason, inboundLeaseToken: null, inboundLeaseUntil: null }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.inboundLeaseToken, lease)));
    console.error("[hubspot inbound]", id, reason);
  }
}

export async function listHubSpotContacts(ctx: RequestContext, filter: HubSpotContactFilter): Promise<HubSpotContactPage> {
  const row = await connection(ctx);
  const cursor = z.coerce.number().int().min(0).max(10_000_000).parse(filter.cursor ?? 0);
  const limit = z.coerce.number().int().min(1).max(100).parse(filter.limit ?? 50);
  if (filter.eventId) {
    const [event] = await db.select({ id: s.events.id }).from(s.events).where(and(eq(s.events.id, filter.eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
    if (!event) throw new HttpError(404, "That event no longer exists.");
  }
  const h = s.hubspotInboundContacts;
  const search = (filter.search ?? "").slice(0, 160).replace(/[\\%_]/g, "\\$&");
  const where = and(eq(h.workspaceId, ctx.workspaceId), eq(h.connectionId, row.id), isNull(h.archivedAt), ...(search ? [or(ilike(h.email, `%${search}%`), ilike(h.firstName, `%${search}%`), ilike(h.lastName, `%${search}%`), ilike(h.company, `%${search}%`), sql`concat_ws(' ',${h.firstName},${h.lastName}) ilike ${`%${search}%`}`)] : []));
  const [records, totals] = await Promise.all([db.select().from(h).where(where).orderBy(asc(h.lastName), asc(h.firstName), asc(h.hubspotContactId)).limit(limit).offset(cursor), db.select({ total: count() }).from(h).where(where)]);
  const ids = records.flatMap(contact => contact.guestId ? [contact.guestId] : []);
  const registered = filter.eventId && ids.length ? await db.select({ guestId: s.registrations.guestId }).from(s.registrations).where(and(eq(s.registrations.workspaceId, ctx.workspaceId), eq(s.registrations.eventId, filter.eventId), inArray(s.registrations.guestId, ids))) : [];
  const already = new Set(registered.map(item => item.guestId));
  const total = Number(totals[0]?.total ?? 0);
  return { total, nextCursor: cursor + records.length < total ? String(cursor + records.length) : null, contacts: records.map(contact => ({ id: contact.hubspotContactId, guestId: contact.guestId, firstName: contact.firstName, lastName: contact.lastName, name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Name not provided", email: contact.email, company: contact.company, phone: contact.phone, emailOptOut: contact.emailOptOut, issue: contact.importError, alreadyRegistered: contact.guestId ? already.has(contact.guestId) : false })) };
}

export async function addHubSpotContactsToEvent(ctx: RequestContext, eventId: string, rawIds: unknown) {
  const row = await connection(ctx);
  if (!Array.isArray(rawIds) || rawIds.length > 2000) throw new HttpError(400, "Choose up to 2,000 contacts at a time.");
  const ids = hubspotSelectedIdsSchema.parse(rawIds);
  if (!ids.length) throw new HttpError(400, "Choose at least one contact.");
  const [event] = await db.select().from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  const contacts = await db.select({ contact: s.hubspotInboundContacts, guest: s.guests }).from(s.hubspotInboundContacts).innerJoin(s.guests, and(eq(s.hubspotInboundContacts.guestId, s.guests.id), eq(s.guests.workspaceId, ctx.workspaceId))).where(and(eq(s.hubspotInboundContacts.connectionId, row.id), eq(s.hubspotInboundContacts.workspaceId, ctx.workspaceId), isNull(s.hubspotInboundContacts.archivedAt), inArray(s.hubspotInboundContacts.hubspotContactId, ids)));
  if (contacts.length !== ids.length || contacts.some(item => item.contact.importError)) throw new HttpError(409, "Some contacts changed or need review. Refresh the contact list and choose again.");
  const unique = [...new Map(contacts.map(item => [item.guest.id, item])).values()];
  const existing = await db.select({ guestId: s.registrations.guestId }).from(s.registrations).where(and(eq(s.registrations.workspaceId, ctx.workspaceId), eq(s.registrations.eventId, eventId), inArray(s.registrations.guestId, unique.map(item => item.guest.id))));
  const taken = new Set(existing.map(item => item.guestId));
  const fresh = unique.filter(item => !taken.has(item.guest.id));
  if (!fresh.length) return { added: 0, alreadyOnList: ids.length };
  try {
    const added = await db.insert(s.registrations).values(fresh.map(({ contact, guest }) => ({ id: `reg_${randomUUID()}`, workspaceId: ctx.workspaceId, eventId, guestId: guest.id, status: "pending" as const, segment: "General", organization: contact.company?.slice(0, 120) || null, quantity: 1, importedFields: [
      { label: "Full Name", value: guest.name }, { label: "First Name", value: contact.firstName }, { label: "Last Name", value: contact.lastName }, { label: "Email Address", value: guest.contact ?? "" }, { label: "RSVP Response", value: "Pending" }, { label: "Company Name", value: contact.company?.slice(0, 120) ?? "" }, { label: "Guest Type", value: "General" }, { label: "Notes", value: guest.notes ?? "" }, { label: "Attendees", value: "1" }, { label: "Phone", value: contact.phone ?? "" }, { label: "Source", value: "HubSpot" }, ...(contact.company && contact.company.length > 120 ? [{ label: "HubSpot company", value: contact.company }] : []),
    ] }))).onConflictDoNothing({ target: [s.registrations.eventId, s.registrations.guestId] }).returning({ id: s.registrations.id });
    return { added: added.length, alreadyOnList: ids.length - added.length };
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "23514" || cause.cause?.code === "23514") throw new HttpError(409, "This event does not have enough remaining capacity. Increase capacity or choose fewer contacts.");
    throw error;
  }
}

/** Invitations honor HubSpot opt-outs and archived/conflicted source records. */
export async function assertHubSpotEmailRecipients(workspaceId: string, emails: string[]) {
  if (!emails.length) return;
  const blocked = await db.select({ id: s.hubspotInboundContacts.id }).from(s.hubspotInboundContacts).innerJoin(s.guests, and(eq(s.guests.id, s.hubspotInboundContacts.guestId), eq(s.guests.workspaceId, workspaceId))).where(and(eq(s.hubspotInboundContacts.workspaceId, workspaceId), inArray(s.guests.contact, emails), or(eq(s.hubspotInboundContacts.emailOptOut, true), sql`${s.hubspotInboundContacts.archivedAt} is not null`, sql`${s.hubspotInboundContacts.importError} is not null`))).limit(1);
  if (blocked.length) throw new HttpError(400, "Some selected HubSpot contacts are unsubscribed, archived, or need review. Remove them from the email recipients before sending. No invitations were sent.");
}

export async function hubspotContactMaintenance() {
  const rows = await db.select().from(s.hubspotConnections).where(and(eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true))).orderBy(asc(s.hubspotConnections.inboundLastSyncedAt));
  const deadline = Date.now() + 240_000;
  let processed = 0;
  for (const row of rows) {
    if (Date.now() > deadline - 10_000) break;
    if (row.inboundState === "ready" || !row.inboundRunId) await db.update(s.hubspotConnections).set({ inboundRunId: randomUUID(), inboundStartedAt: new Date(), inboundProcessed: 0, inboundCursor: null, inboundState: "queued" }).where(and(eq(s.hubspotConnections.id, row.id), sql`(${s.hubspotConnections.inboundLeaseUntil} is null or ${s.hubspotConnections.inboundLeaseUntil}<now())`));
    await runHubSpotContactImport(row.id, Math.min(60_000, deadline - Date.now() - 1000)); processed++;
  }
  return { processed };
}

export async function readHubSpotWebhookContacts(row: HubSpotConnection, ids: string[]) {
  return hubspotAuthorizedRequest(row, "/crm/v3/objects/contacts/batch/read", z.unknown(), { method: "POST", body: JSON.stringify({ properties, inputs: ids.map(id => ({ id })) }), signal: AbortSignal.timeout(4_000) });
}
