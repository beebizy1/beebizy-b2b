import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeWorkspaceProfile, organizationSignInPath, workspaceProfileSchema, type OrganizationSummary, type OrganizationWorkspace } from "../data/workspaceProfile.ts";
import { registrationGuestDraftSchema, type RegistrationGuestDraft } from "../data/registrationGuestDraft.ts";
import { db } from "./db.ts";
import { HttpError, requireBeebizyOperator, type RequestContext } from "./auth.ts";
import { operatorDrafts, workspaces, workspaceMembers, workspaceInvites, events } from "./schema.ts";

const profileInput = z.object({ name: z.string().trim().min(1).max(150), profile: workspaceProfileSchema });
const draftKey = z.string().regex(/^(new-organization|workspace-ws_[a-zA-Z0-9_-]+)$/).max(160);
const editorKey = z.string().regex(/^vendor-[a-zA-Z0-9_-]{1,120}$/);

function summary(row: typeof workspaces.$inferSelect): OrganizationWorkspace {
  return { id: row.id, name: row.name, profile: normalizeWorkspaceProfile(row.productProfile), revision: row.profileRevision, updatedAt: row.updatedAt?.toISOString() ?? "", signInPath: organizationSignInPath(row.id) };
}

export async function listMyOrganizations(ctx: RequestContext): Promise<OrganizationWorkspace[]> {
  const rows = await db.select({ workspace: workspaces }).from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, ctx.userId)).orderBy(asc(workspaces.name));
  return rows.map(row => summary(row.workspace));
}

export async function listOrganizations(ctx: RequestContext): Promise<OrganizationSummary[]> {
  requireBeebizyOperator(ctx.email);
  const [rows,eventCounts,members] = await Promise.all([
    db.select().from(workspaces).orderBy(asc(workspaces.name)),
    db.select({workspaceId:events.workspaceId,count:sql<number>`count(*)::int`}).from(events).groupBy(events.workspaceId),
    db.select({workspaceId:workspaceMembers.workspaceId,userId:workspaceMembers.userId}).from(workspaceMembers),
  ]);
  const counts=new Map(eventCounts.map(row=>[row.workspaceId,row.count]));
  const memberCounts=new Map<string,number>();const canOpen=new Set<string>();
  for(const member of members){memberCounts.set(member.workspaceId,(memberCounts.get(member.workspaceId)??0)+1);if(member.userId===ctx.userId)canOpen.add(member.workspaceId);}
  return rows.map(row=>({...summary(row),memberCount:memberCounts.get(row.id)??0,eventCount:counts.get(row.id)??0,canOpen:canOpen.has(row.id),previous:row.previousProductProfile}));
}

export async function updateOrganization(ctx: RequestContext, id: string, raw: unknown): Promise<OrganizationWorkspace> {
  requireBeebizyOperator(ctx.email);
  const input = profileInput.extend({ expectedRevision: z.number().int().nonnegative() }).parse(raw);
  const [current] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!current) throw new HttpError(404, "This organization no longer exists.");
  const [saved] = await db.update(workspaces).set({ name: input.name, productProfile: input.profile,
    previousProductProfile: { name: current.name, profile: normalizeWorkspaceProfile(current.productProfile), revision: current.profileRevision },
    profileRevision: sql`${workspaces.profileRevision} + 1`, updatedAt: new Date(),
  }).where(and(eq(workspaces.id, id), eq(workspaces.profileRevision, input.expectedRevision))).returning();
  if (!saved) throw new HttpError(409, "Someone saved newer organization settings. Your draft is safe. Reload the latest settings before saving.");
  console.warn("ORGANIZATION_PROFILE_SAVED", { workspaceId: id, actorId: ctx.userId, revision: saved.profileRevision });
  return summary(saved);
}

export async function createOrganization(ctx: RequestContext, raw: unknown): Promise<OrganizationWorkspace> {
  requireBeebizyOperator(ctx.email);
  const input = profileInput.extend({ requestId:z.string().uuid(), pilotEmail: z.string().trim().email().max(320).transform(value => value.toLowerCase()) }).parse(raw);
  if (input.pilotEmail === ctx.email?.toLowerCase()) throw new HttpError(400, "Enter the pilot administrator's email. Your staff account is added separately.");
  const id = `ws_${input.requestId.replaceAll("-", "")}`;
  const [existing]=await db.select().from(workspaces).where(eq(workspaces.id,id)).limit(1);
  if(existing){
    const [member]=await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId,id),eq(workspaceMembers.userId,ctx.userId))).limit(1);
    if(!member||existing.name!==input.name||JSON.stringify(normalizeWorkspaceProfile(existing.productProfile))!==JSON.stringify(normalizeWorkspaceProfile(input.profile)))throw new HttpError(409,"This organization submission was already used. Open its existing workspace.");
    return summary(existing);
  }
  const[pending]=await db.select({id:workspaceInvites.id}).from(workspaceInvites).where(and(eq(workspaceInvites.email,input.pilotEmail),isNull(workspaceInvites.acceptedAt))).limit(1);
  if(pending)throw new HttpError(409,"This pilot already has a pending organization invitation. Open their existing workspace or resolve that invitation first.");
  const result = await db.batch([
    db.insert(workspaces).values({ id, name: input.name, productProfile: input.profile, subscriptionStatus: "beta", eventQuotaExempt: true }).returning(),
    db.insert(workspaceMembers).values({ workspaceId: id, userId: ctx.userId, email: ctx.email, role: "owner" }),
    db.insert(workspaceInvites).values({ id: `invite_${crypto.randomUUID().replaceAll("-", "")}`, workspaceId: id, email: input.pilotEmail, role: "owner", invitedBy: ctx.userId }),
  ]);
  const created = result[0][0];
  if (!created) throw new HttpError(500, "The organization could not be created.");
  console.warn("ORGANIZATION_CREATED", { workspaceId: id, actorId: ctx.userId });
  return summary(created);
}

export async function getOperatorDraft(ctx: RequestContext, key: string): Promise<RegistrationGuestDraft | null> {
  requireBeebizyOperator(ctx.email); draftKey.parse(key);
  const [row] = await db.select({ draft: operatorDrafts.draft }).from(operatorDrafts).where(and(eq(operatorDrafts.userId, ctx.userId), eq(operatorDrafts.key, key))).limit(1);
  return row?.draft ?? null;
}

export async function saveOperatorDraft(ctx: RequestContext, key: string, raw: unknown): Promise<RegistrationGuestDraft> {
  requireBeebizyOperator(ctx.email); draftKey.parse(key);
  const draft = registrationGuestDraftSchema.parse(raw);
  if (draft.revision > Date.now() + 300_000) throw new HttpError(400, "Your device clock is ahead. Your draft remains on this device.");
  const [row] = await db.insert(operatorDrafts).values({ userId: ctx.userId, key, draft }).onConflictDoUpdate({
    target: [operatorDrafts.userId, operatorDrafts.key], set: { draft, updatedAt: new Date() },
    setWhere: sql`coalesce((${operatorDrafts.draft}->>'revision')::bigint, 0) < ${draft.revision}`,
  }).returning({ draft: operatorDrafts.draft });
  return row?.draft ?? (await getOperatorDraft(ctx,key))!;
}

/** Personal drafts are scoped to both the verified user and current organization. */
export async function getPrivateEditorDraft(ctx:RequestContext,key:string):Promise<RegistrationGuestDraft|null>{
  editorKey.parse(key);
  const [row]=await db.select({draft:operatorDrafts.draft}).from(operatorDrafts).where(and(eq(operatorDrafts.userId,ctx.userId),eq(operatorDrafts.key,`${ctx.workspaceId}:${key}`))).limit(1);
  return row?.draft??null;
}
export async function savePrivateEditorDraft(ctx:RequestContext,key:string,raw:unknown):Promise<RegistrationGuestDraft>{
  editorKey.parse(key);const draft=registrationGuestDraftSchema.parse(raw);
  if(draft.revision>Date.now()+300_000)throw new HttpError(400,"Your device clock is ahead. Your draft stays on this device.");
  const [row]=await db.insert(operatorDrafts).values({userId:ctx.userId,key:`${ctx.workspaceId}:${key}`,draft}).onConflictDoUpdate({target:[operatorDrafts.userId,operatorDrafts.key],set:{draft,updatedAt:new Date()},setWhere:sql`coalesce((${operatorDrafts.draft}->>'revision')::bigint,0)<${draft.revision}`}).returning({draft:operatorDrafts.draft});
  return row?.draft??(await getPrivateEditorDraft(ctx,key))!;
}
