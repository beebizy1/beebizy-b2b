import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { addHubSpotListRegistrationsQuery } from "../src/server/hubspotEventSourceStore.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Only transaction-local temporary tables are used.");
const client = neon(process.env.DATABASE_URL);
const dialect = new PgDialect();
const generation = "89e06ceb-65d7-4b80-bcfa-a59c16815071";
const message = { eventId: "qa-hubspot-event-source", generation, tick: 0 };
const members = Array.from({ length: 200 }, (_, index) => String(index + 1));
function setup(capacity: number) {
  return [
    client.query("create temporary table events(id text primary key,workspace_id text,capacity int) on commit drop"),
    client.query("create temporary table hubspot_connections(id text primary key,workspace_id text,enabled boolean,inbound_enabled boolean) on commit drop"),
    client.query("create temporary table hubspot_event_sources(event_id text primary key,workspace_id text,connection_id text,list_id text,generation text,tick int,lease_token text,enabled boolean) on commit drop"),
    client.query("create temporary table guests(id text primary key,workspace_id text,name text,contact text) on commit drop"),
    client.query("create temporary table hubspot_inbound_contacts(connection_id text,workspace_id text,hubspot_contact_id text,guest_id text,first_name text,last_name text,company text,phone text,archived_at timestamptz,import_error text) on commit drop"),
    client.query("create temporary table registrations(id text primary key,workspace_id text,event_id text,guest_id text,status text,segment text,organization text,quantity int,imported_fields jsonb,checked_in_at timestamptz,unique(event_id,guest_id)) on commit drop"),
    client.query("create temporary table ticket_orders(event_id text,status text,quantity int) on commit drop"),
    client.query("create trigger qa_capacity before insert or update on registrations for each row execute function public.enforce_event_registration_capacity()"),
    client.query("insert into events values ($1,'qa',$2),('unrelated-event','qa',1000)", [message.eventId, capacity]),
    client.query("insert into hubspot_connections values ('connection','qa',true,true)"),
    client.query("insert into hubspot_event_sources values ($1,'qa','connection','123',$2,0,'lease',true)", [message.eventId, generation]),
    client.query("insert into guests select 'person-'||n,'qa','Test Guest '||n,'test'||n||'@example.invalid' from generate_series(1,203) n"),
    client.query("insert into hubspot_inbound_contacts select 'connection','qa',n::text,'person-'||n,'Test','Guest '||n,'School','4085550100',null,null from generate_series(1,203) n"),
  ];
}
function query(workspaceId = "qa", nextMessage = message, lease = "lease", ids = members) {
  const compiled = dialect.sqlToQuery(addHubSpotListRegistrationsQuery(workspaceId, "connection", nextMessage, lease, ids));
  return client.query(compiled.sql, compiled.params);
}
const statements = setup(400);
const append = (item: ReturnType<typeof client.query>) => { const position = statements.length; statements.push(item); return position; };
const initial = append(query());
const repeated = append(query());
append(client.query("update registrations set status='cancelled',checked_in_at='2026-11-12T12:00:00Z',imported_fields=imported_fields||'[{\"label\":\"T-shirt size\",\"value\":\"L\"}]'::jsonb where guest_id='person-1'"));
const next = append(query("qa", message, "lease", ["1", "201"]));
const wrongTenant = append(query("other-workspace", message, "lease", ["202"]));
const staleGeneration = append(query("qa", { ...message, generation: "659ba2f5-9811-44dc-b6a5-b1bbd2b7fa84" }, "lease", ["202"]));
const staleLease = append(query("qa", message, "old-lease", ["202"]));
append(client.query("update hubspot_event_sources set enabled=false"));
const paused = append(query("qa", message, "lease", ["202"]));
append(client.query("update hubspot_event_sources set enabled=true"));
append(client.query("update hubspot_connections set inbound_enabled=false"));
const disconnected = append(query("qa", message, "lease", ["202"]));
const snapshot = append(client.query("select count(*)::int total,count(*) filter(where checked_in_at is null)::int unarrived,count(*) filter(where event_id='unrelated-event')::int unrelated,(select to_jsonb(r) from registrations r where guest_id='person-1') preserved from registrations"));
const results = await client.transaction(statements);
const added = (index: number) => Number(results[index]![0]!.added);
assert.equal(added(initial), 200);
assert.equal(added(repeated), 0);
assert.equal(added(next), 1);
for (const index of [wrongTenant, staleGeneration, staleLease, paused, disconnected]) assert.equal(added(index), 0);
const final = results[snapshot]![0]!;
assert.equal(final.total, 201);
assert.equal(final.unarrived, 200);
assert.equal(final.unrelated, 0);
assert.equal(final.preserved.status, "cancelled");
assert.ok(final.preserved.checked_in_at);
assert.ok(final.preserved.imported_fields.some((field: { label: string; value: string }) => field.label === "T-shirt size" && field.value === "L"));
await assert.rejects(client.transaction([...setup(200), query(), query("qa", message, "lease", ["201"])]), (error: { code?: string }) => error.code === "23514");
console.log("Passed: 200 initial registrations, duplicate replay, automatic 201st registration, tenant/source/lease/pause fences, custom answers and arrival/status preservation, and the production capacity trigger. Temporary tables removed at commit or rollback.");
