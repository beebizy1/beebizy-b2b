import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";
import { workspaceInviteInsertSelection, workspaceMemberInsertSelection } from "./workspaceMemberInsert.ts";

describe("invited workspace membership insert", () => {
  it("matches every destination column in schema order", () => {
    const db = drizzle.mock({ schema });

    expect(() =>
      db
        .insert(schema.workspaceMembers)
        .select(
          db
            .select(workspaceMemberInsertSelection("user_invited", "member"))
            .from(schema.workspaces),
        ),
    ).not.toThrow();
  });

  it("keeps invitation INSERT ... SELECT fields in destination schema order", () => {
    const db = drizzle.mock({ schema });

    expect(() =>
      db
        .insert(schema.workspaceInvites)
        .select(
          db
            .select(
              workspaceInviteInsertSelection(
                "invite_1",
                "annie@sevareid.com",
                "member",
                "event_gala",
                "user_owner",
              ),
            )
            .from(schema.workspaces),
        ),
    ).not.toThrow();
  });
});
