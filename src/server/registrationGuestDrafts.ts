import { and, eq, sql } from "drizzle-orm";
import { registrationGuestDraftKeySchema, registrationGuestDraftSchema, type RegistrationGuestDraft } from "../data/registrationGuestDraft.ts";
import { HttpError, requireEventAccess, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { events } from "./schema.ts";

export async function getRegistrationGuestDraft(ctx: RequestContext, eventId: string, rawKey: string): Promise<RegistrationGuestDraft | null> {
  requireEventAccess(ctx, eventId);
  const key = registrationGuestDraftKeySchema.parse(rawKey);
  const [row] = await db.select({ draft: sql`coalesce(${events.registrationPage}, '{}'::jsonb) #> ARRAY['_guestEditorDrafts', ${ctx.userId}::text, ${key}::text]` }).from(events)
    .where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) throw new HttpError(404, "That event no longer exists.");
  const parsed = registrationGuestDraftSchema.safeParse(row.draft);
  return parsed.success ? parsed.data : null;
}

/** Exported for the transaction-only Postgres verification script. */
export function registrationGuestDraftSaveQuery(ctx: Pick<RequestContext, "workspaceId" | "userId">, eventId: string, key: string, draft: RegistrationGuestDraft) {
  return db.update(events).set({
    registrationPage: sql`jsonb_set(coalesce(${events.registrationPage}, '{}'::jsonb), '{_guestEditorDrafts}', coalesce(${events.registrationPage}->'_guestEditorDrafts', '{}'::jsonb) || jsonb_build_object(${ctx.userId}::text, coalesce(${events.registrationPage} #> ARRAY['_guestEditorDrafts', ${ctx.userId}::text], '{}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(draft)}::jsonb)))`,
  }).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId),
    sql`coalesce((${events.registrationPage} #>> ARRAY['_guestEditorDrafts', ${ctx.userId}::text, ${key}::text, 'revision'])::bigint, 0) < ${draft.revision}`,
  )).returning({ page: events.registrationPage });
}

export async function saveRegistrationGuestDraft(ctx: RequestContext, eventId: string, rawKey: string, value: unknown): Promise<RegistrationGuestDraft> {
  requireEventAccess(ctx, eventId);
  const key = registrationGuestDraftKeySchema.parse(rawKey);
  const draft = registrationGuestDraftSchema.parse(value);
  if (draft.revision > Date.now() + 300_000) throw new HttpError(400, "Your device clock is ahead. Your guest details remain on this device.");
  const [saved] = await registrationGuestDraftSaveQuery(ctx, eventId, key, draft);
  if (saved) return draft;
  const current = await getRegistrationGuestDraft(ctx, eventId, key);
  if (!current) throw new HttpError(409, "Your guest draft could not be saved. Your device recovery copy is preserved.");
  return current;
}
