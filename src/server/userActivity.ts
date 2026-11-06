import { createClerkClient } from "@clerk/backend";
import { asc, eq, isNull } from "drizzle-orm";
import type {
  AdminUserActivityResponse,
  AdminUserActivityRow,
  AdminUserWorkspaceAccess,
  WorkspaceRole,
} from "../data/entities.ts";
import { HttpError } from "./auth.ts";
import { db } from "./db.ts";
import * as s from "./schema.ts";

const ACTIVE_WINDOW_MINUTES = 5;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_MINUTES * 60_000;

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function isAutomatedTestAccount(userId: string, emails: string[]): boolean {
  return /verify|billing|qa_/i.test(userId) || emails.some((email) =>
    /(^qa_|verify|example\.com|billing_verify|fundraising-verifier)/i.test(email),
  );
}

export function isRecentlyActive(lastActiveAt: number | null, now = Date.now()): boolean {
  return lastActiveAt !== null && lastActiveAt >= now - ACTIVE_WINDOW_MS;
}

export async function listAdminUserActivity(now = Date.now()): Promise<AdminUserActivityResponse> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new HttpError(503, "User activity is unavailable because Clerk is not configured.");
  const clerk = createClerkClient({ secretKey });

  const [memberRows, inviteRows] = await Promise.all([
    db.select({ member: s.workspaceMembers, workspaceName: s.workspaces.name })
      .from(s.workspaceMembers)
      .innerJoin(s.workspaces, eq(s.workspaceMembers.workspaceId, s.workspaces.id))
      .orderBy(asc(s.workspaces.name), asc(s.workspaceMembers.createdAt)),
    db.select({ invite: s.workspaceInvites, workspaceName: s.workspaces.name })
      .from(s.workspaceInvites)
      .innerJoin(s.workspaces, eq(s.workspaceInvites.workspaceId, s.workspaces.id))
      .where(isNull(s.workspaceInvites.acceptedAt))
      .orderBy(asc(s.workspaces.name), asc(s.workspaceInvites.createdAt)),
  ]);

  const accessByUser = new Map<string, AdminUserWorkspaceAccess[]>();
  for (const { member, workspaceName } of memberRows) {
    const accesses = accessByUser.get(member.userId) ?? [];
    accesses.push({
      workspaceId: member.workspaceId,
      workspaceName,
      role: member.role as WorkspaceRole,
    });
    accessByUser.set(member.userId, accesses);
  }

  const clerkUsers = [];
  let offset = 0;
  while (true) {
    const page = await clerk.users.getUserList({ limit: 100, offset });
    clerkUsers.push(...page.data);
    if (clerkUsers.length >= page.totalCount || page.data.length === 0) break;
    offset += page.data.length;
  }

  const users: AdminUserActivityRow[] = clerkUsers.map((user) => {
    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
    const emails = user.emailAddresses.map((address) => address.emailAddress.trim().toLowerCase());
    const email = primary?.emailAddress.trim().toLowerCase() ?? emails[0] ?? "No email";
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email;
    const workspaces = accessByUser.get(user.id) ?? [];
    return {
      id: user.id,
      name,
      email,
      status: workspaces.length > 0 ? "active-member" : "signed-in-no-access",
      workspaces,
      createdAt: iso(user.createdAt),
      lastSignInAt: iso(user.lastSignInAt),
      lastActiveAt: iso(user.lastActiveAt),
      isActiveNow: isRecentlyActive(user.lastActiveAt, now),
      isTestAccount: isAutomatedTestAccount(user.id, emails),
    } satisfies AdminUserActivityRow;
  });

  const authenticatedEmails = new Set(users.map((user) => user.email.toLowerCase()));
  for (const { invite, workspaceName } of inviteRows) {
    const email = invite.email.trim().toLowerCase();
    if (authenticatedEmails.has(email)) continue;
    users.push({
      id: `invite:${invite.id}`,
      name: email,
      email,
      status: "invited",
      workspaces: [{ workspaceId: invite.workspaceId, workspaceName, role: invite.role as WorkspaceRole }],
      createdAt: invite.createdAt.toISOString(),
      lastSignInAt: null,
      lastActiveAt: null,
      isActiveNow: false,
      isTestAccount: isAutomatedTestAccount(invite.id, [email]),
    });
  }

  users.sort((left, right) => {
    if (left.isActiveNow !== right.isActiveNow) return left.isActiveNow ? -1 : 1;
    const leftTime = left.lastActiveAt ?? left.lastSignInAt ?? left.createdAt ?? "";
    const rightTime = right.lastActiveAt ?? right.lastSignInAt ?? right.createdAt ?? "";
    return rightTime.localeCompare(leftTime) || left.name.localeCompare(right.name);
  });

  const humans = users.filter((user) => !user.isTestAccount);
  return {
    generatedAt: new Date(now).toISOString(),
    activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
    users,
    totals: {
      authenticatedPeople: humans.filter((user) => user.lastSignInAt !== null).length,
      activeMembers: humans.filter((user) => user.status === "active-member").length,
      activeNow: humans.filter((user) => user.isActiveNow).length,
      pendingInvites: humans.filter((user) => user.status === "invited").length,
      testAccounts: users.filter((user) => user.isTestAccount).length,
    },
  };
}
