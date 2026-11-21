import { describe, expect, it } from "vitest";
import { normalizeWorkspaceProfile, organizationIdFromPath, organizationSignInPath, workspaceProfileSchema } from "./workspaceProfile";

describe("organization product profiles", () => {
  it("preserves legacy planner presentation and the focused SCU profile", () => {
    expect(normalizeWorkspaceProfile(null)).toEqual({ kind: "planner", experience: "standard", eventTabs: null });
    expect(normalizeWorkspaceProfile(null, "santa-clara")).toEqual({ kind: "organization", experience: "santa-clara", eventTabs: null });
  });
  it("keeps an explicitly empty tool list distinct from all default tools", () => {
    expect(normalizeWorkspaceProfile({ kind: "organization", experience: "standard", eventTabs: [] }).eventTabs).toEqual([]);
    expect(normalizeWorkspaceProfile({ kind: "organization", experience: "standard", eventTabs: ["budget", "budget", "deposits"] }).eventTabs).toEqual(["budget", "deposits"]);
    expect(workspaceProfileSchema.safeParse({ kind: "organization", experience: "standard", eventTabs: ["admin"] }).success).toBe(false);
  });
  it("accepts only the organization entry route, never an external return or event path", () => {
    expect(organizationIdFromPath(organizationSignInPath("ws_customer_1"))).toBe("ws_customer_1");
    for (const path of ["//evil.example/organization/ws_a", "/app/events/ws_a", "/organization/ws_a/extra", "/organization/../../internal", "/organization/ws_a?other=1"]) expect(organizationIdFromPath(path)).toBeNull();
  });
});
