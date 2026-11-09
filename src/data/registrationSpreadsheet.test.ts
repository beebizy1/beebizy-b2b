import { describe, expect, it } from "vitest";
import type { RegistrationWithGuest } from "./entities";
import { buildSeed } from "./memory/seed";
import { spreadsheetHeaders, spreadsheetValue } from "./registrationSpreadsheet";

function row(fields: Array<{ label: string; value: string }>): RegistrationWithGuest {
  const seed = buildSeed();
  return { ...seed.registrations[0]!, importedFields: fields, guest: { ...seed.guests[0]!, name: "RSVP Test Guest", contact: "qa@example.invalid" } };
}
describe("custom registration answer columns", () => {
  it("keeps identity and registration columns when RSVP answers are the only extra fields", () => {
    const registration = row([{ label: "T-shirt size", value: "M" }]);
    const headers = spreadsheetHeaders([registration]);
    expect(headers).toContain("Full Name");
    expect(headers).toContain("Email Address");
    expect(headers).toContain("RSVP Response");
    expect(headers).toContain("T-shirt size");
    expect(spreadsheetValue(registration, "Full Name")).toBe("RSVP Test Guest");
    expect(spreadsheetValue(registration, "T-shirt size")).toBe("M");
  });
  it("preserves an imported spreadsheet's original names and order", () => {
    const registration = row([{ label: "Guest", value: "Imported name" }, { label: "Email", value: "imported@example.com" }, { label: "Dietary requests", value: "Vegetarian" }]);
    expect(spreadsheetHeaders([registration])).toEqual(["Guest", "Email", "Dietary requests"]);
    expect(spreadsheetValue(registration, "Guest")).toBe("Imported name");
  });
});
