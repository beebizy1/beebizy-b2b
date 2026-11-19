import { describe, expect, it } from "vitest";
import { normalizeRegistrationPage } from "./registrationPage";
import { preparePublicRsvpParty } from "./publicRsvpParty";

const page = normalizeRegistrationPage({ maxAdditionalGuests: 2, questions: [{ id: "food", label: "Dietary needs", type: "text", required: true }] });
const primary = { firstName: "María Elena", lastName: "de la Cruz-Taylor", email: " HOST@Example.com ", answers: { food: "Vegetarian" } };
const guest = { firstName: "Alex", lastName: "Taylor", email: "", answers: { food: "No nuts" } };
describe("public RSVP parties", () => {
  it("asks primary-attendee questions only once and accepts a guest with identity details alone", () => {
    const primaryOnly = normalizeRegistrationPage({ ...page, questions: page.questions.map(question => ({ ...question, audience: "primary" })) });
    const people = preparePublicRsvpParty(primaryOnly, { ...primary, additionalGuests: [{ ...guest, email: "alex@example.com", answers: {} }] });
    expect(people[0]!.fields).toContainEqual({ label: "Dietary needs", value: "Vegetarian" });
    expect(people[1]!.fields).toEqual([{ label: "First Name", value: "Alex" }, { label: "Last Name", value: "Taylor" }]);
    expect(() => preparePublicRsvpParty(primaryOnly, { ...primary, answers: {}, additionalGuests: [guest] })).toThrow("Dietary needs");
  });
  it("requires guest-only answers from companions and ignores out-of-audience answers", () => {
    const separate = normalizeRegistrationPage({ ...page, questions: [
      { ...page.questions[0]!, audience: "primary" },
      { id: "guest-meal", label: "Guest meal", type: "select", options: ["Vegetarian", "Standard"], required: true, audience: "guests" },
    ] });
    const people = preparePublicRsvpParty(separate, { ...primary, answers: { ...primary.answers, "guest-meal": "Forged" }, additionalGuests: [{ ...guest, answers: { food: "Forged", "guest-meal": "Standard" } }] });
    expect(people[0]!.fields).not.toContainEqual(expect.objectContaining({ label: "Guest meal" }));
    expect(people[1]!.fields).toContainEqual({ label: "Guest meal", value: "Standard" });
    expect(people[1]!.fields).not.toContainEqual(expect.objectContaining({ label: "Dietary needs" }));
    expect(() => preparePublicRsvpParty(separate, { ...primary, additionalGuests: [guest] })).toThrow("Guest meal");
    expect(preparePublicRsvpParty(separate, primary)).toHaveLength(1);
  });
  it("keeps individual names and answers, requiring email only for the person registering", () => {
    expect(preparePublicRsvpParty(page, { ...primary, additionalGuests: [guest] })).toEqual([
      { name: "María Elena de la Cruz-Taylor", email: "host@example.com", fields: [{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz-Taylor" }, { label: "Dietary needs", value: "Vegetarian" }] },
      { name: "Alex Taylor", email: null, fields: [{ label: "First Name", value: "Alex" }, { label: "Last Name", value: "Taylor" }, { label: "Dietary needs", value: "No nuts" }] },
    ]);
  });
  it("accepts existing single-person clients and rejects guests when the event disallows them", () => {
    expect(preparePublicRsvpParty(normalizeRegistrationPage(null), { name: "Cher", email: "cher@example.com" })).toHaveLength(1);
    expect(() => preparePublicRsvpParty(normalizeRegistrationPage(null), { ...primary, additionalGuests: [guest] })).toThrow("does not allow");
  });
  it("rejects missing names, missing required guest answers, malformed emails and repeated party emails", () => {
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: [{ ...guest, lastName: "" }] })).toThrow("last name");
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: [{ ...guest, answers: {} }] })).toThrow("Dietary needs");
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: [{ ...guest, email: "invalid" }] })).toThrow("email");
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: [{ ...guest, email: "HOST@example.com" }] })).toThrow("different email");
  });
  it("enforces the organizer limit before parsing any guest details", () => {
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: [guest, guest, guest] })).toThrow("up to 2");
    expect(() => preparePublicRsvpParty(page, { ...primary, additionalGuests: "guest" })).toThrow("guest list");
    expect(normalizeRegistrationPage({ maxAdditionalGuests: 1000 }).maxAdditionalGuests).toBe(10);
    expect(normalizeRegistrationPage({ maxAdditionalGuests: -1 }).maxAdditionalGuests).toBe(0);
  });
});
