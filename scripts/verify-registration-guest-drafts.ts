import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { registrationGuestDraftSaveQuery } from "../src/server/registrationGuestDrafts.ts";
import { normalizeRegistrationPage, DEFAULT_REGISTRATION_PAGE } from "../src/data/registrationPage.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the temporary-table verification.");
const sql = neon(process.env.DATABASE_URL);
const values = { firstName: "María Elena", lastName: "de la Cruz-Taylor", contact: "qa@example.invalid", Notes: "Unfinished\nnotes ", "T-shirt size": "M" };
const query = (revision: number, key = "add-guest", user = "qa-user", workspace = "qa", event = "qa-event", discarded = false) => registrationGuestDraftSaveQuery({ workspaceId: workspace, userId: user }, event, key, { values, revision, discarded }).toSQL();
const queries = [query(100), query(99), query(101, "edit-reg-1"), query(102, "add-guest", "other-user"), query(103, "add-guest", "qa-user", "other-workspace"), query(104, "add-guest", "qa-user", "qa", "other-event"), query(105, "add-guest", "qa-user", "qa", "qa-event", true), query(100)];
const initial = { ...DEFAULT_REGISTRATION_PAGE, headline: "Published invitation", _editorDrafts: { "qa-user": { revision: 25, page: { headline: "Private design" } } } };
const results = await sql.transaction([
  sql.query("CREATE TEMPORARY TABLE events (id text, workspace_id text, registration_page jsonb) ON COMMIT DROP"),
  sql.query("INSERT INTO events VALUES ($1,$2,$3::jsonb)", ["qa-event", "qa", JSON.stringify(initial)]),
  ...queries.map(item => sql.query(item.sql, item.params)),
]);
assert.deepEqual(results[2][0].registration_page._guestEditorDrafts["qa-user"]["add-guest"].values, values);
assert.equal(results[3].length, 0);
assert.equal(results[4][0].registration_page._guestEditorDrafts["qa-user"]["add-guest"].revision, 100);
assert.equal(results[5][0].registration_page._guestEditorDrafts["qa-user"]["edit-reg-1"].revision, 101);
assert.equal(results[6].length, 0); assert.equal(results[7].length, 0);
const final = results[8][0].registration_page;
assert.equal(final._guestEditorDrafts["qa-user"]["add-guest"].discarded, true);
assert.equal(final._guestEditorDrafts["other-user"]["add-guest"].revision, 102);
assert.equal(final._editorDrafts["qa-user"].revision, 25);
assert.equal(final.headline, "Published invitation"); assert.equal(results[9].length, 0);
assert.ok(!JSON.stringify(normalizeRegistrationPage(final)).includes("qa@example.invalid"));
console.log("PASS: full guest draft round-trip, per-user/per-form isolation, stale revisions, discard tombstone, workspace/event boundaries, unchanged published design, and private data excluded from public settings. Temporary table removed at commit.");
