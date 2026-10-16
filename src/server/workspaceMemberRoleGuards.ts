import { sql } from "drizzle-orm";
import type { WorkspaceRole } from "../data/entities.ts";
import * as s from "./schema.ts";

/**
 * SQL `AND` binds more tightly than `OR`, so the outer parentheses are safety-critical.
 * Without them, the owner clauses can escape the workspace/user predicate and turn one
 * person's role change into a cross-workspace bulk update.
 */
export function roleChangeOwnerGuard(workspaceId: string, userId: string, nextRole: WorkspaceRole) {
  return sql`(${nextRole === "owner"} or ${s.workspaceMembers.role} <> 'owner' or exists (
    select 1 from workspace_members owner_guard
    where owner_guard.workspace_id = ${workspaceId}
      and owner_guard.role = 'owner'
      and owner_guard.user_id <> ${userId}
  ))`;
}

export function roleRemovalOwnerGuard(workspaceId: string, userId: string) {
  return sql`(${s.workspaceMembers.role} <> 'owner' or exists (
    select 1 from workspace_members owner_guard
    where owner_guard.workspace_id = ${workspaceId}
      and owner_guard.role = 'owner'
      and owner_guard.user_id <> ${userId}
  ))`;
}
