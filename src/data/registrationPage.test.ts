import { describe, expect, it } from "vitest";

import {
  DEFAULT_REGISTRATION_PAGE,
  LEGACY_REGISTRATION_PAGE,
  REGISTRATION_PAGE_TEMPLATES,
  registrationInvitationHtml,
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

  it("preserves segmented links for events created before the builder", () => {
    expect(normalizeRegistrationPage(null)).toEqual(LEGACY_REGISTRATION_PAGE);
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
        showAgenda: false,
        showVolunteerSignup: true,
        registrationTypes: ["Investor", "Student", "Investor", "  "],
        collectOrganization: false,
      }),
    ).toEqual({
      template: "garden",
      accentColor: "#245F45",
      headline: "Join us under the stars",
      welcomeMessage: "Register below and we will see you there.",
      heroImageUrl: "https://images.example.com/garden.jpg",
      showAgenda: false,
      showVolunteerSignup: true,
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
  });

  it("builds a safe, themed invitation that links to the registration page", () => {
    const html = registrationInvitationHtml({
      ...DEFAULT_REGISTRATION_PAGE,
      template: "garden",
      accentColor: "#245F45",
      headline: "Welcome <friends>",
      welcomeMessage: "Register & join us.",
      heroImageUrl: "https://images.example.com/garden.jpg",
    }, "Garden Gala", "An evening together", "https://beebizy.example/e/token?guest=1&source=email");
    expect(html).toContain("#245F45");
    expect(html).toContain("https://images.example.com/garden.jpg");
    expect(html).toContain("Welcome &lt;friends&gt;");
    expect(html).toContain("Register &amp; join us.");
    expect(html).toContain("https://beebizy.example/e/token?guest=1&amp;source=email");
    expect(html).not.toContain("Welcome <friends>");
  });
});
