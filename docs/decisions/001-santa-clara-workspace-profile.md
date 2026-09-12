# ADR-001: Use a reversible Santa Clara workspace profile

## Status

Accepted

## Date

2026-09-12

## Context

Santa Clara University needs a deliberately smaller Beebizy experience for its pilot. Deleting unrelated features would also remove them from other customers and make the pilot hard to reverse. Client-side navigation alone is insufficient because old bookmarks could still open hidden screens.

## Decision

The authenticated identity response includes a presentation-only workspace experience derived from the user's verified email domain. Santa Clara pilot domains receive the `santa-clara` experience. That experience filters the main navigation, command palette, event tabs, and application routes. Standard workspaces retain the existing experience.

The profile does not grant access and does not replace plan entitlement checks. It only narrows the product surface after normal authentication and authorization succeed.

## Alternatives considered

### Delete or comment out unrelated features

- Rejected because it would affect every workspace and make restoration risky.

### Deploy a separate Santa Clara application

- Rejected because two products would drift and fixes would need to be applied twice.

### Filter navigation only

- Rejected because hidden pages would remain reachable through bookmarks and pasted URLs.

## Consequences

- Santa Clara receives a focused product without a separate fork.
- Existing feature code and data remain intact.
- Old hidden-section URLs redirect back into the focused workflow.
- Adding another customer-specific profile requires an explicit profile and tests instead of scattered conditions.
- If the pilot expands beyond the current domains, the profile lookup should move from domain mapping to workspace-level configuration.
