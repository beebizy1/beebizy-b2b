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

  it("keeps the template editor focused on four quick edits and renders logos without cropping", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");

    for (const label of ["1. Color", "2. Banner or logo", "3. Welcome text", "4. Agenda introduction"]) {
      expect(builder).toContain(label);
    }
    expect(builder).toContain("More page options");
    expect(builder).toContain('heroImageDisplay === "logo"');
    expect(publicPage).toContain('settings.heroImageDisplay === "logo"');
    expect(publicPage).toContain('alt="Event logo"');
  });

  it("carries a private invitation token through the RSVP-only registration flow", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const sender = readFileSync(new URL("../events/sections/TicketInvitationBuilder.tsx", import.meta.url), "utf8");

    expect(publicPage).toContain("invitationAwarePath");
    expect(publicPage).toContain("invitationToken");
    expect(publicPage).toContain("Confirm RSVP");
    expect(sender).toContain("Invitation guests receive");
    expect(sender).toContain("This event does not require tickets");
    expect(sender).toContain("Edit invitation design");
  });
});
