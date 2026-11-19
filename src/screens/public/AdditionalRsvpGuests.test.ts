import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeRegistrationPage } from "@/data/registrationPage";
import AdditionalRsvpGuests, { RsvpQuestions } from "./AdditionalRsvpGuests";

const questions = normalizeRegistrationPage({ questions: [
  { id: "connection", label: "How do you know Carlin?", required: true, audience: "primary" },
  { id: "guest-meal", label: "Guest meal choice", type: "select", options: ["Standard", "Vegetarian"], required: true, audience: "guests" },
] }).questions;
describe("RSVP question audiences", () => {
  it("renders the main attendee's questions without requiring guest-only answers", () => {
    const html = renderToStaticMarkup(createElement(RsvpQuestions, { questions, answers: {}, onChange: () => {} }));
    expect(html).toContain("How do you know Carlin?");
    expect(html).not.toContain("Guest meal choice");
  });
  it("renders a companion's identity fields and only their own questions", () => {
    const html = renderToStaticMarkup(createElement(AdditionalRsvpGuests, { maximum: 1, guests: [{ id: "guest-1", firstName: "", lastName: "", email: "", answers: {} }], questions, onChange: () => {} }));
    expect(html).toContain('aria-label="Guest 1 first name"');
    expect(html).toContain('aria-label="Guest 1 last name"');
    expect(html).toContain('aria-label="Guest 1 email"');
    expect(html).toContain("Guest meal choice");
    expect(html).not.toContain("How do you know Carlin?");
  });
  it("shows just names and email when all event questions belong to the main attendee", () => {
    const html = renderToStaticMarkup(createElement(AdditionalRsvpGuests, { maximum: 1, guests: [{ id: "guest-1", firstName: "", lastName: "", email: "", answers: {} }], questions: questions.filter(question => question.audience === "primary"), onChange: () => {} }));
    expect(html).toContain('aria-label="Guest 1 email"');
    expect(html).not.toContain("How do you know Carlin?");
    expect(html).not.toContain("Answer these questions for this guest.");
  });
});
