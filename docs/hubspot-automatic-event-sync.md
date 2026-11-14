# Automatic HubSpot event registration sync

Updated November 13, 2026.

An owner or admin opens an event's Registrations section, selects a contact registration list from the connected HubSpot account, and explicitly connects it. Existing list members are imported as confirmed registrations. New members are discovered in background checks about every minute, subject to HubSpot's own list processing and provider availability. Each person has quantity one and remains unchecked-in. This does not send email, charge a card, or collect ticket revenue.

The organization connects its own HubSpot portal in its own Beebizy workspace. OAuth now requests `crm.lists.read` in addition to the existing contact scopes. Existing installations need a one-time reconnect to grant that permission. The developer app update is build/deploy 3 in portal 247905640.

## Background work and recovery

Vercel Queues delivers `hubspot-event-registrations` messages to `api/hubspot-event-sync.ts`. Each tick reads up to 100 memberships, fetches current contact records, reuses the existing identity store, and inserts missing registrations. A cursor checkpoints larger lists. After a complete scan, another tick is scheduled 60 seconds later, independently of open browser tabs. No AI model is used.

Generation, sequence and lease checks prevent stale or overlapping jobs from writing registrations after the planner changes or pauses a source. Database uniqueness prevents repeated checks from duplicating event guests. Existing registrations, including cancelled records, custom answers, quantities and check-in history, are preserved. Removing a HubSpot list member does not delete their historical Beebizy registration. Only lists from the connected portal are selectable; event-scoped collaborators cannot access global integration routes.

Transient failures retry through the queue. Capacity failures, missing list permissions, deleted lists and conflicting contact identities surface on the event. The user can retry, change the list or pause automatic sync. Workspace contact sync and disconnect settings halt event processing. Authenticated status requests and the existing daily maintenance job recover abandoned queue chains with a new generation, so previously acknowledged idempotency keys cannot swallow resumed work.

Selected list, search and pagination drafts use existing device backup and revision-fenced private server recovery. Draft autosave never enables sync. Activation is an explicit action.

## Verification and rollout

The transaction-local PostgreSQL test `scripts/verify-hubspot-event-source.ts` passed 200 initial registrations, a duplicate replay, the 201st registrant, tenant/generation/lease/pause fences, preservation of cancelled/arrived/custom-answer records, and the existing production capacity trigger. Temporary tables are removed at commit or rollback. The additive Drizzle-generated migration 0100 was applied after confirming production history through 0099.

The type checker, linter, all 730 tests and build pass. Deployment `dpl_5VAT9RJNZhtxhUWWyQL4t94J45rn`, code `554dcbd`, is published at the existing Studio URL, `https://beebizy-studio-preview.vercel.app`. The preceding deployment is `dpl_4b7zVgLH3ygVDvSHYQAjCGDrJ1EB`. The public Carlin registration endpoint preserves her event settings and primary-attendee question audiences; the HubSpot health endpoint returns 200. The marketing website is separate and unchanged.

Live verification passed using approved synthetic data in company HubSpot portal `247905640` and workspace `ws_e9ee754f40224e8ca43d`. Active contact list `10`, `Beebizy Sync Demo ac1002af`, initially contained exactly 200 contacts matching the company marker `Beebizy Demo 2026-11-13 ac1002af`. The production queue worker imported all 200 into isolated draft event `evt_qa_hubauto_ac1002af`. No registration rows were manually inserted.

In the signed-in Chrome UI, Settings showed the connected account and active contact updates. The event's actual list picker loaded the 200-member list and successfully connected it. Jordan Morgan (Demo), contact `594983191248`, was then created through HubSpot's UI with `beebizy-demo-ac1002af-201@example.com`. The approved company marker was saved through Actions → View all properties → Company name, putting Jordan on the active test list. This simulates a new registration through list membership; it does not test a public HubSpot form submission.

Beebizy's open event updated automatically without refresh, another file upload, manual sync or selecting Jordan. Jordan's registration timestamp is `2026-11-14T04:16:46.975Z` (November 13 at 8:16 PM Pacific). Later repeated queue checks left 201 registrations for 201 distinct people, exactly one Jordan, no unrelated contacts and no last error. A continuous real screencast preserves the 200-to-201 change. The video shortens the wait and labels it explicitly.

Actual CSV and Excel downloads from Registrations each contain 201 data rows; CSV has 201 unique email addresses and one Jordan. Check-in search found Jordan, check-in only saved one arrival, and Undo restored zero checked-in people. No badge was printed, email sent, invitation sent or payment taken. Original captures, selected source ranges, narration and verification evidence are retained in `Downloads/Beebizy Demo Video/HubSpot Automatic Sync 200`. SCU still needs to authorize its own portal in its own workspace; this company test does not establish access to SCU data.

Native Vercel Schedules wrap queue payloads in a documented execution envelope. `parseHubSpotEventSourceMessage` now accepts either the app's direct job or that validated envelope, rejecting malformed wrappers. Initial test processing was recovered by the existing stale-source mechanism, which rotated the generation; normal worker ticks then continued automatically. The disposable schedule `qa-hubspot-event-sync` remains disabled. The consumer is intentionally private and returns 404 over public HTTP, as documented by Vercel.

Automatic approval review rejected exporting the full production environment for a queue test because it would expose unrelated secrets. Do not repeat that export. Use the normal authorized UI or narrowly scoped native platform tools for further checks.

## Sources

- [HubSpot list search](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/search-lists)
- [HubSpot list memberships](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/memberships/get-memberships)
- [Vercel Queues SDK](https://vercel.com/docs/queues/sdk)
- [Vercel Queues pricing and limits](https://vercel.com/docs/queues/pricing)
