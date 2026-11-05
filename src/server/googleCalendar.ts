import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, count, eq, gte, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type {
  Event,
  EventPatch,
  GoogleCalendarConnectionStatus,
  GoogleCalendarSyncResult,
} from "../data/entities.ts";
import type { RequestContext } from "./auth.ts";
import { HttpError } from "./auth.ts";
import { db } from "./db.ts";
import * as repos from "./repos.ts";
import * as s from "./schema.ts";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com";
const CHANNEL_LIFETIME_MS = 6 * 24 * 60 * 60 * 1_000;
const CHANNEL_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
const userInfoSchema = z.object({ email: z.string().email() });
const googleEventSchema = z.object({
  id: z.string().min(1),
  etag: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  updated: z.string().datetime({ offset: true }).optional(),
  start: z.object({ dateTime: z.string().datetime({ offset: true }).optional(), date: z.string().optional(), timeZone: z.string().optional() }).optional(),
  end: z.object({ dateTime: z.string().datetime({ offset: true }).optional(), date: z.string().optional(), timeZone: z.string().optional() }).optional(),
  extendedProperties: z.object({
    private: z.record(z.string()).optional(),
  }).optional(),
});
const eventsListSchema = z.object({
  items: z.array(googleEventSchema).optional().default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});
const watchSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  expiration: z.string().optional(),
});

type Connection = typeof s.googleCalendarConnections.$inferSelect;
type EventLink = typeof s.googleCalendarEventLinks.$inferSelect;
type GoogleEvent = z.infer<typeof googleEventSchema>;

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

interface OAuthState {
  workspaceId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function configured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() &&
      process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}

function config(): GoogleConfig {
  if (!configured()) {
    throw new HttpError(503, "Google Calendar is not configured yet.");
  }
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim(),
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!.trim(),
    encryptionKey: process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY!.trim(),
  };
}

function keyBytes(encoded: string): Buffer {
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32) throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be 32 base64 bytes.");
  return decoded;
}

/** AES-GCM keeps stored refresh tokens confidential and detects any database tampering. */
export function sealToken(token: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openToken(sealed: string, encodedKey: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = sealed.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Stored Google token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(encodedKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signOAuthState(payload: OAuthState, encodedKey: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", keyBytes(encodedKey)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readOAuthState(value: string, encodedKey: string, now = Date.now()): OAuthState {
  const [body, suppliedSignature] = value.split(".");
  if (!body || !suppliedSignature) throw new HttpError(400, "Google Calendar connection state is invalid.");
  const expected = createHmac("sha256", keyBytes(encodedKey)).update(body).digest();
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new HttpError(400, "Google Calendar connection state is invalid.");
  }
  const parsed = z.object({
    workspaceId: z.string().min(1),
    userId: z.string().min(1),
    nonce: z.string().uuid(),
    expiresAt: z.number().int(),
  }).parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (parsed.expiresAt < now) throw new HttpError(400, "Google Calendar connection expired. Start again from Settings.");
  return parsed;
}

function channelTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function parseGoogleResponse<T>(response: Response, schema: z.ZodType<T>, label: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    let reason = `${response.status}`;
    try {
      const payload = JSON.parse(body) as { error?: { message?: string } | string };
      reason = typeof payload.error === "string" ? payload.error : payload.error?.message ?? reason;
    } catch {
      // The status is sufficient when Google did not return JSON.
    }
    throw new Error(`${label} failed (${response.status}): ${reason}`);
  }
  return schema.parse(body ? JSON.parse(body) : {});
}

async function exchangeAuthorizationCode(code: string): Promise<z.infer<typeof tokenResponseSchema>> {
  const settings = config();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return parseGoogleResponse(response, tokenResponseSchema, "Google authorization");
}

async function accessToken(connection: Connection): Promise<string> {
  const settings = config();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: openToken(connection.refreshTokenCiphertext, settings.encryptionKey),
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return (await parseGoogleResponse(response, tokenResponseSchema, "Google token refresh")).access_token;
}

async function googleRequest<T>(
  accessTokenValue: string,
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessTokenValue}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return parseGoogleResponse(response, schema, "Google Calendar request");
}

async function googleRequestEmpty(accessTokenValue: string, path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessTokenValue}`, ...init.headers },
  });
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw new Error(`Google Calendar request failed: ${response.status}`);
}

function connectionFor(ctx: RequestContext): Promise<Connection | undefined> {
  return db
    .select()
    .from(s.googleCalendarConnections)
    .where(and(
      eq(s.googleCalendarConnections.workspaceId, ctx.workspaceId),
      eq(s.googleCalendarConnections.userId, ctx.userId),
    ))
    .limit(1)
    .then((rows) => rows[0]);
}

function eventUpdatedAt(event: Event): Date {
  return new Date(event.updatedAt ?? event.createdAt);
}

/** Only fields visible in Beebizy's event editor are mirrored to Google. */
export function buildGoogleEventPayload(event: Event): Record<string, unknown> {
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + 60 * 60 * 1_000);
  return {
    summary: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    start: { dateTime: start.toISOString(), ...(event.timeZone ? { timeZone: event.timeZone } : {}) },
    end: { dateTime: end.toISOString(), ...(event.timeZone ? { timeZone: event.timeZone } : {}) },
    extendedProperties: {
      private: { beebizy: "true", beebizyEventId: event.id, beebizyWorkspaceId: event.ownerId },
    },
  };
}

export function googleEventPatch(event: GoogleEvent): EventPatch | null {
  const start = event.start;
  const startsAt = start?.dateTime;
  if (!startsAt) return null;
  const patch: EventPatch = { date: new Date(startsAt).toISOString() };
  if (event.summary !== undefined) patch.title = event.summary.trim() || "Untitled event";
  if (event.description !== undefined) patch.description = event.description;
  if (event.location !== undefined) patch.location = event.location;
  if (event.end?.dateTime) patch.endDate = new Date(event.end.dateTime).toISOString();
  if (start.timeZone) patch.timeZone = start.timeZone;
  return patch;
}

export function parseGoogleEvent(value: unknown): GoogleEvent {
  return googleEventSchema.parse(value);
}

async function recordConnectionError(connectionId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 1_000) : "Google Calendar sync failed.";
  console.error("[google-calendar]", connectionId, error);
  await db.update(s.googleCalendarConnections).set({ lastError: message, updatedAt: new Date() })
    .where(eq(s.googleCalendarConnections.id, connectionId));
}

async function pushEvent(connection: Connection, event: Event): Promise<boolean> {
  const [link] = await db.select().from(s.googleCalendarEventLinks).where(and(
    eq(s.googleCalendarEventLinks.connectionId, connection.id),
    eq(s.googleCalendarEventLinks.eventId, event.id),
  )).limit(1);
  const changedAt = eventUpdatedAt(event);
  if (link?.lastBeebizyUpdatedAt && changedAt <= link.lastBeebizyUpdatedAt && !link.googleDeletedAt) return false;
  if (link?.googleDeletedAt && link.lastBeebizyUpdatedAt && changedAt <= link.lastBeebizyUpdatedAt) return false;

  const token = await accessToken(connection);
  const calendarId = encodeURIComponent(connection.calendarId);
  const payload = buildGoogleEventPayload(event);
  const result = link && !link.googleDeletedAt
    ? await googleRequest(
        token,
        `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.googleEventId)}`,
        googleEventSchema,
        { method: "PATCH", body: JSON.stringify(payload) },
      )
    : await googleRequest(
        token,
        `/calendar/v3/calendars/${calendarId}/events`,
        googleEventSchema,
        { method: "POST", body: JSON.stringify(payload) },
      );
  const now = new Date();
  const values = {
    workspaceId: connection.workspaceId,
    connectionId: connection.id,
    eventId: event.id,
    googleEventId: result.id,
    googleEtag: result.etag ?? null,
    googleUpdatedAt: result.updated ? new Date(result.updated) : now,
    googleDeletedAt: null,
    lastBeebizyUpdatedAt: changedAt,
    lastSyncedAt: now,
    updatedAt: now,
  };
  await db.insert(s.googleCalendarEventLinks).values({ id: link?.id ?? newId("gcel"), ...values })
    .onConflictDoUpdate({
      target: [s.googleCalendarEventLinks.connectionId, s.googleCalendarEventLinks.eventId],
      set: values,
    });
  await db.update(s.googleCalendarConnections).set({ lastSyncedAt: now, lastError: null, updatedAt: now })
    .where(eq(s.googleCalendarConnections.id, connection.id));
  return true;
}

async function eventsForConnection(connection: Connection): Promise<Event[]> {
  const rows = await db.select().from(s.events).where(and(
    eq(s.events.workspaceId, connection.workspaceId),
    gte(s.events.startsAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)),
    or(
      eq(s.events.status, "draft"),
      eq(s.events.status, "published"),
      eq(s.events.status, "completed"),
    ),
  ));
  return rows.map((row) => ({
    id: row.id,
    ownerId: row.workspaceId,
    experience: row.experience === "santa-clara" ? "santa-clara" : "standard",
    title: row.title,
    description: row.description,
    date: row.startsAt.toISOString(),
    endDate: row.endsAt?.toISOString() ?? null,
    timeZone: row.timeZone,
    location: row.venue,
    locationId: row.locationId,
    locationRecord: null,
    capacity: row.capacity,
    status: row.status,
    category: row.category,
    imageUrl: row.imageUrl,
    registrationCount: 0,
    shareToken: row.shareToken,
    registrationPage: row.registrationPage ?? undefined,
    navigation: row.navigation,
    auctionPublicToken: row.auctionPublicToken,
    auctionPage: row.auctionPage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  })) as Event[];
}

async function pushAll(connection: Connection): Promise<number> {
  let synced = 0;
  for (const event of await eventsForConnection(connection)) {
    if (await pushEvent(connection, event)) synced += 1;
  }
  return synced;
}

async function saveSyncToken(connectionId: string, token: string | null): Promise<void> {
  await db.update(s.googleCalendarConnections).set({ syncToken: token, updatedAt: new Date() })
    .where(eq(s.googleCalendarConnections.id, connectionId));
}

async function fullSyncToken(connection: Connection, token: string): Promise<string> {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "2500", singleEvents: "true", showDeleted: "true" });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleRequest(
      token,
      `/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events?${params}`,
      eventsListSchema,
    );
    pageToken = result.nextPageToken;
    nextSyncToken = result.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new Error("Google Calendar did not provide a sync token.");
  await saveSyncToken(connection.id, nextSyncToken);
  return nextSyncToken;
}

async function applyGoogleChange(connection: Connection, link: EventLink, googleEvent: GoogleEvent): Promise<boolean> {
  const now = new Date();
  if (googleEvent.status === "cancelled") {
    await db.update(s.googleCalendarEventLinks).set({
      googleDeletedAt: now,
      googleEtag: googleEvent.etag ?? link.googleEtag,
      googleUpdatedAt: googleEvent.updated ? new Date(googleEvent.updated) : now,
      lastSyncedAt: now,
      updatedAt: now,
    }).where(eq(s.googleCalendarEventLinks.id, link.id));
    return false;
  }
  if (googleEvent.etag && googleEvent.etag === link.googleEtag) return false;
  const patch = googleEventPatch(googleEvent);
  if (!patch) return false;
  const updated = await repos.events.update({
    userId: connection.userId,
    email: connection.googleEmail,
    workspaceId: connection.workspaceId,
    role: "member",
    eventScopeId: null,
  }, link.eventId, patch as unknown as Record<string, unknown>);
  await db.update(s.googleCalendarEventLinks).set({
    googleEtag: googleEvent.etag ?? null,
    googleUpdatedAt: googleEvent.updated ? new Date(googleEvent.updated) : now,
    googleDeletedAt: null,
    lastBeebizyUpdatedAt: eventUpdatedAt(updated),
    lastSyncedAt: now,
    updatedAt: now,
  }).where(eq(s.googleCalendarEventLinks.id, link.id));
  await syncWorkspaceEvent(updated, connection.id);
  return true;
}

async function pullIncremental(connection: Connection): Promise<number> {
  const token = await accessToken(connection);
  let syncToken = connection.syncToken;
  if (!syncToken) syncToken = await fullSyncToken(connection, token);
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let synced = 0;
  try {
    do {
      const params = new URLSearchParams({
        syncToken,
        maxResults: "2500",
        singleEvents: "true",
        showDeleted: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const result = await googleRequest(
        token,
        `/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events?${params}`,
        eventsListSchema,
      );
      for (const googleEvent of result.items ?? []) {
        const [link] = await db.select().from(s.googleCalendarEventLinks).where(and(
          eq(s.googleCalendarEventLinks.connectionId, connection.id),
          eq(s.googleCalendarEventLinks.googleEventId, googleEvent.id),
        )).limit(1);
        if (link && await applyGoogleChange(connection, link, googleEvent)) synced += 1;
      }
      pageToken = result.nextPageToken;
      nextSyncToken = result.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
  } catch (error) {
    if (error instanceof Error && error.message.includes("410")) {
      await fullSyncToken(connection, token);
      return synced;
    }
    throw error;
  }
  if (nextSyncToken) await saveSyncToken(connection.id, nextSyncToken);
  const now = new Date();
  await db.update(s.googleCalendarConnections).set({ lastSyncedAt: now, lastError: null, updatedAt: now })
    .where(eq(s.googleCalendarConnections.id, connection.id));
  return synced;
}

async function stopChannel(connection: Connection): Promise<void> {
  if (!connection.channelId || !connection.channelResourceId) return;
  try {
    const token = await accessToken(connection);
    await googleRequestEmpty(token, "/calendar/v3/channels/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: connection.channelId, resourceId: connection.channelResourceId }),
    });
  } catch (error) {
    console.error("[google-calendar] Unable to stop old channel", connection.id, error);
  }
}

async function startWatch(connection: Connection): Promise<void> {
  await stopChannel(connection);
  const settings = config();
  const token = await accessToken(connection);
  const channelId = randomUUID();
  const rawChannelToken = randomBytes(32).toString("base64url");
  const expiration = Date.now() + CHANNEL_LIFETIME_MS;
  const callbackUrl = new URL(settings.redirectUri);
  callbackUrl.pathname = "/api/integrations/google-calendar/webhook";
  callbackUrl.search = "";
  const result = await googleRequest(
    token,
    `/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/watch`,
    watchSchema,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: callbackUrl.toString(),
        token: rawChannelToken,
        expiration: String(expiration),
      }),
    },
  );
  await db.update(s.googleCalendarConnections).set({
    channelId: result.id,
    channelResourceId: result.resourceId,
    channelTokenHash: channelTokenHash(rawChannelToken),
    channelExpiresAt: result.expiration ? new Date(Number(result.expiration)) : new Date(expiration),
    updatedAt: new Date(),
  }).where(eq(s.googleCalendarConnections.id, connection.id));
}

export async function googleCalendarStatus(ctx: RequestContext): Promise<GoogleCalendarConnectionStatus> {
  if (!configured()) {
    return {
      state: "not-configured",
      isConfigured: false,
      googleEmail: null,
      calendarSummary: null,
      lastSyncedAt: null,
      lastError: "Google Calendar is not configured yet.",
      eventsSynced: 0,
    };
  }
  const connection = await connectionFor(ctx);
  if (!connection) {
    return {
      state: "disconnected",
      isConfigured: true,
      googleEmail: null,
      calendarSummary: null,
      lastSyncedAt: null,
      lastError: null,
      eventsSynced: 0,
    };
  }
  const [linked] = await db.select({ count: count() }).from(s.googleCalendarEventLinks)
    .where(and(
      eq(s.googleCalendarEventLinks.connectionId, connection.id),
      isNull(s.googleCalendarEventLinks.googleDeletedAt),
    ));
  return {
    state: connection.lastError ? "error" : "connected",
    isConfigured: true,
    googleEmail: connection.googleEmail,
    calendarSummary: connection.calendarSummary,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    lastError: connection.lastError,
    eventsSynced: linked?.count ?? 0,
  };
}

export function beginGoogleCalendarConnect(ctx: RequestContext): { authorizationUrl: string } {
  const settings = config();
  const state = signOAuthState({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1_000,
  }, settings.encryptionKey);
  const url = new URL(OAUTH_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: ["openid", "email", "profile", GOOGLE_SCOPE].join(" "),
    state,
    ...(ctx.email ? { login_hint: ctx.email } : {}),
  }).toString();
  return { authorizationUrl: url.toString() };
}

export async function handleGoogleCalendarCallback(request: Request): Promise<Response> {
  const settings = config();
  const url = new URL(request.url);
  const appUrl = new URL(settings.redirectUri);
  appUrl.pathname = "/app/settings";
  appUrl.search = "";
  try {
    const state = readOAuthState(url.searchParams.get("state") ?? "", settings.encryptionKey);
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, "Google did not return an authorization code.");
    const [membership] = await db.select({ role: s.workspaceMembers.role }).from(s.workspaceMembers).where(and(
      eq(s.workspaceMembers.workspaceId, state.workspaceId),
      eq(s.workspaceMembers.userId, state.userId),
    )).limit(1);
    if (!membership) throw new HttpError(403, "This Beebizy account no longer has access to that workspace.");
    const tokens = await exchangeAuthorizationCode(code);
    const userInfo = await googleRequest(tokens.access_token, "/oauth2/v2/userinfo", userInfoSchema);
    const [existing] = await db.select().from(s.googleCalendarConnections).where(and(
      eq(s.googleCalendarConnections.workspaceId, state.workspaceId),
      eq(s.googleCalendarConnections.userId, state.userId),
    )).limit(1);
    const refreshToken = tokens.refresh_token
      ? sealToken(tokens.refresh_token, settings.encryptionKey)
      : existing?.refreshTokenCiphertext;
    if (!refreshToken) throw new HttpError(409, "Google did not provide offline calendar access. Connect again and approve access.");
    const connectionId = existing?.id ?? newId("gcal");
    const values = {
      workspaceId: state.workspaceId,
      userId: state.userId,
      googleEmail: userInfo.email.toLowerCase(),
      calendarId: "primary",
      calendarSummary: "Primary calendar",
      refreshTokenCiphertext: refreshToken,
      enabled: true,
      lastError: null,
      updatedAt: new Date(),
    };
    const [saved] = await db.insert(s.googleCalendarConnections).values({ id: connectionId, ...values })
      .onConflictDoUpdate({
        target: [s.googleCalendarConnections.workspaceId, s.googleCalendarConnections.userId],
        set: values,
      })
      .returning();
    await pushAll(saved!);
    const refreshed = (await db.select().from(s.googleCalendarConnections).where(eq(s.googleCalendarConnections.id, saved!.id)).limit(1))[0]!;
    await fullSyncToken(refreshed, await accessToken(refreshed));
    const withToken = (await db.select().from(s.googleCalendarConnections).where(eq(s.googleCalendarConnections.id, saved!.id)).limit(1))[0]!;
    await startWatch(withToken);
    appUrl.searchParams.set("calendar", "connected");
  } catch (error) {
    console.error("[google-calendar] callback", error);
    appUrl.searchParams.set("calendar", "error");
  }
  return Response.redirect(appUrl, 302);
}

export async function syncGoogleCalendarNow(ctx: RequestContext): Promise<GoogleCalendarSyncResult> {
  const connection = await connectionFor(ctx);
  if (!connection || !connection.enabled) throw new HttpError(409, "Connect Google Calendar first.");
  try {
    const pushed = await pushAll(connection);
    const refreshed = (await connectionFor(ctx))!;
    const pulled = await pullIncremental(refreshed);
    const latest = (await connectionFor(ctx))!;
    if (!latest.channelExpiresAt || latest.channelExpiresAt.getTime() < Date.now() + CHANNEL_RENEWAL_WINDOW_MS) {
      await startWatch(latest);
    }
    const lastSyncedAt = new Date();
    await db.update(s.googleCalendarConnections).set({ lastSyncedAt, lastError: null, updatedAt: lastSyncedAt })
      .where(eq(s.googleCalendarConnections.id, connection.id));
    return { eventsSynced: pushed + pulled, lastSyncedAt: lastSyncedAt.toISOString() };
  } catch (error) {
    await recordConnectionError(connection.id, error);
    throw new HttpError(502, "Google Calendar could not sync right now. Your Beebizy events are still safe.");
  }
}

export async function disconnectGoogleCalendar(ctx: RequestContext): Promise<void> {
  const connection = await connectionFor(ctx);
  if (!connection) return;
  await stopChannel(connection);
  await db.delete(s.googleCalendarConnections).where(and(
    eq(s.googleCalendarConnections.id, connection.id),
    eq(s.googleCalendarConnections.workspaceId, ctx.workspaceId),
    eq(s.googleCalendarConnections.userId, ctx.userId),
  ));
}

/** Best-effort event fan-out. A Google outage must never block saving in Beebizy. */
export async function syncWorkspaceEvent(event: Event, excludeConnectionId?: string): Promise<void> {
  const connections = await db.select().from(s.googleCalendarConnections).where(and(
    eq(s.googleCalendarConnections.workspaceId, event.ownerId),
    eq(s.googleCalendarConnections.enabled, true),
  ));
  for (const connection of connections) {
    if (connection.id === excludeConnectionId) continue;
    try {
      await pushEvent(connection, event);
    } catch (error) {
      await recordConnectionError(connection.id, error);
    }
  }
}

export async function removeWorkspaceEventFromCalendars(workspaceId: string, eventId: string): Promise<void> {
  const rows = await db.select({ connection: s.googleCalendarConnections, link: s.googleCalendarEventLinks })
    .from(s.googleCalendarEventLinks)
    .innerJoin(s.googleCalendarConnections, eq(s.googleCalendarEventLinks.connectionId, s.googleCalendarConnections.id))
    .where(and(
      eq(s.googleCalendarEventLinks.workspaceId, workspaceId),
      eq(s.googleCalendarEventLinks.eventId, eventId),
    ));
  for (const { connection, link } of rows) {
    try {
      const token = await accessToken(connection);
      await googleRequestEmpty(
        token,
        `/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(link.googleEventId)}`,
        { method: "DELETE" },
      );
    } catch (error) {
      await recordConnectionError(connection.id, error);
    }
  }
}

export async function handleGoogleCalendarWebhook(request: Request): Promise<Response> {
  const channelId = request.headers.get("x-goog-channel-id") ?? "";
  const channelToken = request.headers.get("x-goog-channel-token") ?? "";
  if (!channelId || !channelToken) return new Response(null, { status: 400 });
  const [connection] = await db.select().from(s.googleCalendarConnections)
    .where(eq(s.googleCalendarConnections.channelId, channelId)).limit(1);
  if (!connection?.channelTokenHash) return new Response(null, { status: 404 });
  const supplied = Buffer.from(channelTokenHash(channelToken));
  const expected = Buffer.from(connection.channelTokenHash);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, { status: 403 });
  }
  try {
    await pullIncremental(connection);
  } catch (error) {
    await recordConnectionError(connection.id, error);
  }
  return new Response(null, { status: 204 });
}

export async function renewGoogleCalendarChannels(): Promise<{ renewed: number; failed: number }> {
  const cutoff = new Date(Date.now() + CHANNEL_RENEWAL_WINDOW_MS);
  const connections = await db.select().from(s.googleCalendarConnections).where(and(
    eq(s.googleCalendarConnections.enabled, true),
    or(
      lt(s.googleCalendarConnections.channelExpiresAt, cutoff),
      isNull(s.googleCalendarConnections.channelExpiresAt),
    ),
  ));
  let renewed = 0;
  let failed = 0;
  for (const connection of connections) {
    try {
      await startWatch(connection);
      renewed += 1;
    } catch (error) {
      failed += 1;
      await recordConnectionError(connection.id, error);
    }
  }
  return { renewed, failed };
}
