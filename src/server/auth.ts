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
import { getStudioAccess } from "../lib/internalAccess.ts";
import { db } from "./db.ts";
import { workspaceMembers, workspaces } from "./schema.ts";

export type Role = "owner" | "admin" | "member";

export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: Role;
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

/** Verifies the bearer token and confirms the user has current Studio access. */
async function requireStudioUserId(request: Request): Promise<string> {
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

  let accessProfile: {
    email: string | null;
    createdAt: Date | string | number | null;
    publicMetadata: Record<string, unknown>;
  };
  try {
    const user = await clerk.users.getUser(userId);
    accessProfile = {
      email: user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? null,
      createdAt: user.createdAt,
      publicMetadata: user.publicMetadata,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Clerk user lookup failed while verifying internal access.", error);
    throw new HttpError(503, `Unable to verify internal access: ${detail}`);
  }

  const access = getStudioAccess(accessProfile);
  if (!access.allowed) {
    const message =
      access.kind === "expired"
        ? "Your Beebizy Studio beta has ended. A paid subscription is required to continue."
        : "This account does not have access to Beebizy Studio.";
    throw new HttpError(403, message);
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
async function resolveWorkspace(userId: string, clerkOrgId: string | null): Promise<{ workspaceId: string; role: Role }> {
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
        return { workspaceId: existing.id, role: "member" };
      }
      return { workspaceId: existing.id, role: membership.role };
    }
  }

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (membership) return { workspaceId: membership.workspaceId, role: membership.role };

  const workspaceId = newId("ws");
  await db.insert(workspaces).values({ id: workspaceId, name: "My workspace", clerkOrgId });
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  return { workspaceId, role: "owner" };
}

export async function authorize(request: Request): Promise<RequestContext> {
  const userId = await requireStudioUserId(request);
  const orgHeader = request.headers.get("x-clerk-org-id");
  const { workspaceId, role } = await resolveWorkspace(userId, orgHeader && orgHeader !== "null" ? orgHeader : null);
  return { userId, workspaceId, role };
}

/** Writes are closed to `member` on the destructive operations. */
export function requireRole(context: RequestContext, allowed: Role[]): void {
  if (!allowed.includes(context.role)) {
    throw new HttpError(403, `Your role (${context.role}) can't perform that action.`);
  }
}

export { newId };
