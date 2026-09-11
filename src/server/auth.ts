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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  canAccessOperatorFeedbackInbox,
  hasInternalAccess,
  isBeebizyOperator,
} from "../lib/internalAccess.ts";
import { isPrivateBetaHost } from "../lib/privateBetaHost.ts";
import { db } from "./db.ts";
import { workspaceFitsPlanSeatLimit } from "./entitlements.ts";
import { workspaceInvites, workspaceMembers, workspaces } from "./schema.ts";
import { SOLO_TRIAL_DAYS, type PlanId } from "../data/plans.ts";
import type { WorkspaceAccessStatus } from "../data/workspaceAccess.ts";

export type Role = "owner" | "admin" | "member";

export interface WorkspaceAccess {
  status: WorkspaceAccessStatus;
  plan: PlanId | null;
  betaStartedAt: string;
  betaEndsAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingPortalAvailable?: boolean;
}

export interface RequestContext {
  userId: string;
  /** Verified primary Clerk email. Never taken from a request payload. */
  email: string | null;
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

/** Stops cross-workspace feedback reads unless the verified email is on the operator list. */
export function requireBeebizyOperator(email: string | null | undefined): void {
  if (!isBeebizyOperator(email)) {
    throw new HttpError(403, "Only the Beebizy product team can review pilot feedback.");
  }
}

const secretKey = process.env.CLERK_SECRET_KEY;
const clerk = secretKey ? createClerkClient({ secretKey }) : null;

/** Verifies the bearer token and the user's primary email before any workspace is resolved. */
async function requireVerifiedUser(request: Request): Promise<{ userId: string; email: string }> {
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
    console.error("Clerk user lookup failed while verifying the account.", error);
    throw new HttpError(503, `Unable to verify this account: ${detail}`);
  }

  if (!primaryEmail) throw new HttpError(403, "Verify your primary email before opening Beebizy Studio.");

  return { userId, email: primaryEmail };
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
    plan: workspace.subscriptionPlan,
    betaStartedAt: workspace.betaStartedAt.toISOString(),
    betaEndsAt: workspace.betaEndsAt.toISOString(),
    currentPeriodEnd: workspace.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: workspace.subscriptionCancelAtPeriodEnd,
    billingPortalAvailable: Boolean(workspace.stripeCustomerId),
  };
}

/**
 * Serializes seat creation with Solo activation and checks the plan from the database,
 * not from a request context that may have been authorized before a webhook ran.
 */
async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: Role,
  seatAlreadyReserved = false,
): Promise<boolean> {
  const entitlementLock = db
    .select({ locked: sql<number>`pg_advisory_xact_lock(hashtext(${workspaceId}))` })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const memberInsert = db
    .insert(workspaceMembers)
    .select(
      db
        .select({
          workspaceId: workspaces.id,
          userId: sql<string>`${userId}::text`.as("user_id"),
          role: sql<Role>`${role}::workspace_role`.as("role"),
        })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            isNull(workspaces.stripeCheckoutSessionId),
            // The seat ceiling of whatever plan the workspace is on, not Solo's alone.
            workspaceFitsPlanSeatLimit(workspaceId, seatAlreadyReserved ? 0 : 1),
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ userId: workspaceMembers.userId });

  const [, inserted] = await db.batch([entitlementLock, memberInsert]);
  if (inserted.length > 0) return true;
  const [existing] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return Boolean(existing);
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
        if (!(await addWorkspaceMember(existing.id, userId, "member"))) {
          throw new HttpError(403, "This workspace's Solo plan does not include another user.");
        }
        return { workspaceId: existing.id, role: "member", access: accessForWorkspace(existing) };
      }
      return { workspaceId: existing.id, role: membership.role, access: accessForWorkspace(existing) };
    }
  }

  /*
   * An unclaimed invite is claimed before anything else.
   *
   * It used to be checked only after an existing membership, which meant anyone who had
   * ever signed in — and so already had a workspace of their own — could never be joined
   * to the team that invited them. They stayed in their private empty workspace while the
   * owner watched the invite sit "pending" forever. Being invited is a deliberate act by
   * someone with authority over that workspace, so it takes precedence.
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
        if (!(await addWorkspaceMember(invite.workspaceId, userId, invite.role, true))) {
          throw new HttpError(403, "This workspace's Solo plan does not include another user.");
        }
        await db
          .update(workspaceInvites)
          .set({ acceptedAt: new Date(), acceptedUserId: userId })
          .where(eq(workspaceInvites.id, invite.id));
        return { workspaceId: invite.workspaceId, role: invite.role, access: accessForWorkspace(workspace) };
      }
    }
  }

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    // Most recently joined wins. Someone can hold their own workspace and later be
    // invited into a team's; without an order the tie is arbitrary and they flip between
    // the two on consecutive requests.
    .orderBy(desc(workspaceMembers.createdAt))
    .limit(1);
  if (membership) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, membership.workspaceId)).limit(1);
    if (!workspace) throw new HttpError(403, "Your workspace is no longer available.");
    return { workspaceId: membership.workspaceId, role: membership.role, access: accessForWorkspace(workspace) };
  }

  const workspaceId = newId("ws");
  /*
   * Three kinds of new workspace, and the first one is the reason this is not a boolean.
   *
   * Beebizy staff are not customers of Beebizy. A beta expires, so leaving them on one
   * meant the founder and the CTO would eventually be shown a card form for the product
   * they are building. They get the full plan outright, with no subscription behind it
   * and nothing to renew.
   *
   * A pilot customer keeps the three free months they were promised and is asked to
   * choose a plan when that ends. Every public signup stays locked until card-backed
   * Solo Checkout completes.
   */
  const staff = isBeebizyOperator(email);
  const pilot = hasInternalAccess(email, process.env.BETA_ACCESS_EMAILS);
  const [workspace] = await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: "My workspace",
      clerkOrgId,
      subscriptionStatus: staff ? "active" : pilot ? "beta" : "pending",
      subscriptionPlan: staff ? "enterprise" : null,
      eventQuotaExempt: staff,
    })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  if (!workspace) throw new HttpError(500, "The workspace could not be created.");
  return { workspaceId, role: "owner", access: accessForWorkspace(workspace) };
}

export async function authorize(request: Request): Promise<RequestContext> {
  if (!isPrivateBetaHost(new URL(request.url).hostname)) {
    throw new HttpError(403, "Beebizy Studio beta access is available only at the private preview link.");
  }

  const { userId, email } = await requireVerifiedUser(request);
  const orgHeader = request.headers.get("x-clerk-org-id");
  const { workspaceId, role, access } = await resolveWorkspace(
    userId,
    orgHeader && orgHeader !== "null" ? orgHeader : null,
    email,
  );

  const url = new URL(request.url);
  const route = url.searchParams.get("__path") ?? url.pathname.replace(/^\/api\/?/, "");
  const operatorFeedbackInbox = canAccessOperatorFeedbackInbox(route, email);
  const billingRecoveryRoute = route === "billing/checkout" || route === "billing/portal";
  if (access.status === "active" && !access.plan && route !== "me" && !operatorFeedbackInbox) {
    throw new HttpError(402, "Your workspace plan is not assigned yet. Ask Beebizy support to finish activation.");
  }
  if (
    access.status !== "beta" &&
    access.status !== "active" &&
    route !== "me" &&
    !billingRecoveryRoute &&
    !operatorFeedbackInbox
  ) {
    const message = access.status === "pending"
      ? `Add a card and start your ${SOLO_TRIAL_DAYS}-day Solo trial to continue.`
      : access.status === "past_due"
        ? "Your Beebizy Studio payment is past due. Update the subscription to continue."
        : access.status === "cancelled"
          ? "Your Beebizy Studio subscription is cancelled. Reactivate it to continue."
          : "Your three-month Beebizy Studio beta has ended. Activate a subscription to continue.";
    throw new HttpError(402, message);
  }

  return { userId, email, workspaceId, role, access };
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

/**
 * Emails an invitation, using the identity provider that already sends this workspace's
 * sign-in codes.
 *
 * No separate email service is involved on purpose: Clerk owns the sign-in flow, so it is
 * the one thing that can send a link which actually signs the person in. `ignoreExisting`
 * covers the case where they already have an account — they do not need a sign-up link,
 * and failing the invite over that would be perverse.
 *
 * Returns whether the mail went. The invite itself does not depend on it: access is
 * granted by the row in our database, and someone who never got the email can still sign
 * in normally. The caller says which happened rather than claiming an email was sent.
 */
export async function sendInvitationEmail(email: string, redirectUrl: string): Promise<boolean> {
  if (!clerk) return false;
  try {
    await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      ignoreExisting: true,
      notify: true,
    });
    return true;
  } catch (error) {
    console.warn("INVITE_EMAIL_NOT_SENT", email, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/** Best effort: an unsent revocation must not stop the seat being taken back. */
export async function revokeInvitationEmail(email: string): Promise<void> {
  if (!clerk) return;
  try {
    const { data } = await clerk.invitations.getInvitationList({ query: email, status: "pending" });
    for (const invitation of data) {
      if (invitation.emailAddress.toLowerCase() === email) await clerk.invitations.revokeInvitation(invitation.id);
    }
  } catch (error) {
    console.warn("INVITE_REVOKE_FAILED", email, error instanceof Error ? error.message : String(error));
  }
}

export function requireRole(context: RequestContext, allowed: Role[]): void {
  if (!allowed.includes(context.role)) {
    throw new HttpError(403, `Your role (${context.role}) can't perform that action.`);
  }
}

export { newId };
