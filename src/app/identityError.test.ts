import { describe, expect, it } from "vitest";
import { DataError } from "../data/adapter.ts";
import { identityErrorRequiresAccessDenied } from "./identityError.ts";

describe("identity error routing", () => {
  it("keeps temporary server failures on a retryable screen", () => {
    expect(identityErrorRequiresAccessDenied(new DataError("unavailable", "Server failed."))).toBe(false);
  });

  it("uses access denied only for authentication and permission failures", () => {
    expect(identityErrorRequiresAccessDenied(new DataError("unauthenticated", "Sign in again."))).toBe(true);
    expect(identityErrorRequiresAccessDenied(new DataError("permission-denied", "No access."))).toBe(true);
  });
});
