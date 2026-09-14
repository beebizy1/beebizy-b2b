import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";
import { workspaceFitsPlanSeatLimit, workspaceFitsSoloSeatLimit } from "./entitlements.ts";

function compiledWhere(condition: ReturnType<typeof workspaceFitsPlanSeatLimit>) {
  const db = drizzle.mock({ schema });
  return db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(condition).toSQL().sql;
}

describe("workspace seat entitlement SQL", () => {
  it("casts every numeric parameter to bigint before comparing it with count(*)", () => {
    const planLimit = compiledWhere(workspaceFitsPlanSeatLimit(schema.workspaces.id, 0));
    const soloLimit = compiledWhere(workspaceFitsSoloSeatLimit(schema.workspaces.id, 1));

    expect(planLimit).toMatch(/\+ \$\d+::bigint/);
    expect(planLimit.match(/then \$\d+::bigint/g)).toHaveLength(2);
    expect(planLimit).toMatch(/else \$\d+::bigint/);
    expect(soloLimit).toMatch(/\+ \$\d+::bigint/);
    expect(soloLimit).toMatch(/<= \$\d+::bigint/);
  });
});
