import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import * as schema from "./schema.ts";
import { roleChangeOwnerGuard, roleRemovalOwnerGuard } from "./workspaceMemberRoleGuards.ts";

const db = drizzle.mock({ schema });

describe("workspace member role guards", () => {
  it("keeps every OR branch inside the target workspace and user predicate", () => {
    const query = db.update(schema.workspaceMembers).set({ role: "member" }).where(and(
      eq(schema.workspaceMembers.workspaceId, "workspace-1"),
      eq(schema.workspaceMembers.userId, "user-2"),
      roleChangeOwnerGuard("workspace-1", "user-2", "member"),
    ));

    expect(query.toSQL().sql).toMatch(
      /where \("workspace_members"\."workspace_id" = \$\d+ and "workspace_members"\."user_id" = \$\d+ and \(\$\d+ or/,
    );
  });

  it("keeps removal owner checks inside the target workspace and user predicate", () => {
    const query = db.delete(schema.workspaceMembers).where(and(
      eq(schema.workspaceMembers.workspaceId, "workspace-1"),
      eq(schema.workspaceMembers.userId, "user-2"),
      roleRemovalOwnerGuard("workspace-1", "user-2"),
    ));

    expect(query.toSQL().sql).toMatch(
      /where \("workspace_members"\."workspace_id" = \$\d+ and "workspace_members"\."user_id" = \$\d+ and \("workspace_members"\."role" <> 'owner' or/,
    );
  });
});
