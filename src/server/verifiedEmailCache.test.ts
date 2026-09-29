import { describe, expect, it, vi } from "vitest";
import { VerifiedEmailCache } from "./verifiedEmailCache";

describe("verified Clerk email cache", () => {
  it("shares one Clerk lookup across concurrent API requests and reuses it", async () => {
    const load = vi.fn(async () => "planner@example.com");
    const cache = new VerifiedEmailCache(60_000);

    const emails = await Promise.all(Array.from({ length: 20 }, () => cache.get("user-1", load)));
    expect(emails).toEqual(Array.from({ length: 20 }, () => "planner@example.com"));
    expect(load).toHaveBeenCalledTimes(1);

    expect(await cache.get("user-1", load)).toBe("planner@example.com");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed Clerk lookup", async () => {
    const cache = new VerifiedEmailCache(60_000);
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("planner@example.com");

    await expect(cache.get("user-1", load)).rejects.toThrow("rate limited");
    await expect(cache.get("user-1", load)).resolves.toBe("planner@example.com");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
