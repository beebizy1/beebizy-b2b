import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public auction bidder status on mobile", () => {
  it("stacks the paddle, wallet reminder, and actions before the small breakpoint", () => {
    const source = readFileSync(new URL("./PublicAuction.tsx", import.meta.url), "utf8");

    expect(source).toContain(
      'className="grid gap-3 rounded-xl border border-success/20 bg-success-tint px-4 py-3 text-sm text-success-text sm:flex sm:flex-wrap sm:items-center"',
    );
    expect(source).toContain('className="flex items-center gap-3 sm:contents"');
    expect(source).toContain('className="min-w-0 leading-5 sm:flex-1"');
    expect(source.match(/className="w-full sm:w-auto"/g)).toHaveLength(2);
  });
});
