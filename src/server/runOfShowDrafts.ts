import { and, asc, eq, lte } from "drizzle-orm";
import type { RunOfShowSyncedDraft } from "../data/runOfShowRecovery.ts";
import { normalizeRunOfShowEditorDraft } from "../data/runOfShowRecovery.ts";
import { HttpError, requireEventAccess, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import * as s from "./schema.ts";

const DRAFT_KEY = /^[a-zA-Z0-9_-]{1,160}$/;

function validDraftKey(value: string): string {
  if (!DRAFT_KEY.test(value)) throw new HttpError(400, "That Run of Show draft key is not valid.");
  return value;
}

function validClientUpdatedAt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > Date.now() + 5 * 60_000) {
    throw new HttpError(400, "The Run of Show draft timestamp is not valid.");
  }
  return parsed;
}

async function requireDraftEvent(ctx: RequestContext, eventId: string): Promise<void> {
  requireEventAccess(ctx, eventId);
  const [event] = await db.select({ id: s.events.id }).from(s.events).where(and(
    eq(s.events.id, eventId),
    eq(s.events.workspaceId, ctx.workspaceId),
  )).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
}

function toSyncedDraft(row: typeof s.runOfShowDrafts.$inferSelect): RunOfShowSyncedDraft | null {
  const draft = normalizeRunOfShowEditorDraft(row.draft);
  if (row.discarded || !draft) return null;
  return {
    draftKey: row.draftKey,
    draft,
    clientUpdatedAt: row.clientUpdatedAt,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRunOfShowDrafts(ctx: RequestContext, eventId: string): Promise<RunOfShowSyncedDraft[]> {
  await requireDraftEvent(ctx, eventId);
  const rows = await db.select().from(s.runOfShowDrafts).where(and(
    eq(s.runOfShowDrafts.workspaceId, ctx.workspaceId),
    eq(s.runOfShowDrafts.eventId, eventId),
    eq(s.runOfShowDrafts.userId, ctx.userId),
    eq(s.runOfShowDrafts.discarded, false),
  )).orderBy(asc(s.runOfShowDrafts.draftKey));
  return rows.flatMap((row) => {
    const draft = toSyncedDraft(row);
    return draft ? [draft] : [];
  });
}

export async function saveRunOfShowDraft(
  ctx: RequestContext,
  eventId: string,
  rawDraftKey: string,
  rawDraft: unknown,
  rawClientUpdatedAt: unknown,
): Promise<RunOfShowSyncedDraft | null> {
  await requireDraftEvent(ctx, eventId);
  const draftKey = validDraftKey(rawDraftKey);
  const draft = normalizeRunOfShowEditorDraft(rawDraft);
  if (!draft) throw new HttpError(400, "The Run of Show draft is incomplete or too large.");
  const clientUpdatedAt = validClientUpdatedAt(rawClientUpdatedAt);
  const now = new Date();
  const [saved] = await db.insert(s.runOfShowDrafts).values({
    workspaceId: ctx.workspaceId,
    eventId,
    userId: ctx.userId,
    draftKey,
    draft,
    clientUpdatedAt,
    discarded: false,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [
      s.runOfShowDrafts.workspaceId,
      s.runOfShowDrafts.eventId,
      s.runOfShowDrafts.userId,
      s.runOfShowDrafts.draftKey,
    ],
    set: { draft, clientUpdatedAt, discarded: false, updatedAt: now },
    setWhere: lte(s.runOfShowDrafts.clientUpdatedAt, clientUpdatedAt),
  }).returning();
  if (saved) return toSyncedDraft(saved);
  const [current] = await db.select().from(s.runOfShowDrafts).where(and(
    eq(s.runOfShowDrafts.workspaceId, ctx.workspaceId),
    eq(s.runOfShowDrafts.eventId, eventId),
    eq(s.runOfShowDrafts.userId, ctx.userId),
    eq(s.runOfShowDrafts.draftKey, draftKey),
  )).limit(1);
  return current ? toSyncedDraft(current) : null;
}

export async function discardRunOfShowDraft(
  ctx: RequestContext,
  eventId: string,
  rawDraftKey: string,
  rawClientUpdatedAt: unknown,
): Promise<void> {
  await requireDraftEvent(ctx, eventId);
  const draftKey = validDraftKey(rawDraftKey);
  const clientUpdatedAt = validClientUpdatedAt(rawClientUpdatedAt);
  const now = new Date();
  await db.insert(s.runOfShowDrafts).values({
    workspaceId: ctx.workspaceId,
    eventId,
    userId: ctx.userId,
    draftKey,
    draft: null,
    clientUpdatedAt,
    discarded: true,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [
      s.runOfShowDrafts.workspaceId,
      s.runOfShowDrafts.eventId,
      s.runOfShowDrafts.userId,
      s.runOfShowDrafts.draftKey,
    ],
    set: { draft: null, clientUpdatedAt, discarded: true, updatedAt: now },
    setWhere: lte(s.runOfShowDrafts.clientUpdatedAt, clientUpdatedAt),
  });
}
