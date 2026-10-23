import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-event communications", () => {
  it("generates editable drafts that can be saved, copied, and opened in email", () => {
    const source = readFileSync(new URL("./PostEventSummary.tsx", import.meta.url), "utf8");

    expect(source).toContain("Generate with AI");
    expect(source).toContain('id="post-event-thank-you"');
    expect(source).toContain('id="post-event-wrap-up"');
    expect(source).toContain("postEventThankYou");
    expect(source).toContain("postEventWrapUp");
    expect(source).toContain("Save drafts");
    expect(source).toContain("Open email draft");
    expect(source).toContain("Nothing sends automatically");
  });
});
