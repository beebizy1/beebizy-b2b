import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { publicRsvpPartyQueries, type RsvpPartyInsert } from "../src/server/publicRsvpStore.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = neon(process.env.DATABASE_URL); const dialect = new PgDialect();
const input: RsvpPartyInsert = { workspaceId: "qa", eventId: "qa-public-party", partyId: "party-one", segment: "General", organization: null, people: [
  { guestId: "new-host", registrationId: "host-reg", name: "María Elena de la Cruz", email: "host@example.invalid", fields: [{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz" }, { label: "Dietary needs", value: "Vegetarian" }] },
  { guestId: "new-companion", registrationId: "guest-reg", name: "Alex Taylor", email: null, fields: [{ label: "First Name", value: "Alex" }, { label: "Last Name", value: "Taylor" }, { label: "Dietary needs", value: "No nuts" }] },
] };
const statements = [
  client.query("create temporary table events(id text primary key,capacity integer) on commit drop"),
  client.query("create temporary table guests(id text primary key,workspace_id text,name text,contact text,notes text,unique(workspace_id,contact)) on commit drop"),
  client.query("create temporary table registrations(id text primary key,workspace_id text,event_id text,guest_id text not null references guests(id),status text,segment text,organization text,quantity integer,imported_fields jsonb,checked_in_at timestamptz,unique(event_id,guest_id)) on commit drop"),
  client.query("create temporary table ticket_orders(event_id text,status text,quantity integer) on commit drop"),
  client.query("create trigger capacity_guard before insert or update on registrations for each row execute function public.enforce_event_registration_capacity()"),
  client.query("insert into events values ('qa-public-party',3)"),
  client.query("insert into guests values ('existing-host','qa','Original saved name','HOST@Example.invalid','Keep private staff notes'),('other-workspace-host','another-workspace','Other person','host@example.invalid','Other notes')"),
];
function add(query: ReturnType<typeof publicRsvpPartyQueries>[number]) { const item = dialect.sqlToQuery(query); statements.push(client.query(item.sql, item.params)); }
const snapshot = () => { const index = statements.length; statements.push(client.query("select (select jsonb_agg(to_jsonb(g)) from guests g) as people,(select jsonb_agg(to_jsonb(r)) from registrations r) as registrations")); return index; };
publicRsvpPartyQueries(input).forEach(add); const saved = snapshot();
const literal = (value: unknown) => value === null ? "NULL" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function expectedFailure(value: RsvpPartyInsert, code: "unique_violation" | "check_violation") {
  // Execute the real parameterized statements in a caught subtransaction, then inspect rollback.
  const body = publicRsvpPartyQueries(value).map(query => { const compiled = dialect.sqlToQuery(query); const text = compiled.sql.replace(/\$(\d+)/g, (_, index: string) => literal(compiled.params[Number(index) - 1])); return `EXECUTE ${literal(text)};`; }).join("\n");
  statements.push(client.query(`do $qa$ begin ${body} raise exception 'Expected registration failure'; exception when ${code} then null; end $qa$`));
}
expectedFailure({ ...input, people: input.people.map((person, index) => ({ ...person, guestId: `duplicate-${index}`, registrationId: `duplicate-reg-${index}` })) }, "unique_violation"); const duplicate = snapshot();
expectedFailure({ ...input, partyId: "party-too-large", people: input.people.map((person, index) => ({ ...person, guestId: `capacity-${index}`, registrationId: `capacity-reg-${index}`, email: index === 0 ? "another-host@example.invalid" : null })) }, "check_violation"); const full = snapshot();
const result = await client.transaction(statements); const data = (index: number) => result[index]![0]!;
assert.equal(data(saved).registrations.length, 2); assert.equal(data(saved).people.length, 3);
assert.equal(data(saved).registrations.find((row: { id: string }) => row.id === "host-reg").guest_id, "existing-host");
assert.equal(data(saved).people.find((row: { id: string }) => row.id === "existing-host").notes, "Keep private staff notes");
for (const row of data(saved).registrations) { assert.equal(row.quantity, 1); assert.equal(row.status, "confirmed"); assert.equal(row.checked_in_at, null); assert.equal(row.imported_fields.find((field: { label: string }) => field.label === "RSVP group").value, "party-one"); }
assert.deepEqual(data(duplicate), data(saved)); assert.deepEqual(data(full), data(saved));
console.log("PASS: individual guest rows, mixed-case email matching, notes and tenant preservation, shared party metadata, duplicate rollback, and capacity failure on the second guest rolling back the entire party. Temporary tables removed at commit.");
