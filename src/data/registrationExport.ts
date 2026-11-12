import type { RegistrationWithGuest } from "./entities";
import { registrationNameParts } from "./registrationNames";
import { spreadsheetHeaders, spreadsheetFieldKind, spreadsheetValue } from "./registrationSpreadsheet";
import { csvCell } from "./spreadsheet";

/** Use current record fields for identity/status, retaining every custom RSVP answer. */
export function registrationExportTable(rows: RegistrationWithGuest[]): string[][] {
  const standard = ["First Name", "Last Name", "Full Name", "Email Address", "RSVP Response", "Company Name", "Guest Type", "Notes", "Attendees", "Registration ID", "Registered At (UTC)", "Checked In At (UTC)"];
  const extra = spreadsheetHeaders(rows).filter(header => spreadsheetFieldKind(header) === "custom");
  const headers = [...standard, ...extra.map(header => standard.includes(header) ? `Answer: ${header}` : header)];
  return [headers, ...rows.map(row => {
    const names = registrationNameParts(row);
    return [names.firstName, names.lastName, row.guest?.name ?? "", row.guest?.contact ?? "", row.status === "confirmed" ? "Yes" : row.status === "cancelled" ? "No" : "Pending", row.organization ?? "", row.segment ?? "", row.guest?.notes ?? "", String(row.quantity), row.id, row.registeredAt, row.checkedInAt ?? "", ...extra.map(header => spreadsheetValue(row, header))];
  })];
}

export function registrationCsv(rows: RegistrationWithGuest[]) {
  return "\uFEFF" + registrationExportTable(rows).map(row => row.map(csvCell).join(",")).join("\r\n");
}
