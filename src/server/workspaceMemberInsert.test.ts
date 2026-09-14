import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";
import { workspaceMemberInsertSelection } from "./workspaceMemberInsert.ts";

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
});
