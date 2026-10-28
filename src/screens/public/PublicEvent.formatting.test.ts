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

  it("shows organizers the full RSVP-page layout while they design an invitation", () => {
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");

    expect(builder).toContain("Invitation & RSVP page");
    expect(builder).toContain("RSVP page preview");
    expect(builder).toContain("This is the page guests open from the invitation link");
    expect(builder).toContain("When:");
    expect(builder).toContain("Where:");
    expect(builder).toContain("Confirm your attendance");
    expect(builder).toContain("Add an About section so guests know what makes this event special.");
    expect(builder).toContain("Confirmed sponsor logos will appear here.");
    expect(builder).toContain('const ctaLabel = hasTickets || Boolean(settings.paymentUrl) ? "View registration" : "RSVP"');
  });

  it("keeps the main event headline separate from clickable guest information pages", () => {
    const publicPage = readFileSync(new URL("./PublicEvent.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../events/sections/ShareSection.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

    expect(builder).toContain("Main invitation headline");
    expect(builder).toContain("Guest information pages");
    expect(builder).toContain("Add information page");
    expect(publicPage).toContain("PublicEventInfoPage");
    expect(publicPage).toContain("settings.infoPages");
    expect(app).toContain('/e/:token/info/:pageId');
  });

  it("uses the event-owned time zone for the public page", () => {
    const form = readFileSync(new URL("../events/EventForm.tsx", import.meta.url), "utf8");
    const repos = readFileSync(new URL("../../server/repos.ts", import.meta.url), "utf8");

    expect(form).toContain("Event time zone");
    expect(form).toContain("fromDateTimeLocalInputInZone");
    expect(repos).toContain("row.event.timeZone ?? row.workspaceTimeZone");
  });
});
