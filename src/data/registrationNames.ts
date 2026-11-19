import type { ImportedSpreadsheetField, RegistrationWithGuest } from "./entities";

export const NAME_COLUMN_ALIASES: Record<"name" | "firstName" | "lastName", readonly string[]> = {
  name: ["full name", "name", "guest", "guest name", "attendee"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
};

export function registrationNameFieldKind(label: string): "name" | "firstName" | "lastName" | null {
  const key = label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (NAME_COLUMN_ALIASES.name.includes(key)) return "name";
  if (NAME_COLUMN_ALIASES.firstName.includes(key)) return "firstName";
  if (NAME_COLUMN_ALIASES.lastName.includes(key)) return "lastName";
  return null;
}

export function registrationNameParts(row: RegistrationWithGuest) {
  const name = row.guest?.name ?? "";
  const first = row.importedFields?.find(field => registrationNameFieldKind(field.label) === "firstName")?.value.trim();
  const last = row.importedFields?.find(field => registrationNameFieldKind(field.label) === "lastName")?.value.trim();
  if (first && last !== undefined && [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ") === name.trim().replace(/\s+/g, " ")) {
    return { firstName: first, lastName: last, inferred: false };
  }
  const match = name.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { firstName: match?.[1] ?? "", lastName: match?.[2] ?? "", inferred: Boolean(name) };
}

/** Staff may retain a one-word name; never invent a surname for an older record. */
export function staffRegistrationIdentity(first: string, last: string) {
  const firstName = first.trim();
  const lastName = last.trim();
  if (!firstName || firstName.length > 120) throw new Error("Enter a first name (120 characters or fewer).");
  if (lastName.length > 120) throw new Error("Last name must be 120 characters or fewer.");
  return { name: [firstName, lastName].filter(Boolean).join(" "), fields: [{ label: "First Name", value: firstName }, { label: "Last Name", value: lastName }] };
}

/** Updating a name also updates its original spreadsheet aliases, without losing answers. */
export function registrationNameUpdate(row: RegistrationWithGuest, first: string, last: string, fields: ImportedSpreadsheetField[]) {
  const original = registrationNameParts(row);
  const unchanged = first.trim() === original.firstName && last.trim() === original.lastName && Boolean(row.guest?.name);
  const identity = unchanged
    ? { name: row.guest!.name, fields: [{ label: "First Name", value: first.trim() }, { label: "Last Name", value: last.trim() }] }
    : staffRegistrationIdentity(first, last);
  const name = identity.name;
  const importedFields = fields.map(field => {
    const kind = registrationNameFieldKind(field.label);
    return { ...field, value: kind === "name" ? name : kind === "firstName" ? first.trim() : kind === "lastName" ? last.trim() : field.value };
  });
  for (const field of identity.fields) {
    if (!importedFields.some(candidate => registrationNameFieldKind(candidate.label) === registrationNameFieldKind(field.label))) importedFields.push(field);
  }
  return { name, importedFields };
}
