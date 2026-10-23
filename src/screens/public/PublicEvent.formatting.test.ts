import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("registration welcome-message formatting", () => {
  it("preserves organizer paragraph breaks in both the builder preview and public page", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");

    expect(publicPage).toContain('className="whitespace-pre-line');
    expect(builder).toContain('className="whitespace-pre-line');
  });

  it("uses editable About and Agenda copy instead of section-photo placeholders", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");

    expect(builder).toContain("Draft About & Agenda with AI");
    expect(builder).toContain('id="registration-about-body"');
    expect(builder).toContain('id="registration-agenda-introduction"');
    expect(builder).not.toContain("About section photo");
    expect(builder).not.toContain("Agenda section photo");
    expect(publicPage).toContain("registrationPage.aboutBody");
    expect(publicPage).toContain("registrationPage.agendaIntroduction");
    expect(publicPage).not.toContain("registrationPage.aboutImageUrl");
    expect(publicPage).not.toContain("registrationPage.agendaImageUrl");
  });
});
