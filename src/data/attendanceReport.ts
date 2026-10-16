import type { RegistrationWithGuest } from "./entities";
import { csvCell } from "./spreadsheet.ts";

export interface UniqueAttendeeRecord {
  name: string;
  email: string | null;
  organization: string | null;
  guestType: string | null;
  checkedInAt: string;
  checkInStation: string | null;
  registrationSource: "Imported registration" | "Walk-in" | "Organizer-added registration";
  duplicateRecordsConsolidated: number;
}

export interface UniqueAttendanceReport {
  summary: {
    registrationRows: number;
    uniqueRegistered: number;
    checkedInRows: number;
    uniqueCheckedIn: number;
    duplicateCheckedInRows: number;
    emailReady: number;
    missingEmail: number;
    attendanceRate: number;
  };
  attendees: UniqueAttendeeRecord[];
}

/** Exact full-name identity used when an import or walk-in has no email address. */
export function normalizeAttendeeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function preferredRow(rows: RegistrationWithGuest[]): RegistrationWithGuest {
  return [...rows].sort((left, right) => {
    const score = (row: RegistrationWithGuest) =>
      (row.guest?.contact ? 100 : 0) +
      ((row.importedFields?.length ?? 0) > 0 ? 20 : 0) +
      (row.guest?.name !== row.guest?.name.toLocaleLowerCase() ? 5 : 0) +
      (row.segment && row.segment.toLocaleLowerCase() !== "walk-in" ? 2 : 0);
    return score(right) - score(left) || (left.checkedInAt ?? "").localeCompare(right.checkedInAt ?? "");
  })[0]!;
}

function sourceFor(row: RegistrationWithGuest): UniqueAttendeeRecord["registrationSource"] {
  if ((row.importedFields?.length ?? 0) > 0) return "Imported registration";
  if (row.guest?.notes === "Registered at event check-in." || row.segment?.toLocaleLowerCase() === "walk-in") return "Walk-in";
  return "Organizer-added registration";
}

function groupByNormalizedName(rows: RegistrationWithGuest[]): Map<string, RegistrationWithGuest[]> {
  const groups = new Map<string, RegistrationWithGuest[]>();
  for (const row of rows) {
    const name = row.guest?.name;
    if (!name) continue;
    const key = normalizeAttendeeName(name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

export function buildUniqueAttendanceReport(rows: RegistrationWithGuest[]): UniqueAttendanceReport {
  const active = rows.filter((row) => row.status !== "cancelled" && row.guest?.name);
  const registeredGroups = groupByNormalizedName(active);
  const checkedIn = active.filter((row) => row.checkedInAt !== null);
  const checkedInGroups = groupByNormalizedName(checkedIn);
  const attendees = [...checkedInGroups.values()].map((group): UniqueAttendeeRecord => {
    const preferred = preferredRow(group);
    return {
      name: preferred.guest!.name.trim().replace(/\s+/g, " "),
      email: preferred.guest!.contact?.trim().toLocaleLowerCase() || null,
      organization: preferred.organization?.trim() || null,
      guestType: preferred.segment?.trim() || null,
      checkedInAt: group.map((row) => row.checkedInAt!).sort()[0]!,
      checkInStation: preferred.checkInStation,
      registrationSource: sourceFor(preferred),
      duplicateRecordsConsolidated: group.length - 1,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));

  const uniqueRegistered = registeredGroups.size;
  const uniqueCheckedIn = attendees.length;
  const emailReady = attendees.filter((row) => row.email).length;
  return {
    summary: {
      registrationRows: active.length,
      uniqueRegistered,
      checkedInRows: checkedIn.length,
      uniqueCheckedIn,
      duplicateCheckedInRows: checkedIn.length - uniqueCheckedIn,
      emailReady,
      missingEmail: uniqueCheckedIn - emailReady,
      attendanceRate: uniqueRegistered > 0 ? Math.round((uniqueCheckedIn / uniqueRegistered) * 1_000) / 10 : 0,
    },
    attendees,
  };
}

export function attendanceNamesCsv(attendees: UniqueAttendeeRecord[]): string {
  const lines = attendees.map((row) => csvCell(row.name));
  return ["Full Name", ...lines].join("\r\n") + "\r\n";
}
