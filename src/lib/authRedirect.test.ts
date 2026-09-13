import { describe, expect, it } from "vitest";
import { authReturnTo } from "./authRedirect";

describe("post-auth redirects", () => {
  it("preserves an intended Solo Checkout return", () => {
    expect(authReturnTo("?returnTo=%2Fpricing%3Fstart%3Dsolo")).toBe("/pricing?start=solo");
    expect(authReturnTo("?returnTo=%2Fapp%2Fevents%2Fnew")).toBe("/app/events/new");
  });

  it("rejects redirects outside Beebizy", () => {
    expect(authReturnTo("?returnTo=https%3A%2F%2Fevil.example")).toBe("/app");
    expect(authReturnTo("?returnTo=%2F%2Fevil.example")).toBe("/app");
    expect(authReturnTo("?returnTo=%2Fcontact-sales")).toBe("/app");
  });
});
