import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage, normalizeRegistrationPagePatch, publicRegistrationHref, registrationAnswerFields, footerBannerImage, registrationPageIsCustomized, registrationQuestionsFor } from "./registrationPage";

describe("Carlin registration fixes", () => {
  it("retains a saved question audience when an older editor omits it, while honoring explicit changes", () => {
    const oldQuestion = { id: "connection", label: "How do you know Carlin?", type: "text", required: true };
    const current = normalizeRegistrationPage({ questions: [{ ...oldQuestion, audience: "primary" }] });
    expect(normalizeRegistrationPagePatch({ questions: [oldQuestion] }, current).questions?.[0]?.audience).toBe("primary");
    expect(normalizeRegistrationPagePatch({ questions: [{ ...oldQuestion, audience: "both" }] }, current).questions?.[0]?.audience).toBe("both");
    expect(normalizeRegistrationPagePatch({ questions: [] }, current).questions).toEqual([]);
  });
  it("preserves question audiences through publishing and keeps legacy questions applying to both", () => {
    const page = normalizeRegistrationPage({ questions: [
      { id: "primary", label: "Your connection", audience: "primary" },
      { id: "guest", label: "Guest meal", audience: "guests" },
      { id: "both", label: "Dietary needs", audience: "both" },
      { id: "old", label: "Legacy question" },
    ] });
    expect(registrationQuestionsFor(page.questions, "primary").map(q => q.id)).toEqual(["primary", "both", "old"]);
    expect(registrationQuestionsFor(page.questions, "guests").map(q => q.id)).toEqual(["guest", "both", "old"]);
    expect(normalizeRegistrationPagePatch({ questions: page.questions })).toEqual({ questions: page.questions });
  });
  it("takes a single-type RSVP directly to the form and keeps invitations attached", () => {
    expect(publicRegistrationHref("event-token", DEFAULT_REGISTRATION_PAGE, "invite-token")).toBe("/e/event-token/register/General?invite=invite-token");
    expect(publicRegistrationHref("t", { ...DEFAULT_REGISTRATION_PAGE, registrationTypes: ["Parent / Guardian"] })).toBe("/e/t/register/Parent%20%2F%20Guardian");
    expect(publicRegistrationHref("t", { ...DEFAULT_REGISTRATION_PAGE, registrationTypes: ["Guest", "Staff"] })).toBe("/e/t#register");
    expect(publicRegistrationHref("t", DEFAULT_REGISTRATION_PAGE, null, true)).toBe("/e/t#register");
  });
  it("preserves existing bottom artwork while allowing separate artwork or no image", () => {
    const original = normalizeRegistrationPage({ heroImageUrl: "https://example.com/main.jpg" });
    expect(footerBannerImage(original)).toBe("https://example.com/main.jpg");
    const changed = normalizeRegistrationPage({ ...original, footerImageSource: "custom", footerImageUrl: "https://example.com/bottom.jpg" });
    expect(footerBannerImage(changed)).toBe("https://example.com/bottom.jpg");
    expect(changed.heroImageUrl).toBe(original.heroImageUrl);
    expect(footerBannerImage({ ...changed, footerImageSource: "none" })).toBeNull();
    expect(normalizeRegistrationPagePatch({ footerImageSource: "custom", footerImageUrl: "javascript:bad" })).toEqual({ footerImageSource: "custom", footerImageUrl: null });
  });
  it("validates required questions and stores answers using organizer-owned labels", () => {
    const page = normalizeRegistrationPage({ questions: [{ id: "shirt", label: "T-shirt size", type: "select", required: true, options: ["S", "M", "L"] }] });
    expect(() => registrationAnswerFields(page.questions, {})).toThrow("T-shirt size");
    expect(() => registrationAnswerFields(page.questions, { shirt: "XXL" })).toThrow("T-shirt size");
    expect(registrationAnswerFields(page.questions, { shirt: "M", fabricated: "ignored" })).toEqual([{ label: "T-shirt size", value: "M" }]);
    expect(normalizeRegistrationPagePatch({ questions: page.questions })).toEqual({ questions: page.questions });
    expect(registrationPageIsCustomized(page)).toBe(true);
  });
});
