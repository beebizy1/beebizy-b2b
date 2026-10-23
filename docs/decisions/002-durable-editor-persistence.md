# ADR-002: Make durable autosave mandatory for every editor

## Status

Accepted

## Date

2026-10-16

## Context

Beebizy is used while events are being planned and operated. A browser refresh, sign-out, temporary connection failure, device shutdown, or dead battery must not silently erase planning work. Protecting only one surface, such as the floor plan or Run of Show, leaves the same data-loss risk in the next editor that is added.

An editor includes any screen where a user builds or revises a document over time: floor plans, schedules, invitation designs, auction content, reports, custom layouts, lists, and future planning tools. A single save button is not sufficient protection for these workflows.

## Decision

Durable autosave is a product invariant for every new editor and for existing editors when they are materially changed.

Each editor must:

1. Write the complete current draft to browser storage on every change, before any debounce used for network traffic.
2. Sync the complete draft to Beebizy automatically. The draft includes nested and custom data such as positions, ordering, size, rotation, labels, uploaded-asset references, custom points, and mode settings.
3. Fence writes with a client revision or equivalent idempotency mechanism so an older delayed request cannot replace newer work.
4. Retain the local recovery copy until the newest revision is confirmed by the server.
5. Retry transient server failures with bounded backoff while clearly showing whether work is saved to Beebizy or only on the current device.
6. Restore unfinished work after refresh or sign-in. When automatically merging would be unsafe, offer recovery as a separate copy rather than overwriting the server version.
7. Keep server-side version history or an audit trail sufficient to recover an earlier committed version.
8. Test full-field round trips, rapid edits, stale responses, refresh during editing, network failure, and local-storage failure.

The interface must use truthful states such as "Saving", "Saved to Beebizy", "Saved on this device", and "Save failed". It must never show a successful state before the server confirms the matching revision.

Consequential actions are excluded from autosubmission. Sending invitations or emails, publishing, charging payments, changing permissions, and deleting data still require an explicit user action. Autosave may preserve the unfinished form for those actions, but it must not perform the action itself.

## Limits

No browser application can transmit a change after power and network access are both gone. Immediate device backup protects that interval. Clearing all browser site data can remove a device-only recovery copy, but it cannot remove a revision already synced to Beebizy. The product must explain this distinction instead of promising impossible guarantees.

## Consequences

- Future editors follow one persistence standard instead of inventing save behavior per screen.
- Custom and nested fields receive the same protection as ordinary text inputs.
- Users can distinguish a remote save from a device-only backup.
- Recovery and conflict behavior become acceptance criteria, not optional polish.
- Irreversible or externally visible actions remain intentional and auditable.
