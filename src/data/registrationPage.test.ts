import { describe, expect, it } from "vitest";

import {
  DEFAULT_REGISTRATION_PAGE,
  LEGACY_REGISTRATION_PAGE,
  REGISTRATION_PAGE_TEMPLATES,
  registrationInvitationHtml,
  registrationPageIsCustomized,
  normalizeRegistrationPage,
  normalizeRegistrationPagePatch,
} from "./registrationPage";

describe("registration page settings", () => {
  it("offers generic starting points instead of tying the page to a mood board", () => {
    expect(REGISTRATION_PAGE_TEMPLATES.map((template) => template.id)).toEqual([
      "warm",
      "garden",
      "coastal",
    ]);
  });

  it("gives events created before the builder a neutral client-facing guest type", () => {
    expect(normalizeRegistrationPage(null)).toEqual(LEGACY_REGISTRATION_PAGE);
    expect(normalizeRegistrationPage(null).registrationTypes).toEqual(["General"]);
    expect(normalizeRegistrationPage(DEFAULT_REGISTRATION_PAGE)).toEqual(DEFAULT_REGISTRATION_PAGE);
  });

  it("keeps valid branding while rejecting unsafe colors and image URLs", () => {
    expect(
      normalizeRegistrationPage({
        template: "garden",
        accentColor: "#245f45",
        headline: "Join us under the stars",
        aboutHeading: "Why we gather",
        welcomeMessage: "Register below and we will see you there.",
        heroImageUrl: "https://images.example.com/garden.jpg",
        aboutImageUrl: "https://images.example.com/venue.jpg",
        agendaImageUrl: "/demo-registration/gala-networking.png",
        showAgenda: false,
        showSpeakers: true,
        showSponsors: false,
        showVolunteerSignup: true,
        speakers: [{ id: "keynote", name: "Amina Shah", title: "Founder", organization: "Bright Futures", bio: "Opening keynote.", photoUrl: "https://images.example.com/amina.jpg" }],
        registrationTypes: ["Investor", "Student", "Investor", "  "],
        collectOrganization: false,
      }),
    ).toEqual({
      template: "garden",
      accentColor: "#245F45",
      headline: "Join us under the stars",
      aboutHeading: "Why we gather",
      aboutBody: "",
      agendaIntroduction: "",
      welcomeMessage: "Register below and we will see you there.",
      heroImageUrl: "https://images.example.com/garden.jpg",
      heroImageDisplay: "banner",
      aboutImageUrl: "https://images.example.com/venue.jpg",
      agendaImageUrl: "/demo-registration/gala-networking.png",
      showAgenda: false,
      showSpeakers: true,
      showSponsors: false,
      showVolunteerSignup: true,
      speakers: [{ id: "keynote", name: "Amina Shah", title: "Founder", organization: "Bright Futures", bio: "Opening keynote.", photoUrl: "https://images.example.com/amina.jpg" }],
      registrationTypes: ["Investor", "Student"],
      collectOrganization: false,
      postEventSubject: "",
      postEventThankYou: "",
      postEventWrapUp: "",
    });

    expect(
      normalizeRegistrationPage({
        template: "unknown",
        accentColor: "red; background: url(javascript:alert(1))",
        heroImageUrl: "javascript:alert(1)",
      }),
    ).toMatchObject({
      template: "warm",
      accentColor: DEFAULT_REGISTRATION_PAGE.accentColor,
      heroImageUrl: null,
      registrationTypes: ["General"],
    });
    expect(normalizeRegistrationPage({ accentColor: "#FFFFFF", heroImageUrl: "http://example.com/a.jpg" }))
      .toMatchObject({ accentColor: DEFAULT_REGISTRATION_PAGE.accentColor, heroImageUrl: null });
    expect(normalizeRegistrationPage({ heroImageUrl: "/demo-registration/gala-hero.png" }).heroImageUrl)
      .toBe("/demo-registration/gala-hero.png");
    expect(normalizeRegistrationPage({ heroImageDisplay: "logo" }).heroImageDisplay).toBe("logo");
    expect(normalizeRegistrationPage({ heroImageDisplay: "something-else" }).heroImageDisplay).toBe("banner");
  });

  it("counts template, color and guest-type choices as invitation design work", () => {
    expect(registrationPageIsCustomized(DEFAULT_REGISTRATION_PAGE)).toBe(false);
    expect(registrationPageIsCustomized({ ...DEFAULT_REGISTRATION_PAGE, template: "garden" })).toBe(true);
    expect(registrationPageIsCustomized({ ...DEFAULT_REGISTRATION_PAGE, accentColor: "#245F45" })).toBe(true);
    expect(registrationPageIsCustomized({ ...DEFAULT_REGISTRATION_PAGE, registrationTypes: ["Parent/Guardian"] })).toBe(true);
    expect(registrationPageIsCustomized({ ...DEFAULT_REGISTRATION_PAGE, speakers: [{ id: "one", name: "Amina Shah", title: "", organization: "", bio: "", photoUrl: null }] })).toBe(true);
    expect(registrationPageIsCustomized({ ...DEFAULT_REGISTRATION_PAGE, showAgenda: false, collectOrganization: false })).toBe(false);
  });

  it("builds a safe, themed invitation that links to the registration page", () => {
    const html = registrationInvitationHtml({
      ...DEFAULT_REGISTRATION_PAGE,
      template: "garden",
      accentColor: "#245F45",
      headline: "Welcome <friends>",
      welcomeMessage: "Register & join us.",
      agendaIntroduction: "Dinner, dancing, and a birthday toast.",
      heroImageUrl: "https://images.example.com/garden.jpg",
    }, "Garden Gala", "An evening together", "https://beebizy.example/e/token?guest=1&source=email", "Laila <Marshall>", "Cedar Grove School", { dateLabel: "Saturday, May 8 at 6:00 PM", location: "The Garden Room" });
    expect(html).toContain("#245F45");
    expect(html).toContain("https://images.example.com/garden.jpg");
    expect(html).toContain("Welcome &lt;friends&gt;");
    expect(html).toContain("Register &amp; join us.");
    expect(html).toContain("https://beebizy.example/e/token?guest=1&amp;source=email");
    expect(html).toContain("Hi Laila &lt;Marshall&gt;,");
    expect(html).toContain("View invitation &amp; RSVP");
    expect(html).toContain("the agenda, and RSVP options");
    expect(html).toContain("Saturday, May 8 at 6:00 PM");
    expect(html).toContain("The Garden Room");
    expect(html).toContain("Dinner, dancing, and a birthday toast.");
    expect(html).toContain("Sent by Cedar Grove School using Beebizy");
    expect(html).not.toContain("Welcome <friends>");
  });

  it("keeps a logo contained instead of cropping it like a banner", () => {
    const html = registrationInvitationHtml({
      ...DEFAULT_REGISTRATION_PAGE,
      heroImageUrl: "https://images.example.com/logo.png",
      heroImageDisplay: "logo",
    }, "School Gala", null, "https://beebizy.example/e/token");
    expect(html).toContain('alt="Event logo"');
    expect(html).toContain("object-fit:contain");
    expect(html).not.toContain("max-height:280px;object-fit:cover");
  });

  it("preserves long multi-paragraph welcome copy separately from the About heading", () => {
    const longParagraph = "A".repeat(900);
    const page = normalizeRegistrationPage({
      aboutHeading: "A milestone worth celebrating",
      welcomeMessage: longParagraph,
    });

    expect(page).toMatchObject({ aboutHeading: "A milestone worth celebrating" });
    expect(page.welcomeMessage).toHaveLength(900);

    const html = registrationInvitationHtml({
      ...DEFAULT_REGISTRATION_PAGE,
      welcomeMessage: "First paragraph.\n\nSecond paragraph.",
    }, "Celebration", null, "https://beebizy.example/e/token");
    expect(html).toContain("First paragraph.<br /><br />Second paragraph.");
  });

  it("normalizes editable public copy and saved post-event communications", () => {
    expect(normalizeRegistrationPage({
      aboutBody: " Why this event matters. ",
      agendaIntroduction: " Doors open before the first session. ",
      postEventSubject: " Thank you for joining us ",
      postEventThankYou: " We appreciated having you with us. ",
      postEventWrapUp: " The event welcomed our community and completed the planned program. ",
    })).toMatchObject({
      aboutBody: "Why this event matters.",
      agendaIntroduction: "Doors open before the first session.",
      postEventSubject: "Thank you for joining us",
      postEventThankYou: "We appreciated having you with us.",
      postEventWrapUp: "The event welcomed our community and completed the planned program.",
    });
  });

  it("keeps partial updates partial while applying the same validation", () => {
    expect(normalizeRegistrationPagePatch({ postEventSubject: "  Thank you  ", unknown: "ignored" })).toEqual({
      postEventSubject: "Thank you",
    });
    expect(normalizeRegistrationPagePatch(null)).toEqual({});
  });
});
