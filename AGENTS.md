# Beebizy project instructions

## Studio release continuity

- November 13 published release: stable Studio URL points to `dpl_5VAT9RJNZhtxhUWWyQL4t94J45rn`, code `554dcbd` on `codex/hubspot-sync-proof`. It preserves the preceding Carlin and HubSpot releases and accepts documented native Vercel schedule envelopes. All 730 tests, type checking, lint and build pass. Previous deployment: `dpl_4b7zVgLH3ygVDvSHYQAjCGDrJ1EB` (`07032a6`). No migration. Recheck actual deployment state before acting; preserve all preceding changes.
- Real HubSpot UI and production worker proof passed November 13: portal `247905640`, active test list `10`, isolated event `evt_qa_hubauto_ac1002af`. It imported 200 synthetic contacts, then Jordan `594983191248` appeared automatically as person 201 without refreshing or manually syncing. Repeated background checks leave 201 registrations for 201 unique people, one Jordan, no unrelated contacts and no sync error. Actual UI CSV/Excel exports have 201 rows. Check-in only succeeded and was undone; no badge was printed. This simulates a new registration by creating a contact and matching its test-list rule, not by submitting a public HubSpot form. Genuine screencasts and the editable video are under `Downloads/Beebizy Demo Video/HubSpot Automatic Sync 200`. Rendering status is recorded there. See `docs/hubspot-automatic-event-sync.md`.
- Carlin's four RSVP questions remain primary-attendee-only; companions enter names and optional email. Her four actual registrations were preserved. See `docs/rsvp-additional-guests.md`. The company demonstration does not verify SCU's separate HubSpot account; SCU must connect its portal in its own workspace.
- Drizzle migrations through 0100 are applied. The dirty `/Users/tarang/beebizy-founder-feedback` workspace contains unrelated unfinished SCU work and a conflicting pending migration; preserve it and incorporate this release before deploying from there. Never hand-edit generated migration metadata.
- Do not export all production environment variables for tests. Automatic approval review rejected that broad secret export. Use normal authorized UI or narrowly scoped native platform tools.

## Persistence is a product invariant

- Every new editable workflow must preserve unfinished work. Back up locally on every change and sync a revision-fenced draft to the server automatically.
- Persist the complete document, including custom objects, positions, ordering, dimensions, rotation, labels, uploads, and nested fields. Never save only the obvious text inputs.
- Show an honest state: saving, saved to Beebizy, device-only, or failed. Retry transient server failures and retain recovery data until the latest revision is confirmed remotely.
- Reloading, signing out, changing devices after sync, or losing power must not silently discard work. Add recovery and version history appropriate to the workflow.
- Never autosubmit consequential actions such as payments, publishing, invitations, emails, permission changes, or deletions. Those require an explicit user action.
- Add behavioral tests for full-field round trips, stale-response fencing, refresh recovery, and failure fallback whenever an editor is introduced or changed.
