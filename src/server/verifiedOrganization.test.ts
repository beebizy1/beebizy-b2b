import { describe, expect, it } from "vitest";
import { verifiedClerkOrganizationId } from "./verifiedOrganization";

describe("verified Clerk organization", () => {
  it("supports verified session-token v1 and v2 organization claims", () => {
    expect(verifiedClerkOrganizationId({ org_id: "org_verified123" })).toBe("org_verified123");
    expect(verifiedClerkOrganizationId({ o: { id: "org_verified456" } })).toBe("org_verified456");
  });
  it("does not infer an organization from a header or other unverified input", () => {
    for (const claims of [null, {}, { "x-clerk-org-id": "org_attacker" }, { o: { id: 12 } }, { org_id: "//evil.example" }]) expect(verifiedClerkOrganizationId(claims)).toBeNull();
  });
});
