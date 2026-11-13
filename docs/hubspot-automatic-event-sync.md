# Automatic HubSpot event registration sync

November 12, 2026.

An owner or admin opens an event's Registrations section, selects a contact registration list from the connected HubSpot account, and explicitly connects it. Existing list members are imported as confirmed registrations. New members are discovered in background checks about every minute, subject to HubSpot's own list processing and provider availability. Each person has quantity one and remains unchecked-in. This does not send email, charge a card, or collect ticket revenue.

The organization connects its own HubSpot portal in its own Beebizy workspace. OAuth now requests `crm.lists.read` in addition to the existing contact scopes. Existing installations need a one-time reconnect to grant that permission. The developer app update is build/deploy 3 in portal 247905640.

## Background work and recovery

Vercel Queues delivers `hubspot-event-registrations` messages to `api/hubspot-event-sync.ts`. Each tick reads up to 100 memberships, fetches current contact records, reuses the existing identity store, and inserts missing registrations. A cursor checkpoints larger lists. After a complete scan, another tick is scheduled 60 seconds later, independently of open browser tabs. No AI model is used.

Generation, sequence and lease checks prevent stale or overlapping jobs from writing registrations after the planner changes or pauses a source. Database uniqueness prevents repeated checks from duplicating event guests. Existing registrations, including cancelled records, custom answers, quantities and check-in history, are preserved. Removing a HubSpot list member does not delete their historical Beebizy registration. Only lists from the connected portal are selectable; event-scoped collaborators cannot access global integration routes.

Transient failures retry through the queue. Capacity failures, missing list permissions, deleted lists and conflicting contact identities surface on the event. The user can retry, change the list or pause automatic sync. Workspace contact sync and disconnect settings halt event processing. Authenticated status requests and the existing daily maintenance job recover abandoned queue chains with a new generation, so previously acknowledged idempotency keys cannot swallow resumed work.

Selected list, search and pagination drafts use existing device backup and revision-fenced private server recovery. Draft autosave never enables sync. Activation is an explicit action.

## Verification and rollout

The transaction-local PostgreSQL test `scripts/verify-hubspot-event-source.ts` passed 200 initial registrations, a duplicate replay, the 201st registrant, tenant/generation/lease/pause fences, preservation of cancelled/arrived/custom-answer records, and the existing production capacity trigger. Temporary tables are removed at commit or rollback. The additive Drizzle-generated migration 0100 was applied after confirming production history through 0099.

The type checker, linter, all 717 tests and build pass. Deployment `dpl_HrdN3r9yWhHzfZJEktdXw2JvS5pz` is published at the existing Studio URL, `https://beebizy-studio-preview.vercel.app`. The previous deployment is `dpl_HYYu6akXDqSMjatkkkBw5msXanYe`. The public Carlin registration endpoint still returns the existing event time zone and one additional guest; the HubSpot health endpoint returns 200.

The live HubSpot list permission, end-to-end queue processing, browser workflow, and revised demonstration still require verification. Browser access was unavailable in this chat during implementation. A native Vercel one-time schedule was used to publish a harmless nonexistent-event queue message without exporting credentials; its execution telemetry reported unavailable, so this is not proof of processing. The schedule `qa-hubspot-event-sync` is disabled. The consumer is intentionally private and returns 404 over public HTTP, as documented by Vercel. Do not describe the live 200-person HubSpot demonstration as completed until it has actually been performed and captured.

Automatic approval review rejected exporting the full production environment for a queue test because it would expose unrelated secrets. Do not repeat that export. Use the normal authorized UI or narrowly scoped native platform tools for further checks.

## Sources

- [HubSpot list search](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/search-lists)
- [HubSpot list memberships](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/memberships/get-memberships)
- [Vercel Queues SDK](https://vercel.com/docs/queues/sdk)
- [Vercel Queues pricing and limits](https://vercel.com/docs/queues/pricing)
