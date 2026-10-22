import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("registration welcome-message formatting", () => {
  it("preserves organizer paragraph breaks in both the builder preview and public page", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");

    expect(publicPage).toContain('className="whitespace-pre-line');
    expect(builder).toContain('className="whitespace-pre-line');
  });
});
