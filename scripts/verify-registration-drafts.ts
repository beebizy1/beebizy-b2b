import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { and, eq, sql as fragment } from "drizzle-orm";
import { db } from "../src/server/db.ts";
import { events } from "../src/server/schema.ts";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage } from "../src/data/registrationPage.ts";
import type { RegistrationDesignDraft } from "../src/data/registrationDesignDraft.ts";

const sql = neon(process.env.DATABASE_URL!);
const page = { ...DEFAULT_REGISTRATION_PAGE, questions: [{ id: "shirt", label: "", type: "select" as const, required: true, options: ["M", ""] }] };
const make = (revision: number, discarded = false, workspace = "qa") => {
  const draft: RegistrationDesignDraft = { page, guestTypesInput: "Guest, Family", revision, discarded };
  return db.update(events).set({ registrationPage: fragment`jsonb_set(coalesce(${events.registrationPage}, '{}'::jsonb), '{_editorDrafts}', coalesce(${events.registrationPage}->'_editorDrafts', '{}'::jsonb) || jsonb_build_object(${"qa-user"}::text, ${JSON.stringify(draft)}::jsonb))` })
    .where(and(eq(events.id, "qa-event"), eq(events.workspaceId, workspace), fragment`coalesce((${events.registrationPage} #>> ARRAY['_editorDrafts', ${"qa-user"}::text, 'revision'])::bigint, 0) < ${revision}`))
    .returning({ page: events.registrationPage }).toSQL();
};
const initial = { ...DEFAULT_REGISTRATION_PAGE, headline: "Published headline", _editorDrafts: { other: { revision: 1 } } };
const queries = [make(100), make(99), make(101, true), make(100), make(200, false, "other-workspace")];
const results = await sql.transaction([
  sql.query("CREATE TEMPORARY TABLE events (id text, workspace_id text, registration_page jsonb) ON COMMIT DROP"),
  sql.query("INSERT INTO events VALUES ($1,$2,$3::jsonb)", ["qa-event", "qa", JSON.stringify(initial)]),
  ...queries.map(query => sql.query(query.sql, query.params)),
]);
assert.equal(results[2][0].registration_page.headline, "Published headline");
assert.equal(results[2][0].registration_page._editorDrafts.other.revision, 1);
assert.deepEqual(results[2][0].registration_page._editorDrafts["qa-user"].page.questions, page.questions);
assert.equal(results[3].length, 0);
assert.equal(results[4][0].registration_page._editorDrafts["qa-user"].discarded, true);
assert.equal(results[5].length, 0);
assert.equal(results[6].length, 0);
assert.ok(!JSON.stringify(normalizeRegistrationPage(results[2][0].registration_page)).includes("_editorDrafts"));
console.log("PASS: private draft round-trip, unchanged published content, per-user isolation, stale revision fencing, discard tombstone and public privacy. Temporary table removed at commit.");
