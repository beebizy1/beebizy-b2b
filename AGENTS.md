# Beebizy project instructions

## Studio release continuity

- November 12 published release: stable Studio URL points to `dpl_HrdN3r9yWhHzfZJEktdXw2JvS5pz`, code commit `67d6d3f`. Keep this branch's earlier Carlin RSVP and HubSpot changes in future releases. The previous deployment is `dpl_HYYu6akXDqSMjatkkkBw5msXanYe`. Recheck actual deployment state before acting.
- Automatic HubSpot event sync has 717 passing tests, build/lint/type checks, temporary PostgreSQL 200/201-person checks, and public endpoint smoke checks. Browser access was unavailable: the real HubSpot list reconnect, end-to-end queue processing and new video are still pending. Do not claim a completed live demonstration. See `docs/hubspot-automatic-event-sync.md`.
- Drizzle migrations through 0100 are applied. The dirty `/Users/tarang/beebizy-founder-feedback` workspace contains unrelated unfinished SCU work and a conflicting pending migration; preserve it and incorporate this release before deploying from there. Never hand-edit generated migration metadata.
- Do not export all production environment variables for tests. Automatic approval review rejected that broad secret export. Use normal authorized UI or narrowly scoped native platform tools.

## Persistence is a product invariant

- Every new editable workflow must preserve unfinished work. Back up locally on every change and sync a revision-fenced draft to the server automatically.
- Persist the complete document, including custom objects, positions, ordering, dimensions, rotation, labels, uploads, and nested fields. Never save only the obvious text inputs.
- Show an honest state: saving, saved to Beebizy, device-only, or failed. Retry transient server failures and retain recovery data until the latest revision is confirmed remotely.
- Reloading, signing out, changing devices after sync, or losing power must not silently discard work. Add recovery and version history appropriate to the workflow.
- Never autosubmit consequential actions such as payments, publishing, invitations, emails, permission changes, or deletions. Those require an explicit user action.
- Add behavioral tests for full-field round trips, stale-response fencing, refresh recovery, and failure fallback whenever an editor is introduced or changed.
