import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { EMPTY_HUBSPOT_INBOUND } from "../data/hubspotContacts.ts";
import { z } from "zod";
import type {
  HubSpotConnectionStatus,
  HubSpotEventSyncResult,
  HubSpotSyncResult,
  RegistrationWithGuest,
} from "../data/entities.ts";
import { HttpError, requireWorkspaceAccess, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { openToken, readOAuthState, sealToken, signOAuthState } from "./googleCalendar.ts";
import * as repos from "./repos.ts";
import * as s from "./schema.ts";

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_API = "https://api.hubapi.com";
const HUBSPOT_TOKEN_URL = `${HUBSPOT_API}/oauth/2026-03/token`;
const HUBSPOT_SCOPES = ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.lists.read"];

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  hub_id: z.union([z.string(), z.number()]).optional(),
}).passthrough();
const contactBatchSchema = z.object({
  results: z.array(z.object({ id: z.string().min(1) })).default([]),
}).passthrough();
const noteSchema = z.object({ id: z.string().min(1) }).passthrough();

export type HubSpotConnection = typeof s.hubspotConnections.$inferSelect;

interface HubSpotConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

function configured(): boolean {
  return Boolean(
    process.env.HUBSPOT_CLIENT_ID?.trim() &&
      process.env.HUBSPOT_CLIENT_SECRET?.trim() &&
      process.env.HUBSPOT_REDIRECT_URI?.trim() &&
      process.env.HUBSPOT_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}

function config(): HubSpotConfig {
  if (!configured()) throw new HttpError(503, "HubSpot is not configured yet.");
  return {
    clientId: process.env.HUBSPOT_CLIENT_ID!.trim(),
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!.trim(),
    redirectUri: process.env.HUBSPOT_REDIRECT_URI!.trim(),
    encryptionKey: process.env.HUBSPOT_TOKEN_ENCRYPTION_KEY!.trim(),
  };
}

export function requireHubSpotAdmin(ctx: RequestContext): void {
  requireWorkspaceAccess(ctx);
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new HttpError(403, "Only an owner or admin can manage the HubSpot connection.");
  }
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function connectionForWorkspace(workspaceId: string): Promise<HubSpotConnection | undefined> {
  return db.select().from(s.hubspotConnections)
    .where(eq(s.hubspotConnections.workspaceId, workspaceId)).limit(1)
    .then((rows) => rows[0]);
}

export class HubSpotApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function hubspotSyncFailureMessage(error: unknown) {
  if (error instanceof HubSpotApiError && [401, 403].includes(error.status)) return "HubSpot access needs attention. Reconnect your account in Settings, then resume the import.";
  if (error instanceof HubSpotApiError && error.status === 429) return "HubSpot's request limit was reached. Progress is saved. Try resuming in a minute.";
  return "HubSpot updates were interrupted. Your existing data and import progress are saved. Resume the import or contact Beebizy support.";
}
async function parseResponse<T>(response: Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let reason = `${response.status}`;
    try {
      const body = JSON.parse(text) as { message?: string; error_description?: string };
      reason = body.error_description ?? body.message ?? reason;
    } catch {
      // Status code is enough when HubSpot does not return JSON.
    }
    throw new HubSpotApiError(response.status, `${label} failed (${response.status}): ${reason}`);
  }
  return schema.parse(text ? JSON.parse(text) : {});
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  return parseResponse(response, tokenSchema, "HubSpot authorization");
}

async function accessToken(connection: HubSpotConnection): Promise<string> {
  const settings = config();
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 2 * 60_000) {
    return openToken(connection.accessTokenCiphertext, settings.encryptionKey);
  }
  const refreshed = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: openToken(connection.refreshTokenCiphertext, settings.encryptionKey),
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
  });
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1_000);
  await db.update(s.hubspotConnections).set({
    accessTokenCiphertext: sealToken(refreshed.access_token, settings.encryptionKey),
    refreshTokenCiphertext: refreshed.refresh_token
      ? sealToken(refreshed.refresh_token, settings.encryptionKey)
      : connection.refreshTokenCiphertext,
    accessTokenExpiresAt: expiresAt,
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(s.hubspotConnections.id, connection.id));
  return refreshed.access_token;
}

async function hubspotRequest<T>(
  token: string,
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  return parseResponse(response, schema, "HubSpot request");
}

/** Server-only JSON access; OAuth tokens never leave this module. */
export async function hubspotAuthorizedRequest<T>(connection: HubSpotConnection, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, init: RequestInit = {}): Promise<T> {
  return hubspotRequest(await accessToken(connection), path, schema, init);
}

export function splitContactName(name: string): { firstname: string; lastname: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstname: words[0] ?? "Guest", lastname: "" };
  return { firstname: words[0]!, lastname: words.slice(1).join(" ") };
}

export function hubspotContactProperties(row: RegistrationWithGuest): Record<string, string> | null {
  const email = row.guest?.contact?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = splitContactName(row.guest?.name ?? "Guest");
  const firstName = row.importedFields?.find(field => field.label === "First Name")?.value.trim();
  const lastName = row.importedFields?.find(field => field.label === "Last Name")?.value.trim();
  // Use the guest's explicit boundaries only while they match the current name.
  // Older imports and later manual renames retain the existing fallback.
  const submittedNameMatches = firstName && lastName && `${firstName} ${lastName}` === row.guest?.name.trim();
  return {
    email,
    firstname: submittedNameMatches ? firstName : name.firstname,
    lastname: submittedNameMatches ? lastName : name.lastname,
    ...(row.organization ? { company: row.organization } : {}),
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function hubspotRegistrationNote(row: RegistrationWithGuest): string {
  return [
    `<strong>Beebizy registration</strong>`,
    `Event: ${escapeHtml(row.eventTitle)}`,
    `Status: ${escapeHtml(row.status)}`,
    `Guest type: ${escapeHtml(row.segment ?? "Not specified")}`,
    `Organization: ${escapeHtml(row.organization ?? "Not specified")}`,
    `Party size: ${row.quantity}`,
    `Checked in: ${row.checkedInAt ? "Yes" : "No"}`,
  ].join("<br>");
}

function registrationFingerprint(row: RegistrationWithGuest): string {
  return createHash("sha256").update(JSON.stringify({
    name: row.guest?.name,
    contact: row.guest?.contact,
    organization: row.organization,
    segment: row.segment,
    status: row.status,
    quantity: row.quantity,
    checkedInAt: row.checkedInAt,
    eventTitle: row.eventTitle,
  })).digest("hex");
}

async function registrationRow(workspaceId: string, registrationId: string): Promise<RegistrationWithGuest | null> {
  const [joined] = await db.select({ registration: s.registrations, guest: s.guests, event: s.events })
    .from(s.registrations)
    .innerJoin(s.guests, eq(s.registrations.guestId, s.guests.id))
    .innerJoin(s.events, eq(s.registrations.eventId, s.events.id))
    .where(and(eq(s.registrations.workspaceId, workspaceId), eq(s.registrations.id, registrationId)))
    .limit(1);
  if (!joined) return null;
  return {
    id: joined.registration.id,
    ownerId: joined.registration.workspaceId,
    eventId: joined.registration.eventId,
    eventTitle: joined.event.title,
    guestId: joined.registration.guestId,
    status: joined.registration.status,
    segment: joined.registration.segment,
    organization: joined.registration.organization,
    quantity: joined.registration.quantity,
    registeredAt: joined.registration.registeredAt.toISOString(),
    checkedInAt: joined.registration.checkedInAt?.toISOString() ?? null,
    checkInStation: joined.registration.checkInStation,
    checkInNotes: joined.registration.checkInNotes,
    importedFields: joined.registration.importedFields,
    createdAt: joined.registration.createdAt.toISOString(),
    updatedAt: joined.registration.updatedAt?.toISOString(),
    guest: {
      id: joined.guest.id,
      ownerId: joined.guest.workspaceId,
      name: joined.guest.name,
      contact: joined.guest.contact,
      notes: joined.guest.notes,
      createdAt: joined.guest.createdAt.toISOString(),
      updatedAt: joined.guest.updatedAt?.toISOString(),
    },
  };
}

async function upsertContact(connection: HubSpotConnection, row: RegistrationWithGuest): Promise<string | null> {
  const properties = hubspotContactProperties(row);
  if (!properties) return null;
  const token = await accessToken(connection);
  const result = await hubspotRequest(token, "/crm/v3/objects/contacts/batch/upsert", contactBatchSchema, {
    method: "POST",
    body: JSON.stringify({
      inputs: [{ id: properties.email, idProperty: "email", properties }],
    }),
  });
  const contactId = (result.results ?? [])[0]?.id;
  if (!contactId) throw new Error("HubSpot did not return the synced contact.");
  const now = new Date();
  await db.insert(s.hubspotContactLinks).values({
    id: newId("hsc"),
    workspaceId: connection.workspaceId,
    connectionId: connection.id,
    guestId: row.guestId,
    hubspotContactId: contactId,
    email: properties.email,
    lastSyncedAt: now,
  }).onConflictDoUpdate({
    target: [s.hubspotContactLinks.workspaceId, s.hubspotContactLinks.guestId],
    set: { connectionId: connection.id, hubspotContactId: contactId, email: properties.email, lastSyncedAt: now, updatedAt: now },
  });
  return contactId;
}

async function upsertRegistrationNote(
  connection: HubSpotConnection,
  row: RegistrationWithGuest,
  contactId: string,
): Promise<void> {
  const fingerprint = registrationFingerprint(row);
  const [existing] = await db.select().from(s.hubspotRegistrationLinks)
    .where(eq(s.hubspotRegistrationLinks.registrationId, row.id)).limit(1);
  if (existing?.fingerprint === fingerprint) return;
  const token = await accessToken(connection);
  const properties = { hs_timestamp: row.registeredAt, hs_note_body: hubspotRegistrationNote(row) };
  const note = existing?.hubspotNoteId
    ? await hubspotRequest(token, `/crm/v3/objects/notes/${encodeURIComponent(existing.hubspotNoteId)}`, noteSchema, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      })
    : await hubspotRequest(token, "/crm/v3/objects/notes", noteSchema, {
        method: "POST",
        body: JSON.stringify({
          properties,
          associations: [{
            to: { id: contactId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
          }],
        }),
      });
  const now = new Date();
  const values = {
    workspaceId: connection.workspaceId,
    connectionId: connection.id,
    registrationId: row.id,
    hubspotContactId: contactId,
    hubspotNoteId: note.id,
    fingerprint,
    lastSyncedAt: now,
    updatedAt: now,
  };
  await db.insert(s.hubspotRegistrationLinks).values({ id: existing?.id ?? newId("hsr"), ...values })
    .onConflictDoUpdate({ target: s.hubspotRegistrationLinks.registrationId, set: values });
}

async function recordError(connectionId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 1_000) : "HubSpot sync failed.";
  console.error("[hubspot]", connectionId, error);
  await db.update(s.hubspotConnections).set({ lastError: message, updatedAt: new Date() })
    .where(eq(s.hubspotConnections.id, connectionId));
}

async function syncOne(connection: HubSpotConnection, registrationId: string): Promise<"synced" | "skipped"> {
  const row = await registrationRow(connection.workspaceId, registrationId);
  if (!row) return "skipped";
  const contactId = await upsertContact(connection, row);
  if (!contactId) return "skipped";
  await upsertRegistrationNote(connection, row, contactId);
  return "synced";
}

export async function syncHubSpotRegistrationIfEnabled(workspaceId: string, registrationId: string): Promise<void> {
  const [event] = await db.select({ enabled: s.events.hubspotSyncEnabled })
    .from(s.registrations)
    .innerJoin(s.events, eq(s.registrations.eventId, s.events.id))
    .where(and(eq(s.registrations.workspaceId, workspaceId), eq(s.registrations.id, registrationId)))
    .limit(1);
  if (!event?.enabled) return;
  const connection = await connectionForWorkspace(workspaceId);
  if (!connection?.enabled) return;
  try {
    await syncOne(connection, registrationId);
    await db.update(s.hubspotConnections).set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(s.hubspotConnections.id, connection.id));
  } catch (error) {
    await recordError(connection.id, error);
  }
}

export async function syncHubSpotRegistrationById(registrationId: string): Promise<void> {
  const [row] = await db.select({ workspaceId: s.registrations.workspaceId }).from(s.registrations)
    .where(eq(s.registrations.id, registrationId)).limit(1);
  if (row) await syncHubSpotRegistrationIfEnabled(row.workspaceId, registrationId);
}

export async function hubspotStatus(ctx: RequestContext): Promise<HubSpotConnectionStatus> {
  if (!configured()) return { state: "not-configured", isConfigured: false, portalId: null, lastSyncedAt: null, lastError: "HubSpot is not configured yet.", contactsSynced: 0, inbound: { ...EMPTY_HUBSPOT_INBOUND } };
  const connection = await connectionForWorkspace(ctx.workspaceId);
  if (!connection || (!connection.enabled && !connection.lastError)) return { state: "disconnected", isConfigured: true, portalId: null, lastSyncedAt: null, lastError: null, contactsSynced: 0, inbound: { ...EMPTY_HUBSPOT_INBOUND } };
  const [linked] = await db.select({ count: count() }).from(s.hubspotContactLinks)
    .where(eq(s.hubspotContactLinks.connectionId, connection.id));
  const [incoming] = await db.select({ contacts: sql<number>`count(*) filter(where ${s.hubspotInboundContacts.archivedAt} is null)`, issues: sql<number>`count(*) filter(where ${s.hubspotInboundContacts.importError} is not null and ${s.hubspotInboundContacts.archivedAt} is null)` }).from(s.hubspotInboundContacts).where(and(eq(s.hubspotInboundContacts.connectionId, connection.id), eq(s.hubspotInboundContacts.workspaceId, ctx.workspaceId)));
  const [pending] = await db.select({ total: count() }).from(s.hubspotContactInbox).where(and(eq(s.hubspotContactInbox.connectionId, connection.id), eq(s.hubspotContactInbox.workspaceId, ctx.workspaceId)));
  const abandoned = (connection.inboundState === "running" && (!connection.inboundLeaseUntil || connection.inboundLeaseUntil.getTime() < Date.now())) || (connection.inboundState === "queued" && !connection.inboundLeaseToken && (connection.inboundStartedAt?.getTime() ?? 0) < Date.now() - 30_000);
  return {
    state: connection.lastError ? "error" : "connected",
    isConfigured: true,
    portalId: connection.portalId,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    lastError: connection.lastError,
    contactsSynced: linked?.count ?? 0,
    inbound: { enabled: connection.inboundEnabled, state: abandoned ? "paused" : z.enum(["idle", "queued", "running", "paused", "error", "ready"]).catch("error").parse(connection.inboundState), processed: connection.inboundProcessed, contacts: Number(incoming?.contacts ?? 0), issues: Number(incoming?.issues ?? 0), pending: Number(pending?.total ?? 0), lastSyncedAt: connection.inboundLastSyncedAt?.toISOString() ?? null, lastWebhookAt: connection.inboundLastWebhookAt?.toISOString() ?? null, error: connection.inboundLastError ?? connection.webhookLastError },
  };
}

export function beginHubSpotConnect(ctx: RequestContext): { authorizationUrl: string } {
  requireHubSpotAdmin(ctx);
  const settings = config();
  const state = signOAuthState({ workspaceId: ctx.workspaceId, userId: ctx.userId, nonce: randomUUID(), expiresAt: Date.now() + 10 * 60_000 }, settings.encryptionKey);
  const url = new URL(HUBSPOT_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    scope: HUBSPOT_SCOPES.join(" "),
    state,
  }).toString();
  return { authorizationUrl: url.toString() };
}

export async function handleHubSpotCallback(request: Request): Promise<Response> {
  const settings = config();
  const url = new URL(request.url);
  const appUrl = new URL(settings.redirectUri);
  appUrl.pathname = "/app/settings";
  appUrl.search = "";
  try {
    const state = readOAuthState(url.searchParams.get("state") ?? "", settings.encryptionKey);
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, "HubSpot did not return an authorization code.");
    const [member] = await db.select({ role: s.workspaceMembers.role, eventScopeId: s.workspaceMembers.eventScopeId }).from(s.workspaceMembers).where(and(
      eq(s.workspaceMembers.workspaceId, state.workspaceId), eq(s.workspaceMembers.userId, state.userId),
    )).limit(1);
    if (!member || member.eventScopeId || (member.role !== "owner" && member.role !== "admin")) throw new HttpError(403, "This account cannot connect HubSpot for the workspace.");
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri,
      code,
    });
    if (!tokens.refresh_token || tokens.hub_id === undefined) throw new Error("HubSpot did not return an install identity.");
    const now = new Date();
    const previous = await connectionForWorkspace(state.workspaceId);
    if (previous && previous.portalId !== String(tokens.hub_id)) await db.delete(s.hubspotConnections).where(and(eq(s.hubspotConnections.id, previous.id), eq(s.hubspotConnections.workspaceId, state.workspaceId)));
    const values = {
      portalId: String(tokens.hub_id),
      connectedByUserId: state.userId,
      accessTokenCiphertext: sealToken(tokens.access_token, settings.encryptionKey),
      refreshTokenCiphertext: sealToken(tokens.refresh_token, settings.encryptionKey),
      accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1_000),
      enabled: true,
      lastError: null,
      updatedAt: now,
    };
    await db.insert(s.hubspotConnections).values({ id: newId("hsp"), workspaceId: state.workspaceId, ...values })
      .onConflictDoUpdate({ target: s.hubspotConnections.workspaceId, set: values });
    appUrl.searchParams.set("hubspot", "connected");
  } catch (error) {
    console.error("[hubspot] callback", error);
    appUrl.searchParams.set("hubspot", "error");
  }
  return Response.redirect(appUrl, 302);
}

export async function syncHubSpotEvent(ctx: RequestContext, eventId: string): Promise<HubSpotSyncResult> {
  requireHubSpotAdmin(ctx);
  const connection = await connectionForWorkspace(ctx.workspaceId);
  if (!connection?.enabled) throw new HttpError(409, "Connect HubSpot first.");
  const event = await repos.events.get(ctx, eventId);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  const rows = await repos.registrations.listForEvent(ctx, eventId);
  let synced = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await syncOne(connection, row.id) === "synced") synced += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await recordError(connection.id, error);
    }
  }
  const lastSyncedAt = new Date();
  await db.update(s.hubspotConnections).set({ lastSyncedAt, ...(failed === 0 ? { lastError: null } : {}), updatedAt: lastSyncedAt })
    .where(eq(s.hubspotConnections.id, connection.id));
  return { synced, skipped, failed, lastSyncedAt: lastSyncedAt.toISOString() };
}

export async function setHubSpotEventSync(ctx: RequestContext, eventId: string, enabled: boolean): Promise<HubSpotEventSyncResult> {
  requireHubSpotAdmin(ctx);
  const event = await repos.events.update(ctx, eventId, { hubspotSyncEnabled: enabled });
  const result = enabled
    ? await syncHubSpotEvent(ctx, eventId)
    : { synced: 0, skipped: 0, failed: 0, lastSyncedAt: new Date().toISOString() };
  return { event, ...result };
}

export async function disconnectHubSpot(ctx: RequestContext): Promise<void> {
  requireHubSpotAdmin(ctx);
  const connection = await connectionForWorkspace(ctx.workspaceId);
  if (!connection) return;
  try {
    await hubspotAuthorizedRequest(connection, "/appinstalls/v3/external-install", z.unknown(), { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof HubSpotApiError && error.status === 404)) {
      await db.update(s.hubspotConnections).set({ enabled: false, inboundEnabled: false, lastError: "Sync is paused, but HubSpot could not remove the app. Retry disconnecting or remove Beebizy from HubSpot's Connected Apps." }).where(eq(s.hubspotConnections.id, connection.id));
      console.error("[hubspot] uninstall", error instanceof Error ? error.message : "Removal failed");
      throw new HttpError(502, "Sync is paused. HubSpot removal failed; retry or remove Beebizy in HubSpot's Connected Apps.");
    }
  }
  // Retain the source history and unsubscribe restrictions after uninstalling.
  // HubSpot has revoked the OAuth grant; disabled connections cannot issue API requests.
  await db.update(s.hubspotConnections).set({ enabled: false, inboundEnabled: false, inboundState: "paused", inboundLeaseToken: null, inboundLeaseUntil: null, webhookLeaseToken: null, webhookLeaseUntil: null, lastError: null }).where(eq(s.hubspotConnections.id, connection.id));
}
