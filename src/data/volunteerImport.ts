import { VOLUNTEER_STATUSES, type VolunteerShiftDraft, type VolunteerStatus } from "./entities";
import { parseCsvTable, type SpreadsheetTable, type SpreadsheetValue } from "./import";

export interface ParsedVolunteerRow extends VolunteerShiftDraft {
  /** 1-based and includes the header row, matching spreadsheet applications. */
  line: number;
  problem: string | null;
}

export interface VolunteerImportPreview {
  rows: ParsedVolunteerRow[];
  matched: Record<keyof typeof keys, string | null>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const keys = {
  name: ["volunteer", "volunteer name", "name", "full name"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "mobile", "phone number"],
  role: ["role", "assignment", "position", "job", "station", "entrance"],
  dayNumber: ["day", "event day", "shift day", "day number"],
  shiftDate: ["date", "shift date", "volunteer date", "event date"],
  startTime: ["start", "start time", "shift start", "starts"],
  endTime: ["end", "end time", "shift end", "ends"],
  status: ["status", "confirmation status"],
  notes: ["notes", "note", "instructions", "details", "location"],
} as const;

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const pick = (headers: string[], candidates: readonly string[]): string | null => {
  const wanted = new Set(candidates.map(normalize));
  return headers.find((header) => wanted.has(normalize(header))) ?? null;
};

const text = (value: SpreadsheetValue): string =>
  value == null ? "" : value instanceof Date ? value.toISOString() : String(value).trim();

function localTime(value: SpreadsheetValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function status(value: string): VolunteerStatus {
  const normalized = normalize(value).replace(/\s+/g, "_");
  return VOLUNTEER_STATUSES.includes(normalized as VolunteerStatus)
    ? normalized as VolunteerStatus
    : "scheduled";
}

function explicitDayNumber(value: SpreadsheetValue): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365) return value;
  const match = String(value ?? "").trim().match(/^(?:day\s*)?(\d{1,3})$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return parsed >= 1 && parsed <= 365 ? parsed : null;
}

function calendarDay(value: SpreadsheetValue): number | null {
  const dateOnly = typeof value === "string" ? value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (dateOnly) return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = value instanceof Date ? value : new Date(String(value ?? "").trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function dayFromDate(value: SpreadsheetValue, eventStartDate?: string | Date): number | null {
  if (!eventStartDate) return null;
  const shiftDay = calendarDay(value);
  const startDay = calendarDay(eventStartDate);
  if (shiftDay === null || startDay === null) return null;
  const result = Math.round((shiftDay - startDay) / 86_400_000) + 1;
  return result >= 1 && result <= 365 ? result : null;
}

export function volunteerShiftImportKey(
  shift: Pick<VolunteerShiftDraft, "name" | "email" | "role" | "dayNumber" | "startTime" | "endTime">,
): string {
  const identity = shift.email?.trim().toLowerCase() || shift.name.trim().toLowerCase();
  return `${identity}|${shift.role.trim().toLowerCase()}|${shift.dayNumber ?? 1}|${shift.startTime}|${shift.endTime}`;
}

/** Parse a table without hiding bad rows, so the organizer can correct the source file. */
export function parseVolunteerTable(
  table: SpreadsheetTable,
  options: { eventStartDate?: string | Date } = {},
): VolunteerImportPreview {
  const matched = Object.fromEntries(
    Object.entries(keys).map(([key, candidates]) => [key, pick(table.headers, candidates)]),
  ) as VolunteerImportPreview["matched"];
  const seen = new Set<string>();

  const rows = table.rows.map((row, index): ParsedVolunteerRow => {
    const read = (key: keyof typeof keys): string => matched[key] ? text(row[matched[key]!]) : "";
    const name = read("name");
    const email = read("email");
    const role = read("role");
    const startTime = matched.startTime ? localTime(row[matched.startTime]) : null;
    const endTime = matched.endTime ? localTime(row[matched.endTime]) : null;
    const explicitDayValue = matched.dayNumber ? row[matched.dayNumber] : null;
    const shiftDateValue = matched.shiftDate ? row[matched.shiftDate] : null;
    const rowDayNumber = explicitDayNumber(explicitDayValue)
      ?? dayFromDate(shiftDateValue, options.eventStartDate)
      ?? 1;
    const duplicateKey = volunteerShiftImportKey({ name, email, role, dayNumber: rowDayNumber, startTime: startTime ?? "", endTime: endTime ?? "" });
    let problem: string | null = null;
    if (!name && !email && !role) problem = "Empty row";
    else if (!name) problem = "No volunteer name";
    else if (!role) problem = "No role or assignment";
    else if (matched.dayNumber && text(explicitDayValue) && explicitDayNumber(explicitDayValue) === null) problem = "Event day must be a whole number from 1 to 365";
    else if (!matched.dayNumber && matched.shiftDate && text(shiftDateValue) && dayFromDate(shiftDateValue, options.eventStartDate) === null) problem = "Shift date must fall on or after the event start date";
    else if (!startTime || !endTime) problem = "Start and end time are required";
    else if (startTime === endTime) problem = "Start and end time must be different";
    else if (email && !EMAIL_RE.test(email)) problem = "Email doesn't look valid";
    else if (seen.has(duplicateKey)) problem = "Duplicate shift in this file";
    if (!problem) seen.add(duplicateKey);

    return {
      line: index + 2,
      name,
      email: email || null,
      phone: read("phone") || null,
      role,
      dayNumber: rowDayNumber,
      startTime: startTime ?? "",
      endTime: endTime ?? "",
      status: status(read("status")),
      notes: read("notes") || null,
      problem,
    };
  });

  return { rows, matched };
}

export function parseVolunteerCsv(source: string): VolunteerImportPreview {
  return parseVolunteerTable(parseCsvTable(source, "Volunteers"));
}

export const VOLUNTEER_CSV_TEMPLATE = [
  "volunteer name,email,phone,role,day,start time,end time,status,notes",
  "Maya Chen,maya@example.com,408-555-0100,East entrance,1,8:00 AM,12:30 PM,Confirmed,Arrive 15 minutes early",
].join("\n");
