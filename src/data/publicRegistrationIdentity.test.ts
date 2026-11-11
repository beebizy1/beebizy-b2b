import { describe, expect, it } from "vitest";
import { publicRegistrationIdentity, recoverPublicRsvpDraft } from "./publicRegistrationIdentity";

describe("separate public RSVP names", () => {
  it("preserves compound names, capitalization and punctuation and provides the combined badge name", () => {
    expect(publicRegistrationIdentity({ firstName: "  María Elena ", lastName: " de la Cruz-Taylor ", name: "Ignored" })).toEqual({
      name: "María Elena de la Cruz-Taylor",
      fields: [{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz-Taylor" }],
    });
  });
  it("still accepts existing full-name clients without inventing name boundaries", () => {
    expect(publicRegistrationIdentity({ name: "  Cher  " })).toEqual({ name: "Cher", fields: [] });
  });
  it("rejects incomplete or invalid separate names even when a legacy name is supplied", () => {
    expect(() => publicRegistrationIdentity({ name: "Fallback", firstName: "Carlin" })).toThrow("last name");
    expect(() => publicRegistrationIdentity({ firstName: 123, lastName: "Putman" })).toThrow("first name");
    expect(() => publicRegistrationIdentity({ firstName: "Carlin", lastName: " " })).toThrow("last name");
    expect(() => publicRegistrationIdentity({ firstName: "A".repeat(121), lastName: "B" })).toThrow("first name");
  });
  it("recovers both name entries and every answer exactly as typed", () => {
    const draft = { firstName: "María Elena ", lastName: "de la Cruz", email: "qa@example.invalid", organization: "School", answers: { shirt: "M", food: "Vegetarian" } };
    expect(recoverPublicRsvpDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
  it("keeps older full-name drafts intact and asks the user to separate them", () => {
    expect(recoverPublicRsvpDraft({ name: "Mary Ann de la Cruz", email: "qa@example.invalid", answers: { shirt: "M" } })).toEqual({
      firstName: "Mary Ann de la Cruz", lastName: "", previousFullName: "Mary Ann de la Cruz", email: "qa@example.invalid", organization: "", answers: { shirt: "M" },
    });
    expect(recoverPublicRsvpDraft({ firstName: null, answers: { valid: "Yes", malformed: {} } }).answers).toEqual({ valid: "Yes" });
  });
});
