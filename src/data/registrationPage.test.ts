import { describe, expect, it } from "vitest";

import {
  DEFAULT_REGISTRATION_PAGE,
  LEGACY_REGISTRATION_PAGE,
  REGISTRATION_PAGE_TEMPLATES,
  registrationInvitationHtml,
  registrationPageIsCustomized,
  normalizeRegistrationPage,
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
      welcomeMessage: "Register below and we will see you there.",
      heroImageUrl: "https://images.example.com/garden.jpg",
      aboutImageUrl: "https://images.example.com/venue.jpg",
      agendaImageUrl: "/demo-registration/gala-networking.png",
      showAgenda: false,
      showSpeakers: true,
      showSponsors: false,
      showVolunteerSignup: true,
      speakers: [{ id: "keynote", name: "Amina Shah", title: "Founder", organization: "Bright Futures", bio: "Opening keynote.", photoUrl: "https://images.example.com/amina.jpg" }],
      registrationTypes: ["Investor", "Student"],
      collectOrganization: false,
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
      heroImageUrl: "https://images.example.com/garden.jpg",
    }, "Garden Gala", "An evening together", "https://beebizy.example/e/token?guest=1&source=email", "Laila <Marshall>", "Cedar Grove School");
    expect(html).toContain("#245F45");
    expect(html).toContain("https://images.example.com/garden.jpg");
    expect(html).toContain("Welcome &lt;friends&gt;");
    expect(html).toContain("Register &amp; join us.");
    expect(html).toContain("https://beebizy.example/e/token?guest=1&amp;source=email");
    expect(html).toContain("Hi Laila &lt;Marshall&gt;,");
    expect(html).toContain("View event &amp; register");
    expect(html).toContain("the agenda, and registration options");
    expect(html).toContain("Sent by Cedar Grove School using Beebizy");
    expect(html).not.toContain("Welcome <friends>");
  });
});
