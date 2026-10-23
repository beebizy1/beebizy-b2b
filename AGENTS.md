# Beebizy project instructions

## Persistence is a product invariant

- Every new editable workflow must preserve unfinished work. Back up locally on every change and sync a revision-fenced draft to the server automatically.
- Persist the complete document, including custom objects, positions, ordering, dimensions, rotation, labels, uploads, and nested fields. Never save only the obvious text inputs.
- Show an honest state: saving, saved to Beebizy, device-only, or failed. Retry transient server failures and retain recovery data until the latest revision is confirmed remotely.
- Reloading, signing out, changing devices after sync, or losing power must not silently discard work. Add recovery and version history appropriate to the workflow.
- Never autosubmit consequential actions such as payments, publishing, invitations, emails, permission changes, or deletions. Those require an explicit user action.
- Add behavioral tests for full-field round trips, stale-response fencing, refresh recovery, and failure fallback whenever an editor is introduced or changed.
