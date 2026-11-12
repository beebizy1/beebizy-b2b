import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { db } from "./db.ts";
import * as s from "./schema.ts";
import { HttpError } from "./auth.ts";
import { hubspotSyncFailureMessage } from "./hubspot.ts";
import { validHubSpotSignature } from "./hubspotWebhookSignature.ts";
import { normalizeHubSpotWebhookBatch } from "../data/hubspotContacts.ts";
import { readHubSpotWebhookContacts, storeHubSpotContacts } from "./hubspotInbound.ts";
import { clearHubSpotEventsQuery, queueHubSpotEventsQuery } from "./hubspotContactStore.ts";

const identifier = z.union([z.string().regex(/^\d{1,50}$/), z.number().int().safe().positive()]).transform(String);
const eventSchema = z.object({ portalId: identifier, appId: identifier.optional(), occurredAt: z.number().int().safe().positive(), subscriptionType: z.string().max(100), objectTypeId: z.string().max(50).optional(), objectId: identifier.optional(), primaryObjectId: identifier.optional(), mergedObjectIds: z.array(identifier).max(100).optional() });
export async function handleHubSpotWebhook(request: Request) {
  const secret = process.env.HUBSPOT_CLIENT_SECRET?.trim();
  if (!secret) throw new HttpError(503, "HubSpot webhook verification is not configured.");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 256_000) throw new HttpError(413, "Webhook payload is too large.");
  if (!validHubSpotSignature(request, raw, secret)) {
    const url = new URL(request.url); const timestamp = Number(request.headers.get("x-hubspot-request-timestamp"));
    console.warn("[hubspot webhook verification]", { path: url.pathname, rewrite: url.searchParams.has("__path"), protocol: url.protocol, v3: Boolean(request.headers.get("x-hubspot-signature-v3")), legacyVersion: request.headers.get("x-hubspot-signature-version"), ageSeconds: Number.isFinite(timestamp) ? Math.round((Date.now() - timestamp) / 1000) : null, bytes: Buffer.byteLength(raw, "utf8") });
    throw new HttpError(401, "Invalid HubSpot webhook signature.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid webhook JSON."); }
  if (!Array.isArray(parsed) || parsed.length > 100) throw new HttpError(400, "A webhook batch must contain at most 100 events.");
  const events = z.array(eventSchema).parse(parsed).filter(event => (event.subscriptionType.startsWith("contact.") || (event.subscriptionType.startsWith("object.") && event.objectTypeId === "0-1")) && !event.subscriptionType.endsWith("privacyDeletion"));
  const expectedApp = process.env.HUBSPOT_APP_ID?.trim();
  if (expectedApp && events.some(event => event.appId && event.appId !== expectedApp)) throw new HttpError(401, "The webhook belongs to a different app.");
  if (events.some(event => event.occurredAt > Date.now() + 300_000)) throw new HttpError(400, "Invalid event timestamp.");
  let queued = 0;
  for (const portalId of new Set(events.map(event => event.portalId))) {
    const latest = new Map<string, { time: number; kind: string }>();
    for (const event of events.filter(item => item.portalId === portalId)) {
      for (const id of [event.objectId, event.primaryObjectId, ...(event.mergedObjectIds ?? [])].filter((id): id is string => Boolean(id))) {
        if ((latest.get(id)?.time ?? 0) <= event.occurredAt) latest.set(id, { time: event.occurredAt, kind: event.subscriptionType });
      }
    }
    const ids = [...latest.keys()];
    if (!ids.length) continue;
    const connections = await db.select().from(s.hubspotConnections).where(and(eq(s.hubspotConnections.portalId, portalId), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true)));
    for (const row of connections) {
      await db.execute(queueHubSpotEventsQuery(row.id, row.workspaceId, ids.map(id => ({ id, ...latest.get(id)! }))));
      kickWorker(row.id); queued += ids.length;
    }
  }
  return new Response(JSON.stringify({ ok: true, queued }), { status: 200, headers: { "content-type": "application/json" } });
}

function kickWorker(id: string) { waitUntil(drainHubSpotWebhookInbox(id).catch(error => console.error("[hubspot webhook]", id, error instanceof Error ? error.message : "Worker failed"))); }
export async function resumeHubSpotWebhookInbox(workspaceId: string) {
  const [row] = await db.select({ id: s.hubspotConnections.id }).from(s.hubspotConnections).where(and(eq(s.hubspotConnections.workspaceId, workspaceId), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true))).limit(1);
  if (row) kickWorker(row.id);
}
export async function drainHubSpotWebhookInbox(id: string, budgetMs = 240_000) {
  const deadline = Date.now() + budgetMs; const lease = randomUUID(); let failed = false;
  const [row] = await db.update(s.hubspotConnections).set({ webhookLeaseToken: lease, webhookLeaseUntil: new Date(Date.now() + 270_000) }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true), sql`(${s.hubspotConnections.webhookLeaseUntil} is null or ${s.hubspotConnections.webhookLeaseUntil}<now())`)).returning();
  if (!row) return;
  try {
    while (Date.now() < deadline) {
      const [active] = await db.select().from(s.hubspotConnections).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.webhookLeaseToken, lease), eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true))).limit(1);
      if (!active) return;
      const pending = await db.select().from(s.hubspotContactInbox).where(and(eq(s.hubspotContactInbox.connectionId, id), eq(s.hubspotContactInbox.workspaceId, row.workspaceId))).orderBy(asc(s.hubspotContactInbox.occurredAt)).limit(100);
      if (!pending.length) break;
      const response = await readHubSpotWebhookContacts(active, pending.map(item => item.hubspotContactId));
      const contacts = normalizeHubSpotWebhookBatch(response, pending);
      await storeHubSpotContacts(active, contacts, null);
      await db.batch([
        db.execute(clearHubSpotEventsQuery(id, row.workspaceId, pending.map(item => ({ id: item.hubspotContactId, time: item.occurredAt })), lease)),
        db.update(s.hubspotConnections).set({ inboundLastWebhookAt: new Date(), webhookLastError: null }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.webhookLeaseToken, lease), eq(s.hubspotConnections.inboundEnabled, true))),
      ]);
    }
  } catch (error) {
    failed = true; const reason = hubspotSyncFailureMessage(error);
    await db.update(s.hubspotConnections).set({ webhookLastError: reason, webhookLeaseUntil: new Date(Date.now() + 60_000) }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.webhookLeaseToken, lease)));
    console.error("[hubspot webhook]", id, reason);
  } finally {
    await db.update(s.hubspotConnections).set({ webhookLeaseToken: null, ...(!failed ? { webhookLeaseUntil: null } : {}) }).where(and(eq(s.hubspotConnections.id, id), eq(s.hubspotConnections.webhookLeaseToken, lease)));
  }
  // Close the enqueue/release race while staying within this request's time budget.
  if (!failed && Date.now() < deadline - 15_000) {
    const [pending] = await db.select({ id: s.hubspotContactInbox.hubspotContactId }).from(s.hubspotContactInbox).where(eq(s.hubspotContactInbox.connectionId, id)).limit(1);
    if (pending) await drainHubSpotWebhookInbox(id, deadline - Date.now());
  }
}
export async function hubspotWebhookMaintenance() {
  const rows = await db.selectDistinct({ id: s.hubspotContactInbox.connectionId }).from(s.hubspotContactInbox).innerJoin(s.hubspotConnections, eq(s.hubspotConnections.id, s.hubspotContactInbox.connectionId)).where(and(eq(s.hubspotConnections.enabled, true), eq(s.hubspotConnections.inboundEnabled, true)));
  const deadline = Date.now() + 240_000; let processed = 0;
  for (const row of rows) { if (Date.now() > deadline - 10_000) break; await drainHubSpotWebhookInbox(row.id, Math.min(60_000, deadline - Date.now() - 1000)); processed++; }
  return { processed };
}
