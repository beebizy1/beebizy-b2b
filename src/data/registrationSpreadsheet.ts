import type { RegistrationWithGuest } from "./entities";
import { registrationNameFieldKind, registrationNameParts } from "./registrationNames";

const DEFAULT_SPREADSHEET_HEADERS = [
  "Full Name",
  "First Name",
  "Last Name",
  "Email Address",
  "RSVP Response",
  "Company Name",
  "Guest Type",
  "Notes",
  "Attendees",
  "Phone",
  "Source",
] as const;

export type SpreadsheetFieldKind =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "status"
  | "organization"
  | "segment"
  | "notes"
  | "quantity"
  | "custom";

export function spreadsheetFieldKind(header: string): SpreadsheetFieldKind {
  const key = header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const nameKind = registrationNameFieldKind(header);
  if (nameKind) return nameKind;
  if (["email", "e mail", "email address", "e mail address", "contact email"].includes(key)) return "email";
  if (["rsvp", "rsvp response", "attendance", "response", "yes/no"].includes(key)) return "status";
  if (["company", "company name", "organization", "organisation", "school"].includes(key)) return "organization";
  if (["guest type", "segment", "category", "registration type", "lifecycle stage"].includes(key)) return "segment";
  if (["notes", "note", "comment", "comments"].includes(key)) return "notes";
  if (["attendees", "attendee count", "guest count", "number of guests", "party size", "seats", "quantity"].includes(key)) {
    return "quantity";
  }
  return "custom";
}

export function spreadsheetHeaders(rows: RegistrationWithGuest[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const field of row.importedFields ?? []) {
      if (seen.has(field.label)) continue;
      seen.add(field.label);
      headers.push(field.label);
    }
  }
  if (headers.length === 0) return [...DEFAULT_SPREADSHEET_HEADERS];
  // RSVP answers are additional fields, not an imported spreadsheet layout. Keep
  // the normal identity/status columns when all supplied headers are custom fields.
  if (headers.every(header => ["custom", "firstName", "lastName"].includes(spreadsheetFieldKind(header)))) {
    const defaults = new Set<string>(DEFAULT_SPREADSHEET_HEADERS);
    return [...DEFAULT_SPREADSHEET_HEADERS, ...headers.filter(header => !defaults.has(header))];
  }
  // Preserve imported columns and their order, then expose separate names as well.
  return [...headers, ...["First Name", "Last Name"].filter(header => !headers.some(existing => spreadsheetFieldKind(existing) === spreadsheetFieldKind(header)))];
}

export function spreadsheetValue(row: RegistrationWithGuest, header: string): string {
  const kind = spreadsheetFieldKind(header);
  if (kind === "firstName" || kind === "lastName") return registrationNameParts(row)[kind];
  const imported = row.importedFields?.find((field) => field.label === header);
  if (imported) return imported.value;
  if (kind === "name") return row.guest?.name ?? "";
  if (kind === "email") return row.guest?.contact ?? "";
  if (kind === "status") {
    return row.status === "confirmed" ? "Yes" : row.status === "cancelled" ? "No" : "Pending";
  }
  if (kind === "organization") return row.organization ?? "";
  if (kind === "segment") return row.segment ?? "";
  if (kind === "notes") return row.guest?.notes ?? "";
  if (kind === "quantity") return String(row.quantity);
  return "";
}
