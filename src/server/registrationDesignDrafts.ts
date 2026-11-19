import { and, eq, sql } from "drizzle-orm";
import { registrationDesignDraftSchema, type RegistrationDesignDraft } from "../data/registrationDesignDraft.ts";
import { HttpError, requireEventAccess, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { events } from "./schema.ts";

export async function getRegistrationDesignDraft(ctx: RequestContext, eventId: string): Promise<RegistrationDesignDraft | null> {
  requireEventAccess(ctx, eventId);
  const [row] = await db.select({ draft: sql`coalesce(${events.registrationPage}, '{}'::jsonb) #> ARRAY['_editorDrafts', ${ctx.userId}::text]` }).from(events)
    .where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) throw new HttpError(404, "That event no longer exists.");
  const parsed = registrationDesignDraftSchema.safeParse(row.draft);
  return parsed.success ? parsed.data : null;
}

export async function saveRegistrationDesignDraft(ctx: RequestContext, eventId: string, value: unknown): Promise<RegistrationDesignDraft> {
  requireEventAccess(ctx, eventId);
  const draft = registrationDesignDraftSchema.parse(value);
  if (draft.revision > Date.now() + 300_000) throw new HttpError(400, "Your device clock is ahead. Your recovery copy remains on this device.");
  // Private metadata stays outside the public normalization whitelist. Draft writes
  // never change published fields or the event's updated-at timestamp.
  const [saved] = await db.update(events).set({
    registrationPage: sql`jsonb_set(coalesce(${events.registrationPage}, '{}'::jsonb), '{_editorDrafts}', coalesce(${events.registrationPage}->'_editorDrafts', '{}'::jsonb) || jsonb_build_object(${ctx.userId}::text, ${JSON.stringify(draft)}::jsonb))`,
  }).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId),
    sql`coalesce((${events.registrationPage} #>> ARRAY['_editorDrafts', ${ctx.userId}::text, 'revision'])::bigint, 0) < ${draft.revision}`,
  )).returning({ id: events.id });
  if (saved) return draft;
  const current = await getRegistrationDesignDraft(ctx, eventId);
  if (!current) throw new HttpError(409, "The invitation draft could not be saved. Your device recovery copy is preserved.");
  return current;
}
