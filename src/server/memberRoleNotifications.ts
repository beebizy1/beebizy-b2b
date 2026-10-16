import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import { memberRoleNotificationRetryAt } from "../data/memberRoleNotifications.ts";
import { lookupUsers, newId } from "./auth.ts";
import { db } from "./db.ts";
import { notifyWorkspaceRoleChanged } from "./notify.ts";
import * as s from "./schema.ts";

const PROCESSING_LEASE_MS = 5 * 60_000;

export type MemberRoleNotificationDelivery = "sent" | "queued" | "already-sent" | "superseded";

async function requeueNotification(
  id: string,
  leaseToken: string,
  workspaceId: string,
  userId: string,
  newRole: "owner" | "admin" | "member",
  attemptCount: number,
  reason: string,
  now: Date,
): Promise<MemberRoleNotificationDelivery> {
  const [requeued] = await db.update(s.memberRoleNotifications).set({
    status: "pending",
    nextAttemptAt: memberRoleNotificationRetryAt(attemptCount, now),
    lockedAt: null,
    leaseToken: null,
    lastError: reason.slice(0, 1_000),
    updatedAt: new Date(),
  }).where(and(
    eq(s.memberRoleNotifications.id, id),
    eq(s.memberRoleNotifications.status, "processing"),
    eq(s.memberRoleNotifications.leaseToken, leaseToken),
    sql`exists (
      select 1 from workspace_members current_member
      where current_member.workspace_id = ${workspaceId}
        and current_member.user_id = ${userId}
        and current_member.role = ${newRole}::workspace_role
    )`,
  )).returning({ id: s.memberRoleNotifications.id });
  return requeued ? "queued" : "superseded";
}

/** Claims one outbox row atomically, so request and cron retries cannot double-send it. */
export async function deliverMemberRoleNotification(id: string, now = new Date()): Promise<MemberRoleNotificationDelivery> {
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const leaseToken = newId("role-delivery");
  const [candidate] = await db.select({ workspaceId: s.memberRoleNotifications.workspaceId })
    .from(s.memberRoleNotifications).where(eq(s.memberRoleNotifications.id, id)).limit(1);
  if (!candidate) return "queued";

  // Role changes and removal take this same workspace lock. Claiming under it closes the
  // gap where a worker could start an old notification midway through a role transaction.
  const workspaceLock = db.select({ locked: sql<number>`pg_advisory_xact_lock(hashtext(${candidate.workspaceId}))` })
    .from(s.workspaces).where(eq(s.workspaces.id, candidate.workspaceId)).limit(1);
  const claim = db.update(s.memberRoleNotifications).set({
    status: "processing",
    lockedAt: now,
    leaseToken,
    attemptCount: sql`${s.memberRoleNotifications.attemptCount} + 1`,
    updatedAt: now,
  }).where(and(
    eq(s.memberRoleNotifications.id, id),
    or(
      and(eq(s.memberRoleNotifications.status, "pending"), lte(s.memberRoleNotifications.nextAttemptAt, now)),
      and(eq(s.memberRoleNotifications.status, "processing"), lt(s.memberRoleNotifications.lockedAt, staleBefore)),
    ),
  )).returning();
  const [, claimed] = await db.batch([workspaceLock, claim]);
  const notification = claimed[0];

  if (!notification) {
    const [existing] = await db.select({ status: s.memberRoleNotifications.status })
      .from(s.memberRoleNotifications).where(eq(s.memberRoleNotifications.id, id)).limit(1);
    if (existing?.status === "sent") return "already-sent";
    return existing?.status === "superseded" ? "superseded" : "queued";
  }

  const [member] = await db.select({ role: s.workspaceMembers.role, email: s.workspaceMembers.email })
    .from(s.workspaceMembers).where(and(
      eq(s.workspaceMembers.workspaceId, notification.workspaceId),
      eq(s.workspaceMembers.userId, notification.userId),
    )).limit(1);
  if (!member || member.role !== notification.newRole) {
    await db.update(s.memberRoleNotifications).set({ status: "superseded", lockedAt: null, leaseToken: null, updatedAt: new Date() })
      .where(and(
        eq(s.memberRoleNotifications.id, id),
        eq(s.memberRoleNotifications.status, "processing"),
        eq(s.memberRoleNotifications.leaseToken, leaseToken),
      ));
    return "superseded";
  }

  let recipientEmail = notification.recipientEmail ?? member.email;
  if (!recipientEmail) {
    const directory = await lookupUsers([notification.userId]);
    recipientEmail = directory.get(notification.userId)?.email ?? null;
    if (!recipientEmail) {
      return requeueNotification(
        id,
        leaseToken,
        notification.workspaceId,
        notification.userId,
        notification.newRole,
        notification.attemptCount,
        "Verified member email is temporarily unavailable.",
        now,
      );
    }
    await db.batch([
      db.update(s.workspaceMembers).set({ email: recipientEmail }).where(and(
        eq(s.workspaceMembers.workspaceId, notification.workspaceId), eq(s.workspaceMembers.userId, notification.userId),
      )),
      db.update(s.memberRoleNotifications).set({ recipientEmail, updatedAt: new Date() }).where(and(
        eq(s.memberRoleNotifications.id, id),
        eq(s.memberRoleNotifications.status, "processing"),
        eq(s.memberRoleNotifications.leaseToken, leaseToken),
      )),
    ]);
  }

  // This is the final fence before the external side effect. Role changes and removal
  // refuse to commit while a notification is processing, so the role cannot change
  // between this check and the provider response.
  const [stillCurrent] = await db.update(s.memberRoleNotifications).set({
    lockedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(s.memberRoleNotifications.id, id),
    eq(s.memberRoleNotifications.status, "processing"),
    eq(s.memberRoleNotifications.leaseToken, leaseToken),
    sql`exists (
      select 1 from workspace_members current_member
      where current_member.workspace_id = ${notification.workspaceId}
        and current_member.user_id = ${notification.userId}
        and current_member.role = ${notification.newRole}::workspace_role
    )`,
  )).returning({ id: s.memberRoleNotifications.id });
  if (!stillCurrent) return "superseded";

  const outcome = await notifyWorkspaceRoleChanged({
    changeId: notification.id,
    workspaceId: notification.workspaceId,
    workspaceName: notification.workspaceName,
    userId: notification.userId,
    to: recipientEmail,
    memberName: notification.memberName,
    newRole: notification.newRole,
  });

  if (outcome.status === "sent") {
    const [sent] = await db.update(s.memberRoleNotifications).set({
      status: "sent",
      sentAt: new Date(),
      lockedAt: null,
      leaseToken: null,
      lastError: null,
      updatedAt: new Date(),
    }).where(and(
      eq(s.memberRoleNotifications.id, id),
      eq(s.memberRoleNotifications.status, "processing"),
      eq(s.memberRoleNotifications.leaseToken, leaseToken),
      sql`exists (
        select 1 from workspace_members current_member
        where current_member.workspace_id = ${notification.workspaceId}
          and current_member.user_id = ${notification.userId}
          and current_member.role = ${notification.newRole}::workspace_role
      )`,
    )).returning({ id: s.memberRoleNotifications.id });
    return sent ? "sent" : "superseded";
  }

  return requeueNotification(
    id,
    leaseToken,
    notification.workspaceId,
    notification.userId,
    notification.newRole,
    notification.attemptCount,
    outcome.reason,
    now,
  );
}

/** Processes due notifications in bounded batches. Failed deliveries remain queued. */
export async function processDueMemberRoleNotifications(limit = 50, now = new Date()): Promise<{ processed: number; sent: number; queued: number; superseded: number }> {
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const rows = await db.select({ id: s.memberRoleNotifications.id }).from(s.memberRoleNotifications).where(or(
    and(eq(s.memberRoleNotifications.status, "pending"), lte(s.memberRoleNotifications.nextAttemptAt, now)),
    and(eq(s.memberRoleNotifications.status, "processing"), lt(s.memberRoleNotifications.lockedAt, staleBefore)),
  )).orderBy(asc(s.memberRoleNotifications.nextAttemptAt)).limit(Math.max(1, Math.min(100, limit)));

  let sent = 0;
  let queued = 0;
  let superseded = 0;
  for (let offset = 0; offset < rows.length; offset += 10) {
    const results = await Promise.all(rows.slice(offset, offset + 10).map((row) => deliverMemberRoleNotification(row.id, now)));
    sent += results.filter((result) => result === "sent" || result === "already-sent").length;
    queued += results.filter((result) => result === "queued").length;
    superseded += results.filter((result) => result === "superseded").length;
  }
  return { processed: rows.length, sent, queued, superseded };
}
