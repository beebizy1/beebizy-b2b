# Beebizy P0 and V1 Core Completion

## Status

**Feature status:** Complete and packaged for isolated preview verification<br>
**Deployment target:** Separate Vercel preview, not the `beebizy.com` custom domain<br>
**Verification date:** August 27, 2026<br>
**Product goal:** Beebizy is the event system of record for lean teams.

This document records the completed P0 and V1 Core scope. It separates functional
completion from the remaining rollout work required before design partners use the
product for live events.

## Completed V1 Core

### 1. Run-of-show builder

Organizers can build and maintain an event timeline with:

- Start time and duration
- Cue title and description
- Responsible owner
- Stable display order
- Create, update, and delete workflows
- Time-zone-aware display

Every run-of-show change is written to structured event history. The stored snapshots
preserve timing patterns, ownership, and event context for future analysis by event
type.

### 2. Multi-location calendar

Organizers can review events in list and calendar views across saved venues. The
calendar supports:

- Events connected to structured venue records
- Venue names and event times on calendar entries
- Filtering to one venue or all venues
- Events without an assigned venue
- Event dates, categories, status, capacity, and location context

This supports analysis of event frequency and event type by location without relying
on free-text venue names.

### 3. Budget management

Each event has planned-versus-actual budget management with:

- Expense and revenue lines
- Categories and notes
- Estimated and actual amounts
- Automatic variance calculations
- Event and portfolio-level financial summaries
- Create, update, and delete workflows

Money is stored as integer cents to prevent floating-point and string-comparison errors.
Budget history preserves before-and-after values for reporting by category and event
type.

### 4. Historical data tracking

Historical tracking is the shared learning layer for the product. It is implemented as
an append-only `event_history` model containing:

- Workspace, event, actor, resource, and resource identifier
- Created, updated, or deleted action
- Human-readable summary
- Structured `before` and `after` JSON snapshots
- Creation timestamp

The history layer currently records decisions for:

- Events
- Run-of-show cues
- Budgets
- Vendor bookings
- Checklists
- Menus
- Mood boards
- Ticket types
- Auctions
- Sponsorships
- Raffles
- Floorplans

Existing event, run-of-show, budget, vendor, and floorplan data is backfilled into the
same history model. Indexes support event timelines and future cross-event learning by
resource type.

### 5. Floorplan builder

Organizers can create and save venue layouts using typed floorplan elements:

- Round tables
- Long tables
- Stages
- Bars
- Entrances
- Dance floors
- Booths
- AV areas

Elements store labels, seat counts, and positions as percentages of the room dimensions,
so plans remain readable across screen sizes. Floorplan history is associated with the
event's venue, capacity, and active guest count. This creates the data needed for future
layout suggestions by venue and guest count.

## System-of-record behavior

Authenticated users operate against the live HTTP API and PostgreSQL database. Their
work is persistent and scoped to a workspace. The server enforces workspace isolation,
so one workspace cannot read or modify another workspace's events or history.

The public product demo is intentionally different:

- It uses a session-scoped in-memory dataset.
- It is visibly labeled as demo data.
- Demo writes disappear when the session ends.
- It never reads or writes an authenticated workspace.

This boundary lets prospects explore every workflow without putting production data at
risk while design partners use persistent workspaces after signing in.

## Verification evidence

### Preview browser verification

The P0 end-to-end browser coverage and release check verify:

- Every product call-to-action enters through Clerk sign-in
- Public sign-up is unavailable and unapproved users receive a branded denial page
- Multi-location calendar display and venue filtering
- A real run-of-show write
- A real planned-versus-actual budget write and variance calculation
- A floorplan element addition and save
- Run-of-show, budget, and floorplan changes appearing in planning history
- No browser console errors during the tested workflows

Test source: [`tests/e2e_p0.py`](../tests/e2e_p0.py)

### API verification

The real API verification for the P0 core verified:

- Missing and forged tokens are rejected
- First-time users receive personal workspaces
- Events, venues, checklists, run-of-show cues, budgets, vendors, and floorplans persist
- Structured history contains event, run-of-show, budget, vendor, and floorplan records
- Portfolio analytics reflect persisted data
- Workspace isolation prevents cross-tenant reads and writes
- Public share links expose only the intended event, agenda, tickets, and time-zone data

Test source: [`scripts/verify-api.ts`](../scripts/verify-api.ts)

### Repository quality gate

`npm run verify` completed successfully:

- TypeScript typecheck passed
- ESLint completed with zero errors
- 115 automated tests passed
- Production build completed

Four Fast Refresh lint warnings and non-blocking source-map and bundle-size build warnings
remain. They do not block the P0 workflows or production build.

## Design-partner acceptance gate

No features below V1 Core should begin until the current design partners have used the
completed workflows for real events.

Target design partners:

- Eleventy Milano
- Campbell Hall

V1 Core should be considered adopted when:

1. Each partner has a working account and workspace access.
2. At least one real event is created for each partner.
3. The run of show, venue calendar, budget, and floorplan are used during planning.
4. The history timeline contains decisions from real organizers.
5. Feedback is recorded against agreed test cases.
6. Blocking usability or data-integrity issues are resolved.

## Remaining rollout dependencies

These items do not represent missing V1 Core features, but they must be completed before
calling the rollout fully production-ready:

1. **Production authentication DNS:** Clerk production keys are configured in the correct
   Vercel project, but Clerk's four DNS records for `beebizy.com` still require access to
   the GoDaddy account that owns the domain. Until verification, Clerk displays
   "Development mode" and development-instance limits apply.
2. **Design-partner access:** Invite the named partner users and confirm their roles.
3. **Real-event acceptance:** Complete the design-partner acceptance gate above.

## Scope boundary

The Beebizy marketplace at `app.beebizy.com` is separate and remains unchanged. This P0
and V1 Core completion record applies only to the private B2B beta at
`beebizy-studio-preview.vercel.app`; it does not deploy or attach anything to `beebizy.com`.
