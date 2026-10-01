/**
 * Turning a pasted spreadsheet into guest rows.
 *
 * Kept separate from the dialog because column-guessing and validation are where the
 * bugs live, and neither needs a DOM to test.
 *
 * Column names are matched loosely — a real export says "Email", "E-mail Address" or
 * "Contact" depending on who produced it, and rejecting a file over that would push the
 * work back onto the person least able to fix it.
 */

import { parseCsvTable, type SpreadsheetTable, type SpreadsheetValue } from "./import";
import type { ImportedSpreadsheetField } from "./entities";

export interface ParsedGuestRow {
  /** 1-based, matching what a spreadsheet shows, so an error message is findable. */
  line: number;
  name: string;
  contact: string | null;
  /** Number of people represented by this registration row. */
  partySize: number;
  notes: string | null;
  organization: string | null;
  segment: string | null;
  /** Every original cell, so the imported list can still look like the source sheet. */
  importedFields: ImportedSpreadsheetField[];
  /** Why this row can't be imported, or null when it can. */
  problem: string | null;
}

export interface GuestImportPreview {
  rows: ParsedGuestRow[];
  /** Every source column, so the organizer can correct an unfamiliar layout. */
  headers: string[];
  /** Headers we recognised, for telling the user what we read. */
  matched: {
    name: string | null;
    contact: string | null;
    attendance: string | null;
    notes: string | null;
    organization: string | null;
    segment: string | null;
    partySize: string | null;
  };
  /** The actual columns used, including separate first and last name fields. */
  mapping: GuestImportColumnMapping;
}

export interface GuestImportColumnMapping {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  contact: string | null;
  attendance: string | null;
  notes: string | null;
  organization: string | null;
  segment: string | null;
  partySize: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PARTY_SIZE = 10_000;

const NAME_KEYS = ["name", "full name", "fullname", "guest", "guest name", "attendee", "attendee name"];
const FIRST_NAME_KEYS = ["first name", "firstname", "contact first name"];
const LAST_NAME_KEYS = ["last name", "lastname", "contact last name"];
const CONTACT_KEYS = ["email", "e-mail", "email address", "e-mail address", "contact email"];
const ATTENDANCE_KEYS = ["yes/no", "rsvp", "rsvp response", "attending", "attendance", "response"];
const NOTES_KEYS = ["notes", "note", "comment", "comments", "dietary", "requirements"];
const ORGANIZATION_KEYS = ["company name", "company", "organization", "organisation", "school"];
const SEGMENT_KEYS = ["segment", "category", "guest type", "registration type", "lifecycle stage"];
const PARTY_SIZE_KEYS = [
  "attendees",
  "attendee count",
  "guest count",
  "number of guests",
  "party size",
  "seats",
  "quantity",
];

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * First header matching one of `candidates`.
 *
 * Both sides go through `normalise`, so a candidate written "e-mail address" still
 * matches a header written "E-Mail Address" — normalising only the header silently
 * failed to match anything hyphenated.
 */
function pickHeader(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const wanted = normalise(candidate);
    const hit = headers.find((header) => normalise(header) === wanted);
    if (hit) return hit;
  }
  return null;
}

function text(value: SpreadsheetValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function looksLikeEmailColumn(rows: Record<string, SpreadsheetValue>[], header: string): boolean {
  const values = rows.map((row) => text(row[header])).filter(Boolean);
  return values.length > 0 && values.filter((value) => EMAIL_RE.test(value)).length / values.length >= 0.6;
}

function looksLikeNameColumn(rows: Record<string, SpreadsheetValue>[], header: string): boolean {
  const values = rows.map((row) => text(row[header])).filter(Boolean);
  if (values.length === 0) return false;
  const personLike = values.filter((value) => {
    if (EMAIL_RE.test(value) || /^[-+]?\d+(?:\.\d+)?$/.test(value)) return false;
    if (/^(?:yes|no|y|n|true|false|maybe|pending)$/i.test(value)) return false;
    return /^[\p{L}][\p{L}\p{M}.'’ -]+$/u.test(value) && value.trim().split(/\s+/).length >= 2;
  });
  return personLike.length / values.length >= 0.6;
}

function suggestedMapping(
  headers: string[],
  rows: Record<string, SpreadsheetValue>[],
): GuestImportColumnMapping {
  let name = pickHeader(headers, NAME_KEYS);
  let contact = pickHeader(headers, CONTACT_KEYS);
  const attendance = pickHeader(headers, ATTENDANCE_KEYS);
  const firstName = name ? null : pickHeader(headers, FIRST_NAME_KEYS);
  const lastName = name ? null : pickHeader(headers, LAST_NAME_KEYS);
  const notes = pickHeader(headers, NOTES_KEYS);
  const organization = pickHeader(headers, ORGANIZATION_KEYS);
  const segment = pickHeader(headers, SEGMENT_KEYS);
  const partySize = pickHeader(headers, PARTY_SIZE_KEYS);
  const ambiguousContact = pickHeader(headers, ["contact"]);

  // "Contact" is commonly either a person's name or their email. Inspecting the cells
  // avoids the Mrs Bench failure where a list of names was treated as invalid email.
  if (ambiguousContact && !contact && looksLikeEmailColumn(rows, ambiguousContact)) {
    contact = ambiguousContact;
  } else if (ambiguousContact && !name) {
    name = ambiguousContact;
  }

  // Some exports use an unfamiliar email header. Values are a safer signal than the
  // label, but only claim the column when the majority of populated cells are emails.
  if (!contact) {
    contact = headers.find((header) => header !== name && looksLikeEmailColumn(rows, header)) ?? null;
  }

  if (!name && !firstName && !lastName) {
    const reserved = new Set([contact, attendance, notes, organization, segment, partySize].filter(Boolean));
    name = headers.find((header) => !reserved.has(header) && looksLikeNameColumn(rows, header)) ?? null;
  }

  return {
    name,
    firstName: name ? null : firstName,
    lastName: name ? null : lastName,
    contact,
    attendance,
    notes,
    organization,
    segment,
    partySize,
  };
}

function applyMapping(
  suggested: GuestImportColumnMapping,
  override: Partial<GuestImportColumnMapping>,
): GuestImportColumnMapping {
  const mapping = { ...suggested };
  for (const key of Object.keys(override) as (keyof GuestImportColumnMapping)[]) {
    mapping[key] = override[key] ?? null;
  }
  return mapping;
}

/** Reads a normalized spreadsheet table into guest rows. */
export function parseGuestTable(
  table: SpreadsheetTable,
  override: Partial<GuestImportColumnMapping> = {},
): GuestImportPreview {
  const mapping = applyMapping(suggestedMapping(table.headers, table.rows), override);
  const nameHeader = mapping.name;
  const firstNameHeader = mapping.firstName;
  const lastNameHeader = mapping.lastName;
  const contactHeader = mapping.contact;
  const attendanceHeader = mapping.attendance;
  const notesHeader = mapping.notes;
  const organizationHeader = mapping.organization;
  const segmentHeader = mapping.segment;
  const partySizeHeader = mapping.partySize;
  const matchedName = nameHeader ?? ([firstNameHeader, lastNameHeader].filter(Boolean).join(" + ") || null);

  const seen = new Set<string>();

  const rows = table.rows.map((row, index) => {
    const name = nameHeader
      ? text(row[nameHeader])
      : [firstNameHeader ? text(row[firstNameHeader]) : "", lastNameHeader ? text(row[lastNameHeader]) : ""]
          .filter(Boolean)
          .join(" ");
    const contact = contactHeader ? text(row[contactHeader]) : "";
    const attendance = attendanceHeader ? text(row[attendanceHeader]).toLowerCase() : "";
    const notes = notesHeader ? text(row[notesHeader]) : "";
    const organization = organizationHeader ? text(row[organizationHeader]) : "";
    const segment = segmentHeader ? text(row[segmentHeader]) : "";
    const partySizeText = partySizeHeader ? text(row[partySizeHeader]) : "1";
    const partySize = partySizeText === "" ? 1 : Number(partySizeText);
    const importedFields = table.headers.map((label) => ({ label, value: text(row[label]) }));

    let problem: string | null = null;
    if (!name && !contact) problem = "Empty row";
    else if (!name) problem = "No name";
    else if (["no", "n", "declined", "not attending", "false"].includes(attendance)) problem = "Not attending";
    else if (contact && !EMAIL_RE.test(contact)) problem = "Email doesn't look valid";
    else if (contact && seen.has(contact.toLowerCase())) problem = "Duplicate email in this file";
    else if (!Number.isSafeInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
      problem = "Attendee count must be between 1 and 10,000";
    }

    if (problem === null && contact) seen.add(contact.toLowerCase());

    return {
      line: index + 2,
      name,
      contact: contact || null,
      partySize,
      notes: notes || null,
      organization: organization || null,
      segment: segment || null,
      importedFields,
      problem,
    };
  });

  return {
    rows,
    headers: table.headers,
    matched: {
      name: matchedName,
      contact: contactHeader,
      attendance: attendanceHeader,
      notes: notesHeader,
      organization: organizationHeader,
      segment: segmentHeader,
      partySize: partySizeHeader,
    },
    mapping,
  };
}

/**
 * Reads CSV into guest rows, flagging each one that can't be imported.
 *
 * Invalid rows are returned rather than dropped: a silent skip is how ten guests become
 * eight without anyone noticing.
 */
export function parseGuestCsv(
  source: string,
  override: Partial<GuestImportColumnMapping> = {},
): GuestImportPreview {
  return parseGuestTable(parseCsvTable(source, "Guests"), override);
}

/** Picks a safe initial worksheet while still allowing the organizer to change it. */
export function suggestGuestSpreadsheetTableIndex(tables: SpreadsheetTable[]): number {
  if (tables.length === 0) throw new Error("The workbook does not contain any worksheets.");

  const guestSheetName = /\b(rsvps?|guests?|attendees?|invitees?|registrations?|check[ -]?ins?)\b/i;
  const ranked = tables.map((table, index) => {
    const preview = parseGuestTable(table);
    return {
      index,
      namedLikeGuestList: guestSheetName.test(table.name) && preview.rows.some((row) => row.problem === null),
      validRows: preview.rows.filter((row) => row.problem === null).length,
      hasName: preview.matched.name !== null,
      rowCount: preview.rows.length,
    };
  });

  ranked.sort((left, right) =>
    Number(right.namedLikeGuestList) - Number(left.namedLikeGuestList)
    || right.validRows - left.validRows
    || Number(right.hasName) - Number(left.hasName)
    || right.rowCount - left.rowCount
    || left.index - right.index,
  );
  return ranked[0]!.index;
}

/** Selects the worksheet that contains the strongest usable guest list. */
export function parseGuestSpreadsheetTables(
  tables: SpreadsheetTable[],
  override: Partial<GuestImportColumnMapping> = {},
): GuestImportPreview {
  return parseGuestTable(tables[suggestGuestSpreadsheetTableIndex(tables)]!, override);
}

/** The header row we hand out, so an import that uses it always parses. */
export const GUEST_CSV_TEMPLATE =
  "name,email,guest type,company,notes\nJane Doe,jane@example.com,Investor,Acme Ventures,Vegetarian\nJohn Smith,john@example.com,General,,\n";
