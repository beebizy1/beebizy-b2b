import { sql } from "drizzle-orm";
import type { WorkspaceRole } from "../data/entities.ts";
import * as s from "./schema.ts";

/** Parentheses keep every OR branch inside the workspace/user predicate. */
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
