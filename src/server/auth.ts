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
import { and, eq } from "drizzle-orm";
import { hasInternalAccess } from "../lib/internalAccess.ts";
import { isPrivateBetaHost } from "../lib/privateBetaHost.ts";
import { db } from "./db.ts";
import { workspaceMembers, workspaces } from "./schema.ts";

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

/** Verifies the bearer token and confirms the user is one of the approved operators. */
async function requireInternalUserId(request: Request): Promise<string> {
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
    primaryEmail =
      user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Clerk user lookup failed while verifying internal access.", error);
    throw new HttpError(503, `Unable to verify internal access: ${detail}`);
  }

  if (!hasInternalAccess(primaryEmail, process.env.BETA_ACCESS_EMAILS)) {
    throw new HttpError(403, "This account does not have access to Beebizy Studio.");
  }

  return userId;
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

  const userId = await requireInternalUserId(request);
  const orgHeader = request.headers.get("x-clerk-org-id");
  const { workspaceId, role, access } = await resolveWorkspace(
    userId,
    orgHeader && orgHeader !== "null" ? orgHeader : null,
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
export function requireRole(context: RequestContext, allowed: Role[]): void {
  if (!allowed.includes(context.role)) {
    throw new HttpError(403, `Your role (${context.role}) can't perform that action.`);
  }
}

export { newId };
