import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));

const { isAutomatedTestAccount, isRecentlyActive } = await import("./userActivity");

describe("user activity classification", () => {
  it("treats activity inside five minutes as active now", () => {
    const now = Date.parse("2026-11-06T02:00:00.000Z");
    expect(isRecentlyActive(now - 4 * 60_000, now)).toBe(true);
    expect(isRecentlyActive(now - 6 * 60_000, now)).toBe(false);
    expect(isRecentlyActive(null, now)).toBe(false);
  });

  it("identifies verification and QA accounts without hiding real users", () => {
    expect(isAutomatedTestAccount("user_qa_verify", ["qa_verify@example.com"])).toBe(true);
    expect(isAutomatedTestAccount("user_real", ["laila@beebizy.com"])).toBe(false);
  });
});
