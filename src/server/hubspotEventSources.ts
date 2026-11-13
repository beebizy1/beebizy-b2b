import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { QueueClient } from "@vercel/queue";
import { z } from "zod";
import { db } from "./db.ts";
import * as s from "./schema.ts";
import { HttpError, requireWorkspaceAccess, type RequestContext } from "./auth.ts";
import { connectionForWorkspace, hubspotAuthorizedRequest, HubSpotApiError, hubspotSyncFailureMessage, requireHubSpotAdmin } from "./hubspot.ts";
import { storeHubSpotContacts } from "./hubspotInbound.ts";
import { HUBSPOT_CONTACT_PROPERTIES, hubspotRemoteContactSchema, normalizeHubSpotContact } from "../data/hubspotContacts.ts";
import { hubspotEventSourceDraftSchema, parseHubSpotEventSourceMessage, hubspotListSchema, hubspotListsSchema, hubspotMembershipsSchema, type HubSpotEventSourceMessage, type HubSpotEventSourceStatus, type HubSpotRegistrationLists } from "../data/hubspotEventSource.ts";
import { addHubSpotListRegistrationsQuery } from "./hubspotEventSourceStore.ts";

export const hubspotEventQueue = new QueueClient();
const topic = "hubspot-event-registrations";
const sourceTable = s.hubspotEventSources;

async function ownedEvent(ctx: RequestContext, eventId: string, admin = false) {
  requireWorkspaceAccess(ctx);
  if (ctx.eventScopeId) throw new HttpError(403, "A workspace owner or admin manages HubSpot registration lists.");
  if (admin) requireHubSpotAdmin(ctx);
  const [event] = await db.select().from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  return event;
}
async function connected(workspaceId: string) {
  const row = await connectionForWorkspace(workspaceId);
  if (!row?.enabled) throw new HttpError(409, "Connect your organization's HubSpot account in Settings first.");
  return row;
}
function listError(error: unknown): never {
  if (error instanceof HubSpotApiError && [401, 403].includes(error.status)) {
    throw new HttpError(409, "Reconnect HubSpot in Settings to allow Beebizy to read registration lists.");
  }
  throw error;
}

export async function listHubSpotRegistrationLists(ctx: RequestContext, query: string, offset: number): Promise<HubSpotRegistrationLists> {
  requireHubSpotAdmin(ctx);
  if (ctx.eventScopeId) throw new HttpError(403, "Only a full workspace administrator can choose HubSpot lists.");
  const row = await connected(ctx.workspaceId);
  const safeOffset = z.number().int().min(0).max(10_000_000).parse(offset);
  try {
    const page = await hubspotAuthorizedRequest(row, "/crm/v3/lists/search", hubspotListsSchema, {
      method: "POST", body: JSON.stringify({ query: query.slice(0, 160), offset: safeOffset, count: 100, additionalProperties: ["hs_list_size"] }),
    });
    return { lists: page.lists.filter(list => list.objectTypeId === "0-1").map(list => ({ id: list.listId, name: list.name, size: /^\d+$/.test(list.additionalProperties?.hs_list_size ?? "") ? Number(list.additionalProperties!.hs_list_size) : null })), nextOffset: page.hasMore && page.offset > safeOffset ? page.offset : null };
  } catch (error) { return listError(error); }
}

export async function hubspotEventSourceStatus(ctx: RequestContext, eventId: string): Promise<HubSpotEventSourceStatus | null> {
  await ownedEvent(ctx, eventId);
  const [row] = await db.select().from(sourceTable).where(and(eq(sourceTable.eventId, eventId), eq(sourceTable.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) return null;
  const [total] = await db.select({ value: count() }).from(s.registrations).where(and(eq(s.registrations.eventId, eventId), eq(s.registrations.workspaceId, ctx.workspaceId), sql`${s.registrations.importedFields} @> ${JSON.stringify([{ label: "HubSpot list ID", value: row.listId }])}::jsonb`));
  const connection = await connectionForWorkspace(ctx.workspaceId);
  const active = connection?.id === row.connectionId && connection.enabled && connection.inboundEnabled;
  return { listId: row.listId, listName: row.listName, enabled: row.enabled, state: row.enabled && !active ? "paused" : row.state, registrations: Number(total?.value ?? 0), lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null, error: row.enabled && !active ? "Contact sync is paused. Turn it back on in Settings to resume event updates." : row.lastError };
}

async function enqueue(message: HubSpotEventSourceMessage, delaySeconds: number) {
  await hubspotEventQueue.send(topic, message, {
    delaySeconds, retentionSeconds: 86_400,
    idempotencyKey: `${message.eventId}:${message.generation}:${message.tick}`,
  });
  await db.update(sourceTable).set({ lastQueuedAt: new Date() }).where(and(eq(sourceTable.eventId, message.eventId), eq(sourceTable.generation, message.generation), eq(sourceTable.tick, message.tick)));
}

export async function setHubSpotEventSource(ctx: RequestContext, eventId: string, raw: unknown) {
  await ownedEvent(ctx, eventId, true);
  const draft = hubspotEventSourceDraftSchema.parse(raw);
  const row = await connected(ctx.workspaceId);
  if (draft.enabled && !row.inboundEnabled) throw new HttpError(409, "Turn on HubSpot contact sync in Settings first.");
  const [prior] = await db.select().from(sourceTable).where(and(eq(sourceTable.eventId, eventId), eq(sourceTable.workspaceId, ctx.workspaceId))).limit(1);
  let name = prior?.listId === draft.listId ? prior.listName : "";
  if (draft.enabled) {
    try {
      const result = await hubspotAuthorizedRequest(row, `/crm/v3/lists/${draft.listId}`, z.object({ list: hubspotListSchema }));
      if (result.list.objectTypeId !== "0-1") throw new HttpError(400, "Choose a contact registration list.");
      if (result.list.processingStatus !== "COMPLETE") throw new HttpError(409, "HubSpot is still preparing that list. Wait until its processing is complete, then try again.");
      name = result.list.name;
    } catch (error) { return listError(error); }
  } else if (!name) throw new HttpError(400, "Choose the connected list to pause it.");
  const generation = randomUUID();
  const values = { workspaceId: ctx.workspaceId, connectionId: row.id, listId: draft.listId, listName: name, enabled: draft.enabled, generation, tick: 0, cursor: null, state: draft.enabled ? "queued" : "paused", lastError: null, lastSyncedAt: null, lastQueuedAt: null, leaseToken: null, leaseUntil: null, updatedAt: new Date() };
  await db.insert(sourceTable).values({ eventId, ...values }).onConflictDoUpdate({ target: sourceTable.eventId, set: values });
  if (draft.enabled) {
    try { await enqueue({ eventId, generation, tick: 0 }, 0); }
    catch (error) {
      await db.update(sourceTable).set({ state: "error", lastError: "The registration list is saved, but background syncing could not start. Choose Retry sync." }).where(and(eq(sourceTable.eventId, eventId), eq(sourceTable.generation, generation)));
      console.error("[hubspot event queue]", error instanceof Error ? error.message : "Queue failed");
    }
  }
  return hubspotEventSourceStatus(ctx, eventId);
}

/** A queued tick checks one page, checkpoints, then schedules the next tick without a browser. */
export async function runHubSpotEventSource(raw: unknown) {
  const message = parseHubSpotEventSourceMessage(raw);
  const [current] = await db.select().from(sourceTable).where(and(eq(sourceTable.eventId, message.eventId), eq(sourceTable.generation, message.generation), eq(sourceTable.enabled, true))).limit(1);
  if (!current) return;
  const connection = await connectionForWorkspace(current.workspaceId);
  if (!connection?.enabled || !connection.inboundEnabled || connection.id !== current.connectionId) return;
  if (message.tick < current.tick) {
    await enqueue({ ...message, tick: current.tick }, 60);
    return;
  }
  const lease = randomUUID();
  const [claimed] = await db.update(sourceTable).set({ leaseToken: lease, leaseUntil: new Date(Date.now() + 120_000), state: "syncing", updatedAt: new Date() }).where(and(eq(sourceTable.eventId, current.eventId), eq(sourceTable.generation, message.generation), eq(sourceTable.tick, message.tick), eq(sourceTable.enabled, true), sql`(${sourceTable.leaseUntil} is null or ${sourceTable.leaseUntil}<now())`)).returning();
  if (!claimed) throw new Error("This registration sync is already running. Retry after its lease.");
  try {
    const query = new URLSearchParams({ limit: "100", ...(claimed.cursor ? { after: claimed.cursor } : {}) });
    const page = await hubspotAuthorizedRequest(connection, `/crm/v3/lists/${claimed.listId}/memberships?${query}`, hubspotMembershipsSchema);
    const ids = [...new Set(page.results.map(item => item.recordId))];
    const next = page.paging?.next?.after ?? null;
    if (next && next === claimed.cursor) throw new Error("HubSpot returned a repeated membership page.");
    if (ids.length) {
      const contacts = await hubspotAuthorizedRequest(connection, "/crm/v3/objects/contacts/batch/read", z.object({ results: z.array(hubspotRemoteContactSchema), errors: z.array(z.unknown()).optional(), status: z.string().optional() }), { method: "POST", body: JSON.stringify({ properties: [...HUBSPOT_CONTACT_PROPERTIES], inputs: ids.map(id => ({ id })) }) });
      if (contacts.errors?.length || (contacts.status && contacts.status !== "COMPLETE") || contacts.results.length !== ids.length) throw new Error("HubSpot could not read every registration. This saved page will retry.");
      await storeHubSpotContacts(connection, contacts.results.map(normalizeHubSpotContact), null);
      await db.execute(addHubSpotListRegistrationsQuery(current.workspaceId, connection.id, message, lease, ids));
      const [review] = await db.select({ total: count() }).from(s.hubspotInboundContacts).where(and(eq(s.hubspotInboundContacts.connectionId, connection.id), sql`${s.hubspotInboundContacts.hubspotContactId}=any(array[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]::text[])`, sql`(${s.hubspotInboundContacts.importError} is not null or ${s.hubspotInboundContacts.guestId} is null)`));
      if (Number(review?.total ?? 0)) throw new HttpError(409, "A registration has conflicting or invalid contact information. Review HubSpot contacts, then retry. Existing registrations are safe.");
    }
    const [saved] = await db.update(sourceTable).set({ tick: message.tick + 1, cursor: next, state: next ? "syncing" : "ready", ...(!next ? { lastSyncedAt: new Date() } : {}), lastError: null, leaseToken: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(sourceTable.eventId, current.eventId), eq(sourceTable.generation, message.generation), eq(sourceTable.leaseToken, lease), eq(sourceTable.enabled, true))).returning();
    if (saved) await enqueue({ ...message, tick: saved.tick }, next ? 0 : 60);
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    const reason = cause.code === "23514" || cause.cause?.code === "23514"
      ? "This event is full. Increase its capacity to continue syncing registrations. No guests were checked in."
      : error instanceof HttpError ? error.message : error instanceof HubSpotApiError && error.status === 404 ? "The connected HubSpot list no longer exists. Choose another registration list." : hubspotSyncFailureMessage(error);
    await db.update(sourceTable).set({ state: "error", lastError: reason, leaseToken: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(sourceTable.eventId, current.eventId), eq(sourceTable.generation, message.generation), eq(sourceTable.leaseToken, lease)));
    throw error;
  }
}

/** Recover paused connections and a send/checkpoint crash; normal work is queue driven. */
export async function recoverHubSpotEventSources(workspaceId?: string) {
  const rows = await db.select({ source: sourceTable }).from(sourceTable).innerJoin(s.hubspotConnections, and(eq(s.hubspotConnections.id, sourceTable.connectionId), eq(s.hubspotConnections.workspaceId, sourceTable.workspaceId))).where(and(eq(sourceTable.enabled, true), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true), ...(workspaceId ? [eq(sourceTable.workspaceId, workspaceId)] : []), sql`(${sourceTable.lastQueuedAt} is null or ${sourceTable.lastQueuedAt}<now()-interval '10 minutes')`, sql`(${sourceTable.leaseUntil} is null or ${sourceTable.leaseUntil}<now())`)).limit(100);
  for (const { source } of rows) {
    // A paused/acknowledged message cannot be republished with its old deduplication key.
    const [recovered] = await db.update(sourceTable).set({ generation: randomUUID(), tick: 0, cursor: null, state: "queued", lastQueuedAt: null, leaseToken: null, leaseUntil: null }).where(and(eq(sourceTable.eventId, source.eventId), eq(sourceTable.generation, source.generation), eq(sourceTable.enabled, true), sql`(${sourceTable.leaseUntil} is null or ${sourceTable.leaseUntil}<now())`)).returning();
    if (recovered) await enqueue({ eventId: recovered.eventId, generation: recovered.generation, tick: 0 }, 0);
  }
}
