import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage, normalizeRegistrationPagePatch, publicRegistrationHref, registrationAnswerFields, footerBannerImage, registrationPageIsCustomized } from "./registrationPage";

describe("Carlin registration fixes", () => {
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
