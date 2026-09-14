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
export function workspaceMemberInsertSelection(userId: string, role: WorkspaceRole) {
  return {
    workspaceId: workspaces.id,
    userId: sql<string>`${userId}::text`.as("user_id"),
    role: sql<WorkspaceRole>`${role}::workspace_role`.as("role"),
    createdAt: sql<Date>`now()`.as("created_at"),
  };
}
