import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { normalizeHubSpotContact } from "../src/data/hubspotContacts.ts";
import { applyHubSpotContactQuery, hubspotContactLocks, queueHubSpotEventsQuery, clearHubSpotEventsQuery } from "../src/server/hubspotContactStore.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for temporary-table verification.");
const client = neon(process.env.DATABASE_URL);
const dialect = new PgDialect();
const contact = (time: string, email = "person@example.invalid", firstName = "María Elena", archived = false) => normalizeHubSpotContact({ id: "123", updatedAt: time, archived, properties: { firstname: firstName, lastname: "de la Cruz-Taylor", email, company: "Source school", phone: "4085550100", hs_email_optout: "false" } });
const statements = [
  client.query("create temporary table hubspot_connections(id text primary key,workspace_id text,enabled boolean,inbound_enabled boolean,webhook_lease_token text) on commit drop"),
  client.query("create temporary table hubspot_contact_inbox(connection_id text,workspace_id text,hubspot_contact_id text,occurred_at timestamptz,event_kind text,updated_at timestamptz,primary key(connection_id,hubspot_contact_id)) on commit drop"),
  client.query("create temporary table guests(id text primary key,workspace_id text,name text,contact text,notes text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(workspace_id,contact)) on commit drop"),
  client.query("create temporary table hubspot_inbound_contacts(id text primary key,workspace_id text,connection_id text,hubspot_contact_id text,guest_id text,first_name text,last_name text,email text,company text,phone text,email_opt_out boolean,source_updated_at timestamptz,archived_at timestamptz,last_seen_run_id text,import_error text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(connection_id,hubspot_contact_id)) on commit drop"),
  client.query("create temporary table registrations(id text,workspace_id text,guest_id text,imported_fields jsonb,organization text,status text,quantity int,checked_in_at timestamptz,updated_at timestamptz default now()) on commit drop"),
  client.query("insert into hubspot_connections values ('connection-1','qa',true,true,'lease-1')"),
  client.query("insert into guests(id,workspace_id,name,contact,notes) values ('person-1','qa','Original local name','PERSON@Example.invalid','Keep private staff notes'),('other-person','other-workspace','Other workspace','person@example.invalid','Other notes'),('email-owner','qa','Another person','occupied@example.invalid','Do not merge')"),
  client.query("insert into registrations values ('registration-1','qa','person-1',$1::jsonb,'Manual event organization','confirmed',2,'2026-11-01T12:00:00Z',now())", [JSON.stringify([{ label: "Full Name", value: "Original local name" }, { label: "Email Address", value: "person@example.invalid" }, { label: "T-shirt size", value: "L" }])]),
];
const add = (query: ReturnType<typeof applyHubSpotContactQuery>) => { const compiled = dialect.sqlToQuery(query); const index = statements.length; statements.push(client.query(compiled.sql, compiled.params)); return index; };
const snapshot = () => { const index = statements.length; statements.push(client.query("select (select jsonb_agg(to_jsonb(g)) from guests g) as people,(select jsonb_agg(to_jsonb(h)) from hubspot_inbound_contacts h) as contacts,(select jsonb_agg(to_jsonb(r)) from registrations r) as registrations")); return index; };
const first = contact("2026-11-11T20:00:00.000Z");
add(hubspotContactLocks("qa", [first]));
add(applyHubSpotContactQuery("connection-1", "qa", first, "run-1")); const imported = snapshot();
add(applyHubSpotContactQuery("connection-1", "qa", first, "run-1")); const repeated = snapshot();
add(applyHubSpotContactQuery("connection-1", "qa", contact("2026-11-11T20:02:00.000Z", "occupied@example.invalid", "Conflicting name"), null)); const conflict = snapshot();
add(applyHubSpotContactQuery("connection-1", "qa", contact("2026-11-11T20:03:00.000Z", "updated@example.invalid", "María Ana"), null)); const updated = snapshot();
add(applyHubSpotContactQuery("connection-1", "qa", first, "run-2")); const stale = snapshot();
add(applyHubSpotContactQuery("connection-1", "other-workspace", contact("2026-11-11T20:05:00.000Z"), null)); const isolated = snapshot();
add(applyHubSpotContactQuery("connection-1", "qa", contact("2026-11-11T20:06:00.000Z", "updated@example.invalid", "María Ana", true), null)); const archived = snapshot();
const oldTime = new Date("2026-11-11T20:05:00Z"); const newTime = new Date("2026-11-11T20:06:00Z");
add(queueHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: oldTime.getTime(), kind: "contact.propertyChange" }]));
add(queueHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: newTime.getTime(), kind: "contact.deletion" }]));
const staleClear = add(clearHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: oldTime }], "lease-1"));
const otherTenantClear = add(clearHubSpotEventsQuery("connection-1", "other-workspace", [{ id: "123", time: newTime }], "lease-1"));
const staleLeaseClear = add(clearHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: newTime }], "old-lease"));
statements.push(client.query("update hubspot_connections set inbound_enabled=false"));
add(applyHubSpotContactQuery("connection-1", "qa", contact("2026-11-11T20:07:00.000Z", "updated@example.invalid", "Paused update"), null)); const paused = snapshot();
const pausedClear = add(clearHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: newTime }], "lease-1"));
const pausedEnqueue = add(queueHubSpotEventsQuery("connection-1", "qa", [{ id: "456", time: newTime.getTime(), kind: "contact.creation" }]));
statements.push(client.query("update hubspot_connections set inbound_enabled=true"));
const finalClear = add(clearHubSpotEventsQuery("connection-1", "qa", [{ id: "123", time: newTime }], "lease-1"));
const results = await client.transaction(statements);
const data = (index: number) => results[index]![0]!;
const person = (index: number) => data(index).people.find((item: { id: string }) => item.id === "person-1");
assert.equal(data(imported).contacts[0].guest_id, "person-1");
assert.equal(person(imported).name, "María Elena de la Cruz-Taylor");
assert.equal(person(imported).notes, "Keep private staff notes");
assert.equal(data(repeated).people.length, 3);
assert.equal(person(conflict).name, "María Elena de la Cruz-Taylor");
assert.match(data(conflict).contacts[0].import_error, /another person/);
assert.equal(person(updated).contact, "updated@example.invalid");
assert.equal(data(updated).contacts[0].import_error, null);
assert.equal(person(stale).name, "María Ana de la Cruz-Taylor");
assert.equal(data(stale).contacts[0].last_seen_run_id, "run-2");
const registration = data(updated).registrations[0];
assert.equal(registration.imported_fields.find((field: { label: string }) => field.label === "T-shirt size").value, "L");
assert.equal(registration.imported_fields.find((field: { label: string }) => field.label === "First Name").value, "María Ana");
assert.equal(registration.imported_fields.find((field: { label: string }) => field.label === "Email Address").value, "updated@example.invalid");
assert.equal(registration.status, "confirmed"); assert.equal(registration.quantity, 2); assert.ok(registration.checked_in_at);
assert.equal(registration.organization, "Manual event organization");
assert.equal(data(isolated).people.find((item: { id: string }) => item.id === "other-person").name, "Other workspace");
assert.equal(person(archived).name, "María Ana de la Cruz-Taylor"); assert.ok(data(archived).contacts[0].archived_at);
assert.equal(person(paused).name, "María Ana de la Cruz-Taylor");
for (const index of [staleClear, otherTenantClear, staleLeaseClear, pausedClear, pausedEnqueue]) assert.equal(results[index]!.length, 0);
assert.equal(results[finalClear]!.length, 1);
console.log("PASS: atomic source/person/registration mapping, compound names, duplicate deliveries, email conflicts, stale versions, full custom-answer preservation, arrival/status preservation, archive retention, tenant isolation, and pause fencing. Temporary tables removed at commit.");
