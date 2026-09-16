import { describe, expect, it } from "vitest";

import {
  DEFAULT_REGISTRATION_PAGE,
  REGISTRATION_PAGE_TEMPLATES,
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

  it("returns safe defaults for an event that has never opened the builder", () => {
    expect(normalizeRegistrationPage(null)).toEqual(DEFAULT_REGISTRATION_PAGE);
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
});
