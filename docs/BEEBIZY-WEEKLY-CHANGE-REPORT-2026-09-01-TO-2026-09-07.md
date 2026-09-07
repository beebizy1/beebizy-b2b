# Beebizy Weekly Change Report

**Reporting period:** September 1-7, 2026<br>
**Prepared:** September 7, 2026<br>
**Product:** Beebizy Studio<br>
**Repository:** `beebizy1/beebizy-b2b`<br>
**Working branch:** `Beebizy-test`<br>
**Stable preview:** <https://beebizy-studio-preview.vercel.app>

## Executive summary

This week moved Beebizy Studio from a broad event-management MVP toward a more complete event operations product. The largest changes were a reference-led interface rebuild, a conversational AI planner, richer spreadsheet imports, multi-room floorplans, guest segmentation, team access and invitations, task assignment notifications, and a stronger set of fundraising and operational screens.

The client feedback received this week is substantially implemented. The AI planner now proposes an editable checklist, run of show, mood board, and budget before anything is added to an event. It can use relevant completed events from the same workspace as planning evidence. CSV, Excel, and public Google Sheets can be reviewed and converted into events, including guests, services, vendors, budgets, and follow-up tasks. The floorplan starts as a blank space with drag-and-drop objects and now supports multiple rooms.

There is one design-direction conflict to resolve. The September 1 implementation removed true black in favor of warm espresso tones. The September 2 reference-design pass then intentionally changed the product to a yellow and ink-black palette. The current product therefore contains black. If the no-black request remains active, a new approved palette should replace the current reference palette.

## Week at a glance

| Measure | Result |
| --- | --- |
| Commits in the reporting period | 34 |
| Files changed | 114 |
| Reported source changes | 28,138 insertions and 1,419 deletions |
| Automated tests | 213 passing across 17 test files |
| TypeScript | Passing |
| ESLint | 0 errors and 4 existing Fast Refresh warnings |
| Production build | Passing |
| Preview deployment | Ready for the verified application commit |
| Marketing-site changes this week | None |

The source-change total includes generated Drizzle migration snapshots and document assets, so it should not be treated as a direct measure of handwritten application code.

## Client feedback and delivery status

| Client request | Status | What was delivered |
| --- | --- | --- |
| AI should suggest a checklist | Complete | The generated checklist is shown as a draft. Items can be edited, added, or removed before approval. |
| AI should suggest a mood board | Complete | Mood directions and palette colors are editable before they are written to an event. |
| AI should suggest a run of show | Complete | Timeline cues, timing, owners, and descriptions are editable before approval. |
| Planner should learn from past events | Complete with an important distinction | Relevant completed events in the same workspace are retrieved and supplied as planning evidence. This is retrieval-based learning, not permanent model fine-tuning. |
| Floorplan should be a blank drag-and-drop space | Complete | A blank gridded canvas accepts tables and venue objects through pointer drag-and-drop, click placement, and keyboard movement. |
| Support more than one room | Complete | Events can have multiple named floorplan rooms with tabs, add-room, and delete-room flows. |
| Remove black from the interface | Superseded by later reference direction | Black was removed on September 1, then restored as ink black during the September 2 reference-design alignment. The current UI uses black and yellow. |
| Upload an existing Excel or Google Sheet and create an event | Complete | CSV, `.xlsx`, and public Google Sheets are parsed into a review screen before event creation. Import now recognizes mixed layouts, services, vendors, guests, budgets, schedules, and checklists. |

## Changes completed this week

### 1. Product shell and reference-design rebuild

- Rebuilt the authenticated Studio shell around a 256-pixel white sidebar and destination-based navigation.
- Expanded the navigation to cover the operating areas shown in the product reference, including dashboard, events, calendar, tasks, vendor hub, reports, messages, templates, team, and settings.
- Rebuilt the Events index as a searchable table with filters and grouping.
- Expanded the event workspace to 17 functional destinations.
- Added or substantially rebuilt Analytics, Fundraising, Live Auction presenter, RFP, Deposits, Locations, Registrations, Ticket Sales, and Post-Event Summary screens.
- Removed a misleading hard-coded dashboard revenue example and made financial summaries depend on real event data.
- Made dashboard metric cards open the page containing the records they count.
- Made the dashboard's “Group events by” setting actually group events by venue, category, or status.
- Kept completed checklist items visible with a struck-through treatment and added a control to hide them when needed.
- Added inline guest creation and registration from the event guest workflow.
- Added task-owner capture during checklist creation and spreadsheet import.

### 2. Conversational AI planner

- Replaced the form-only experience with an interview that asks one useful question at a time.
- Kept the expert form available for people who prefer direct entry.
- Added support for answers containing several details at once so the planner does not repeat questions it already has enough information to answer.
- Made the planner interpret short numeric replies in the context of the last question, including a bare budget amount.
- Expanded event-type recognition to include dinners, awards programs, expos, seminars, holiday parties, openings, and the client's own wording when no predefined category fits.
- Improved the interview prompt so it can handle uncertainty, preserve known answers, and avoid repetitive questioning.
- Improved plan-generation guidance so checklists are sequenced by when work should begin, run-of-show drafts include load-in and strike, and vendor claims are not invented.
- Added stronger structured-output normalization so a partially malformed model response does not discard the entire plan.
- Kept the budget, checklist, run of show, mood board, and vendor suggestions behind explicit section-by-section approval.
- Preserved deterministic fallback planning so the workflow remains usable when a model provider is unavailable.

### 3. Learning from completed events

- Added workspace-scoped retrieval of similar completed events.
- Prioritized evidence by event category, capacity similarity, and recency.
- Used actual budget results to guide new budget allocations while keeping the requested total exact.
- Reused proven checklist and run-of-show patterns, shifted to fit the new event timing.
- Included mood-board and floorplan signals in the planning evidence packet.
- Displayed which past events influenced a proposal.
- Kept client data isolated to its own workspace.

This approach gives Beebizy useful learning immediately without training a separate model on private event records. It is easier to audit, update, and remove than fine-tuning. A later fine-tuning or evaluation program would require a larger, consented, quality-labeled dataset and a defined privacy policy.

### 4. Spreadsheet and Google Sheets import

- Added CSV, multi-sheet Excel, and public Google Sheets import.
- Added a review-before-create flow so the client can correct event details and remove unwanted records.
- Classified generically named tabs by their column headers instead of relying only on sheet names.
- Avoided dangerous guesses when classifications tie and surfaced a warning instead.
- Added support for wide sheets that mix event details with lists of services.
- Used the uploaded document name as the event name when the sheet does not provide a better one.
- Imported services and vendors into the workspace directory and created event bookings.
- Mapped agreed vendor fees into the event budget.
- Created a follow-up checklist item for each imported service, with category mapping and duplicate prevention.
- Reported the names of ignored sheets so the client can see what was not imported.
- Preserved authenticated workspace routing, timeouts, response-size limits, and review approval before writes.

### 5. Guests and floorplans

- Added an event-specific segment to each guest.
- Added guest-list filtering and segment breakdowns.
- Added organization as a separate guest field so company or affiliation is not confused with invitation segment.
- Added organization summaries within the selected segment.
- Saved guest organization edits on blur.
- Converted floorplans from one layout per event to multiple named rooms.
- Added room tabs plus add-room and delete-room workflows.
- Preserved existing floorplan data through the schema migration.
- Allowed the last room to be deleted, returning the event to a clean add-room empty state.
- Updated planner learning to read layout evidence from all rooms.

### 6. Team access, roles, and invitations

- Added a team settings area that lists workspace members and their roles.
- Allowed workspace owners to change roles or remove members.
- Protected the final workspace owner from removal or demotion.
- Kept membership controls read-only for non-owners.
- Added invitation by email with the intended role.
- Made the invitation database record grant access and determine the invited person's workspace and role.
- Ensured re-inviting a pending email updates its role rather than creating duplicate live invitations.
- Fixed invite claiming so it happens before an existing fallback workspace is selected.
- Preserved the invited membership after the claim completes.
- Moved access decisions to the server and required a verified email before access is granted.
- Connected Clerk invitation emails so an invited person receives a sign-in link.
- Made invitation cancellation revoke the associated Clerk link.

### 7. Tasks, vendors, and communications

- Added task assignment using members from the current workspace.
- Stored the assignee email separately so assignments remain reliable even when display names change.
- Sent an assignment notification only when the assignee address changes.
- Included the task, due date, event, and link in the notification.
- Kept task assignment successful even if the email provider is unavailable, with the skipped delivery recorded for operations.
- Added a vendor-first path from Messages so a user can select a vendor and begin a conversation.
- Routed the no-vendor empty state to the vendor-creation flow.

### 8. AI provider and reliability work

- Centralized planner model selection behind a provider abstraction.
- Added direct Anthropic support to avoid depending only on the Vercel AI Gateway.
- Added Google Flash free tier as a temporary fallback when the paid provider was not configured.
- Documented that the free tier is a stopgap and should not be used for real client data without an approved data-handling decision.
- Used lower reasoning effort for interview turns and more reasoning for final plan generation.
- Sanitized database failures so clients do not see raw SQL or internal schema details.
- Returned a friendly conflict response for recognized duplicate records.
- Logged unexpected internal failures on the server while returning a safe client message.
- Clarified in Settings that the currency preference changes symbols and number formatting only. It does not convert stored amounts or exchange rates.

## Data and schema changes

Four database migrations support this week's product work:

| Migration | Purpose |
| --- | --- |
| `0005` | Adds floorplan room identity and guest segments while preserving existing layouts. |
| `0006` | Separates guest organization from guest segment. |
| `0007` | Adds checklist assignee email for reliable team assignment and notification. |
| `0008` | Adds workspace invitations and their role, status, and claim lifecycle. |

The migrations are committed to the branch. This documentation pass did not independently verify that every migration has been applied to the target hosted database, so that should be confirmed before onboarding additional clients.

## Current design direction

The current application uses the later September 2 reference palette:

- Yellow for primary brand and action surfaces
- Ink black for navigation, typography, and high-contrast controls
- Green for completed or ready states
- Red for outstanding or risk states
- White and light neutrals for work surfaces

This replaced the short-lived warm espresso, no-black treatment introduced on September 1. The team should choose one final direction before the next visual polish pass so the code and client expectation do not drift again.

## Verification and deployment status

The final weekly code state was verified on September 7, 2026:

- `npm run typecheck`: passed
- `npm run lint`: passed with 0 errors and 4 existing Fast Refresh warnings
- `npm test`: 213 tests passed across 17 files
- `npm run build`: passed
- Vercel stable preview: Ready for the verified application commit
- Stable preview URL: <https://beebizy-studio-preview.vercel.app>
- Verified application commit: `25655ac79276b16a1329f6321a82193062979cac`
- Preview branch: synchronized with `origin/Beebizy-test`

The documentation-only commit containing this report may trigger a newer preview deployment without application code changes.

The build still reports non-blocking source-map warnings from generated Radix UI modules and a large JavaScript bundle warning. These do not currently block the preview, but bundle splitting should be addressed before a broader launch.

The working branch is 66 commits ahead of and 3 commits behind `origin/main`. It should be reconciled with `main` through a reviewed merge or pull request rather than assumed to be release-ready solely because the preview is green.

## Decisions and tradeoffs recorded this week

### Editable AI drafts instead of automatic writes

Generated work stays in a review layer until the user approves it. This adds one step, but it protects live event data and gives the client control over operational details.

### Retrieval-based learning instead of fine-tuning

Beebizy retrieves relevant completed events from the current workspace and supplies them as evidence for each plan. This is more transparent and easier to keep current than fine-tuning. It also avoids mixing one client's event history into another client's planning context.

### Review-before-create imports

Spreadsheet import does not immediately write every inferred row. Users can correct core event information, inspect record counts, remove unwanted rows, and see ignored sheets before creation. This reduces the risk of a malformed workbook creating an unusable event.

### Access remains database-backed even when email delivery fails

The workspace invitation is the source of access. Clerk provides the sign-in email and link, but a delivery problem does not corrupt the invitation record or the intended role.

### Temporary AI provider fallback

Google Flash free tier was added to keep development moving when paid-provider configuration was unavailable. It is not the preferred production configuration for real client information. Direct Anthropic should be configured and validated before client onboarding.

## Remaining follow-up

1. Resolve the palette decision: keep the current reference-led black and yellow system, or approve a replacement with no black.
2. Confirm migrations `0005` through `0008` are applied to the hosted database used by the preview.
3. Configure and validate the preferred Anthropic workspace for client data, then remove or disable the temporary Google free-tier fallback in production.
4. Test team invitation delivery and claim behavior end to end using a real external email address in the intended Clerk production environment.
5. Reconcile `Beebizy-test` with `origin/main` and perform a reviewed release merge.
6. Split the largest JavaScript bundle and clear the remaining Fast Refresh and source-map warnings.
7. Run structured client acceptance tests on planner editing, spreadsheet import, team invitations, and multi-room floorplans using real event data.

## Commit appendix

### September 6

- `25655ac` Say what the currency setting actually does
- `edf9201` Email an invited person a link to sign in

### September 5

- `7e94e9b` Make the dashboard numbers open the thing they count
- `207ad95` Stop showing people the SQL that failed
- `26e4cc9` Make the generated plan survive contact with the model
- `7f1bbdf` Give the planner prompts something to work with
- `ca0abbd` Add Google's free tier as a stand-in model
- `965d9f5` Understand a budget typed as a plain number
- `e65ae09` Make “Group events by” actually group events
- `56c031e` Keep an invited member in after their invite is claimed
- `e4986dc` Claim an invite before falling back to an existing workspace
- `9360d4b` Let the server decide who has access
- `b2047a3` Start a vendor conversation from the inbox
- `94de815` Add a team member by email, with the role they should get

### September 4

- `103f607` Notify a teammate when a task becomes theirs
- `4dae9c9` Let an owner see and change who has access
- `e7befbe` Record which organization a guest represents
- `e2c2c31` Let the last room be deleted
- `836dc41` Segment a guest list, and give an event more than one room
- `c02d4fa` Require a verified email before granting access
- `6835642` Call Claude directly rather than through the gateway

### September 3

- `754de5d` Believe what the planner is told about the event
- `bc323a7` Import a wide sheet that mixes event details with a list of services
- `19e109a` Classify an imported sheet by its columns when its name says nothing
- `27385a5` Turn each imported service into a checklist task

### September 2

- `1ec34e4` Make the AI planner a conversation rather than a form
- `c4949f4` Import services and vendors, and name any sheet that was ignored
- `c5ddeae` Replace the brown palette, green the completion signals, own every task
- `8b9b9ed` Provision and seed a workspace for a user who has never signed in
- `b9dcbf9` Add a reversible demo-content seed for live workspaces
- `8635e4f` Keep completed tasks on the checklist, and let a guest be created inline
- `f600037` Rebuild the product screens against the reference design
- `d51bf24` Match the Studio shell and data layer to the reference design

### September 1

- `67d511f` Add learned planning and spreadsheet imports

## Scope note

This report covers commits made in `beebizy-b2b` from September 1 through September 7, 2026. No commits were made in `beebizy-landing` during this reporting period. The report describes code and verification evidence available in the repositories and deployment metadata; it does not claim that every hosted database migration, external email delivery, or real-client workflow has been independently acceptance-tested.
