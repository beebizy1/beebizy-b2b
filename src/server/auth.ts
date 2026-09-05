/**
 * Request authorization.
 *
 * Every API call resolves to a Clerk user and then to a workspace that user is a member
 * of. Nothing reads or writes without that pair, and every query is filtered by the
 * resolved `workspaceId` — which is the fix for the thing the in-memory store got wrong:
 * it stamped one hard-coded owner on writes and filtered reads by nothing.
 *
 * The token is verified with Clerk's secret key on the server. It is never trusted from
 * the request body, and the workspace is never taken from a client-supplied parameter —
 * both are derived, because a tenant id that arrives in a payload is a tenant id an
 * attacker can change.
 */

import { createClerkClient, verifyToken } from "@clerk/backend";
import { and, eq, isNull } from "drizzle-orm";
import { hasInternalAccess } from "../lib/internalAccess.ts";
import { isPrivateBetaHost } from "../lib/privateBetaHost.ts";
import { db } from "./db.ts";
import { workspaceInvites, workspaceMembers, workspaces } from "./schema.ts";

export type Role = "owner" | "admin" | "member";

export type WorkspaceAccessStatus = "beta" | "active" | "expired" | "past_due" | "cancelled";

export interface WorkspaceAccess {
  status: WorkspaceAccessStatus;
  betaStartedAt: string;
  betaEndsAt: string;
}

export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: Role;
  access?: WorkspaceAccess;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const secretKey = process.env.CLERK_SECRET_KEY;
const clerk = secretKey ? createClerkClient({ secretKey }) : null;

/** Verifies the bearer token and confirms the user is an approved Studio operator or beta tester. */
async function requireInternalUser(request: Request): Promise<{ userId: string; email: string | null }> {
  if (!secretKey || !clerk) throw new HttpError(500, "CLERK_SECRET_KEY is not configured on the server.");

  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing bearer token.");

  let userId: string;
  try {
    const claims = await verifyToken(token, { secretKey });
    if (!claims.sub) throw new HttpError(401, "Token has no subject.");
    userId = claims.sub;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Session token is invalid or expired.");
  }

  let primaryEmail: string | null = null;
  try {
    const user = await clerk.users.getUser(userId);
    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
    /*
     * Only a verified address counts. The allowlist is an identity check, and an
     * unverified address is a claim rather than an identity: anyone can type a pilot
     * customer's address at sign-up, and without this that claim alone would pass the
     * check below. Clerk verifies email sign-ups by default, so this is the belt to that
     * braces — it costs nothing and it is the difference between the allowlist being a
     * lock and being a formality.
     */
    primaryEmail = primary?.verification?.status === "verified" ? primary.emailAddress : null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Clerk user lookup failed while verifying internal access.", error);
    throw new HttpError(503, `Unable to verify internal access: ${detail}`);
  }

  // Two ways in: the operator allowlist, or an invite someone with a workspace issued.
  // The second is what makes adding a colleague a click rather than a redeploy.
  if (!hasInternalAccess(primaryEmail, process.env.BETA_ACCESS_EMAILS) && !(await hasPendingInvite(primaryEmail))) {
    throw new HttpError(403, "This account does not have access to Beebizy Studio.");
  }

  return { userId, email: primaryEmail };
}

async function hasPendingInvite(email: string | null): Promise<boolean> {
  if (!email) return false;
  const [invite] = await db
    .select({ id: workspaceInvites.id })
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.email, email.trim().toLowerCase()), isNull(workspaceInvites.acceptedAt)))
    .limit(1);
  return Boolean(invite);
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

/**
 * The workspace a request acts on.
 *
 * An approved user's first request creates a workspace when one does not exist. When
 * Clerk organizations are in play the org id claims the workspace, which lets a team
 * share one.
 */
function accessForWorkspace(workspace: typeof workspaces.$inferSelect): WorkspaceAccess {
  const stored = workspace.subscriptionStatus;
  const status: WorkspaceAccessStatus =
    stored === "beta" && workspace.betaEndsAt.getTime() <= Date.now() ? "expired" : stored;
  return {
    status,
    betaStartedAt: workspace.betaStartedAt.toISOString(),
    betaEndsAt: workspace.betaEndsAt.toISOString(),
  };
}

async function resolveWorkspace(
  userId: string,
  clerkOrgId: string | null,
  email: string | null,
): Promise<{ workspaceId: string; role: Role; access: WorkspaceAccess }> {
  if (clerkOrgId) {
    const [existing] = await db.select().from(workspaces).where(eq(workspaces.clerkOrgId, clerkOrgId)).limit(1);
    if (existing) {
      const [membership] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, existing.id), eq(workspaceMembers.userId, userId)))
        .limit(1);
      // Being in the Clerk org is the source of truth; mirror it into membership once.
      if (!membership) {
        await db.insert(workspaceMembers).values({ workspaceId: existing.id, userId, role: "member" });
        return { workspaceId: existing.id, role: "member", access: accessForWorkspace(existing) };
      }
      return { workspaceId: existing.id, role: membership.role, access: accessForWorkspace(existing) };
    }
  }

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (membership) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, membership.workspaceId)).limit(1);
    if (!workspace) throw new HttpError(403, "Your workspace is no longer available.");
    return { workspaceId: membership.workspaceId, role: membership.role, access: accessForWorkspace(workspace) };
  }

  /*
   * An unclaimed invite is claimed here, on the first request after signing in. This runs
   * before the new-workspace path deliberately: without it an invited colleague would be
   * handed their own empty workspace and would see none of the events they were invited
   * to, which reads as data loss rather than as a bug.
   */
  if (email) {
    const [invite] = await db
      .select()
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.email, email.trim().toLowerCase()), isNull(workspaceInvites.acceptedAt)))
      .limit(1);
    if (invite) {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1);
      if (workspace) {
        await db.batch([
          db
            .insert(workspaceMembers)
            .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
            .onConflictDoNothing(),
          db
            .update(workspaceInvites)
            .set({ acceptedAt: new Date(), acceptedUserId: userId })
            .where(eq(workspaceInvites.id, invite.id)),
        ]);
        return { workspaceId: invite.workspaceId, role: invite.role, access: accessForWorkspace(workspace) };
      }
    }
  }

  const workspaceId = newId("ws");
  const [workspace] = await db
    .insert(workspaces)
    .values({ id: workspaceId, name: "My workspace", clerkOrgId })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  if (!workspace) throw new HttpError(500, "The workspace could not be created.");
  return { workspaceId, role: "owner", access: accessForWorkspace(workspace) };
}

export async function authorize(request: Request): Promise<RequestContext> {
  if (!isPrivateBetaHost(new URL(request.url).hostname)) {
    throw new HttpError(403, "Beebizy Studio beta access is available only at the private preview link.");
  }

  const { userId, email } = await requireInternalUser(request);
  const orgHeader = request.headers.get("x-clerk-org-id");
  const { workspaceId, role, access } = await resolveWorkspace(
    userId,
    orgHeader && orgHeader !== "null" ? orgHeader : null,
    email,
  );

  const url = new URL(request.url);
  const route = url.searchParams.get("__path") ?? url.pathname.replace(/^\/api\/?/, "");
  if (access.status !== "beta" && access.status !== "active" && route !== "me") {
    const message = access.status === "past_due"
      ? "Your Beebizy Studio payment is past due. Update the subscription to continue."
      : access.status === "cancelled"
        ? "Your Beebizy Studio subscription is cancelled. Reactivate it to continue."
        : "Your three-month Beebizy Studio beta has ended. Activate a subscription to continue.";
    throw new HttpError(402, message);
  }

  return { userId, workspaceId, role, access };
}

/** Writes are closed to `member` on the destructive operations. */
/**
 * Names and emails for a set of user ids, in one call to the identity provider.
 *
 * Membership lives in our database and identity lives in Clerk, so a team list has to
 * join the two. A lookup failure degrades to ids rather than failing the page — knowing
 * someone is an admin is more useful than an error, even without their name.
 */
export async function lookupUsers(
  userIds: string[],
): Promise<Map<string, { name: string | null; email: string | null }>> {
  const directory = new Map<string, { name: string | null; email: string | null }>();
  if (!clerk || userIds.length === 0) return directory;

  try {
    const { data } = await clerk.users.getUserList({ userId: userIds, limit: userIds.length });
    for (const user of data) {
      const email =
        user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? null;
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
      directory.set(user.id, { name, email });
    }
  } catch (error) {
    console.warn("MEMBER_DIRECTORY_LOOKUP_FAILED", error instanceof Error ? error.message : String(error));
  }
  return directory;
}

export function requireRole(context: RequestContext, allowed: Role[]): void {
  if (!allowed.includes(context.role)) {
    throw new HttpError(403, `Your role (${context.role}) can't perform that action.`);
  }
}

export { newId };
