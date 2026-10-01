/**
 * Restores the original spreadsheet columns onto registrations imported before Beebizy
 * started retaining source cells.
 *
 * Usage:
 *   npx tsx scripts/backfill-registration-import-fields.mts \
 *     --event evt_xxx --file /absolute/path/to/list.xlsx [--sheet "Guests"] [--apply]
 *
 * Without --apply this only reports how many event registrations match.
 */

import { neon } from "@neondatabase/serverless";
import { readSheet } from "read-excel-file/node";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const eventId = value("event");
const filePath = value("file");
const sheetName = value("sheet") ?? "Beebizy Import";
const apply = args.includes("--apply");

if (!eventId || !filePath) {
  console.error("Missing --event evt_xxx or --file /absolute/path/to/list.xlsx");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pull the linked Vercel production environment first.");
  process.exit(1);
}

const matrix = await readSheet(filePath, sheetName);
const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
if (headers.length === 0 || headers.some((header) => !header)) {
  throw new Error(`Worksheet “${sheetName}” needs one non-empty header per column.`);
}

const normalize = (value: unknown) => value instanceof Date ? value.toISOString() : String(value ?? "").trim();
const rows = matrix.slice(1).map((values) => {
  const cells = Object.fromEntries(headers.map((header, index) => [header, normalize(values[index])]));
  return {
    email: cells["Email Address"]?.toLowerCase() ?? "",
    name: cells["Full Name"] ?? "",
    notes: cells["Notes"] ?? "",
    fields: headers.map((label) => ({ label, value: cells[label] ?? "" })),
  };
}).filter((row) => row.name || row.email);

const sql = neon(process.env.DATABASE_URL);
const payload = JSON.stringify(rows);
const matched = await sql`
  with source_rows as (
    select *
    from jsonb_to_recordset(${payload}::jsonb)
      as source(email text, name text, notes text, fields jsonb)
  )
  select count(*)::integer as count
  from source_rows source
  join guests guest on (
    (source.email <> '' and lower(guest.contact) = source.email)
    or (
      source.email = ''
      and lower(guest.name) = lower(source.name)
      and coalesce(guest.notes, '') = source.notes
    )
  )
  join registrations registration
    on registration.guest_id = guest.id and registration.event_id = ${eventId}
`;

console.log(`${rows.length} spreadsheet rows read; ${matched[0]?.count ?? 0} event registrations matched.`);
if (!apply) {
  console.log("Dry run only. Add --apply to save the source columns.");
  process.exit(0);
}

const updated = await sql`
  with source_rows as (
    select *
    from jsonb_to_recordset(${payload}::jsonb)
      as source(email text, name text, notes text, fields jsonb)
  ), matches as (
    select registration.id, source.fields
    from source_rows source
    join guests guest on (
      (source.email <> '' and lower(guest.contact) = source.email)
      or (
        source.email = ''
        and lower(guest.name) = lower(source.name)
        and coalesce(guest.notes, '') = source.notes
      )
    )
    join registrations registration
      on registration.guest_id = guest.id and registration.event_id = ${eventId}
  )
  update registrations registration
  set imported_fields = matches.fields, updated_at = now()
  from matches
  where registration.id = matches.id
  returning registration.id
`;

console.log(`${updated.length} registrations updated.`);
