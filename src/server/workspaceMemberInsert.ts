import { sql } from "drizzle-orm";
import type { WorkspaceRole } from "../data/entities.ts";
import { workspaces } from "./schema.ts";

/**
 * Columns selected when an invited account claims its reserved workspace seat.
 *
 * Drizzle validates this selection against the complete destination table before it
 * sends any SQL. Keeping the selection in one tested function prevents the invitation
 * path from drifting when a destination column is added or reordered.
 */
export function workspaceMemberInsertSelection(
  userId: string,
  role: WorkspaceRole,
  eventScopeId: string | null = null,
) {
  return {
    workspaceId: workspaces.id,
    userId: sql<string>`${userId}::text`.as("user_id"),
    role: sql<WorkspaceRole>`${role}::workspace_role`.as("role"),
    eventScopeId: sql<string | null>`${eventScopeId}::text`.as("event_scope_id"),
    createdAt: sql<Date>`now()`.as("created_at"),
  };
}

/**
 * Drizzle checks INSERT ... SELECT columns at runtime, in schema order. Include every
 * destination field, including defaultable ones, so adding invite metadata cannot turn
 * a valid invitation into a runtime-only failure.
 */
export function workspaceInviteInsertSelection(
  id: string,
  email: string,
  role: WorkspaceRole,
  eventScopeId: string | null,
  invitedBy: string,
) {
  return {
    id: sql<string>`${id}::text`.as("id"),
    workspaceId: workspaces.id,
    email: sql<string>`${email}::text`.as("email"),
    role: sql<WorkspaceRole>`${role}::workspace_role`.as("role"),
    eventScopeId: sql<string | null>`${eventScopeId}::text`.as("event_scope_id"),
    invitedBy: sql<string>`${invitedBy}::text`.as("invited_by"),
    acceptedAt: sql<Date | null>`null::timestamptz`.as("accepted_at"),
    acceptedUserId: sql<string | null>`null::text`.as("accepted_user_id"),
    createdAt: sql<Date>`now()`.as("created_at"),
  };
}
