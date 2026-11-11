import { describe, expect, it } from "vitest";
import { buildSeed } from "./memory/seed";
import type { ImportedSpreadsheetField, RegistrationWithGuest } from "./entities";
import { registrationNameParts, registrationNameUpdate, staffRegistrationIdentity } from "./registrationNames";
import { spreadsheetValue } from "./registrationSpreadsheet";

const row = (name: string, fields: ImportedSpreadsheetField[] = []): RegistrationWithGuest => {
  const seed = buildSeed();
  return { ...seed.registrations[0]!, guest: { ...seed.guests[0]!, name }, importedFields: fields };
};
describe("organizer registration names", () => {
  it("preserves explicit compound names instead of splitting the first name at spaces", () => {
    const registration = row("María Elena de la Cruz-Taylor", staffRegistrationIdentity("María Elena", "de la Cruz-Taylor").fields);
    expect(registrationNameParts(registration)).toEqual({ firstName: "María Elena", lastName: "de la Cruz-Taylor", inferred: false });
    expect(spreadsheetValue(registration, "First Name")).toBe("María Elena");
  });
  it("updates names and their original spreadsheet aliases without losing custom answers", () => {
    const fields = [{ label: "Guest", value: "Old Name" }, { label: "given_name", value: "Old" }, { label: "surname", value: "Name" }, { label: "T-shirt size", value: "M" }];
    const next = registrationNameUpdate(row("Old Name", fields), "María Elena", "de la Cruz-Taylor", fields);
    expect(next).toEqual({ name: "María Elena de la Cruz-Taylor", importedFields: [{ label: "Guest", value: "María Elena de la Cruz-Taylor" }, { label: "given_name", value: "María Elena" }, { label: "surname", value: "de la Cruz-Taylor" }, { label: "T-shirt size", value: "M" }] });
  });
  it("keeps an older full name unchanged when its inferred parts were not edited", () => {
    const registration = row("Mary   Ann de la Cruz");
    const parts = registrationNameParts(registration);
    expect(parts.inferred).toBe(true);
    expect(registrationNameUpdate(registration, parts.firstName, parts.lastName, []).name).toBe("Mary   Ann de la Cruz");
    const olderLongName = row(`Ana ${"B".repeat(130)}`);
    const olderParts = registrationNameParts(olderLongName);
    expect(registrationNameUpdate(olderLongName, olderParts.firstName, olderParts.lastName, []).name).toBe(olderLongName.guest!.name);
  });
  it("retains one-word names and rejects blank first names", () => {
    expect(staffRegistrationIdentity("Cher", "").name).toBe("Cher");
    expect(() => staffRegistrationIdentity(" ", "Putman")).toThrow("first name");
    expect(() => staffRegistrationIdentity("Carlin", "A".repeat(121))).toThrow("Last name");
  });
  it("discards stale name metadata after another editor changes the guest's full name", () => {
    expect(registrationNameParts(row("Carlin Putman", staffRegistrationIdentity("Old", "Name").fields))).toEqual({ firstName: "Carlin", lastName: "Putman", inferred: true });
  });
});
