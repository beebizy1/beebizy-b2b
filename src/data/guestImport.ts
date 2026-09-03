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

import { parseCsvTable, type SpreadsheetValue } from "./import";

export interface ParsedGuestRow {
  /** 1-based, matching what a spreadsheet shows, so an error message is findable. */
  line: number;
  name: string;
  contact: string;
  notes: string | null;
  /** Why this row can't be imported, or null when it can. */
  problem: string | null;
}

export interface GuestImportPreview {
  rows: ParsedGuestRow[];
  /** Headers we recognised, for telling the user what we read. */
  matched: { name: string | null; contact: string | null; notes: string | null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_KEYS = ["name", "full name", "fullname", "guest", "guest name", "attendee", "attendee name"];
const CONTACT_KEYS = ["email", "e-mail", "email address", "e-mail address", "contact", "contact email"];
const NOTES_KEYS = ["notes", "note", "comment", "comments", "dietary", "requirements"];

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

/**
 * Reads CSV into guest rows, flagging each one that can't be imported.
 *
 * Invalid rows are returned rather than dropped: a silent skip is how ten guests become
 * eight without anyone noticing.
 */
export function parseGuestCsv(source: string): GuestImportPreview {
  const table = parseCsvTable(source, "Guests");
  const nameHeader = pickHeader(table.headers, NAME_KEYS);
  const contactHeader = pickHeader(table.headers, CONTACT_KEYS);
  const notesHeader = pickHeader(table.headers, NOTES_KEYS);

  const seen = new Set<string>();

  const rows = table.rows.map((row, index) => {
    const name = nameHeader ? text(row[nameHeader]) : "";
    const contact = contactHeader ? text(row[contactHeader]) : "";
    const notes = notesHeader ? text(row[notesHeader]) : "";

    let problem: string | null = null;
    if (!name && !contact) problem = "Empty row";
    else if (!name) problem = "No name";
    else if (!contact) problem = "No email";
    else if (!EMAIL_RE.test(contact)) problem = "Email doesn't look valid";
    else if (seen.has(contact.toLowerCase())) problem = "Duplicate email in this file";

    if (problem === null) seen.add(contact.toLowerCase());

    return { line: index + 2, name, contact, notes: notes || null, problem };
  });

  return { rows, matched: { name: nameHeader, contact: contactHeader, notes: notesHeader } };
}

/** The header row we hand out, so an import that uses it always parses. */
export const GUEST_CSV_TEMPLATE =
  "name,email,notes\nJane Doe,jane@example.com,Vegetarian\nJohn Smith,john@example.com,\n";
