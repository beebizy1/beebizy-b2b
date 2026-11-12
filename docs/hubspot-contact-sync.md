# HubSpot contacts and Beebizy event emails

## Planner workflow

1. In **Settings**, open **HubSpot contacts & event emails**. A workspace owner or admin chooses **Connect HubSpot** and authorizes their own organization's HubSpot account.
2. Choose **Turn on contact sync**. All contacts enter this workspace's address book. The progress is saved after each page, and an interrupted import can resume. Pausing preserves existing data.
3. Open an event, choose **Registrations**, then **Add HubSpot guests**. Search names, emails or companies, select contacts, and choose **Add guests**. Closing the picker saves unfinished selections privately; only the explicit Add action modifies registrations.
4. Selected contacts become pending invitations, visible in Registrations and Check-in. They are not checked in or confirmed. Use the existing invitation builder to preview and explicitly send event emails from Beebizy.

The separate **Registration updates to HubSpot** option controls outbound attendance and registration updates. Each event opts into that separately. It is not required to use the inbound address book.

The demo is clearly labelled and uses example.invalid sample contacts; it does not call HubSpot or send email.

## Data and recovery

Contacts use stable provider IDs, workspace boundaries and normalized email matching. Compound names, phone, company and HubSpot's global email opt-out are retained. Conflicting identities need review rather than a silent merge. Existing guest notes, custom answers, RSVP status and check-in state survive contact updates. Unsubscribed, archived or conflicted contacts are blocked from Beebizy invitation sends. Transactional confirmations for an explicit RSVP remain separate.

Signed webhooks enqueue changes before acknowledging delivery. Background workers retrieve current source records, apply source-version checks, and remove only the queue version actually processed. Duplicate deliveries and newer events arriving during processing are safe. Pausing invalidates worker writes. Deletions archive source records while retaining event history.

The Vercel Hobby configuration uses a 300-second function limit, bounded background work, persisted cursors and leases, and a daily recovery cron. Open Beebizy screens refresh from the server every 15 seconds, faster during imports. This is eventual synchronization, not a promise that updates cannot be delayed during provider outages. A later webhook, authenticated status request, manual resume, or daily maintenance recovers pending work.

The email sender configuration uses `hello@beebizy.com`. Production inbox delivery was not independently verified. Sync never sends an email by itself.

## Validation

- Type checking, lint, 705 automated tests and production build pass.
- Real PostgreSQL temporary-table checks cover mixed-case email matching, stable identity, duplicate deliveries, stale source versions, conflicting emails, custom answers, notes, attendance, archived history, workspace isolation and pause fencing.
- Queue checks prove an old delivery, old lease, different tenant or paused worker cannot clear a newer pending update.
- HMAC checks reject altered payloads, wrong URLs/secrets and replayed v3 signatures; authentic classic notifications are supported without downgrading invalid v3 requests.
- The HubSpot CLI validated all ten configured contact webhook subscriptions without errors or warnings.
- Additive migrations 0098 and 0099 are applied. The unrelated unfinished SCU migration in the main worktree must be regenerated after integrating this history.

## Live verification, November 11, 2026

- Stable Studio URL: https://beebizy-studio-preview.vercel.app. Current deployment `dpl_pG1pxNaVZkHxjpqGzxtwR8wG5ASs` runs code through `0485855` on `codex/hubspot-inbound-email-sync`. Prior deployment `dpl_98mq4W25Ud4waiQw3uQQqMQczL3J` is the immediate rollback.
- HubSpot project build 2/deploy 2 is active. The company connection imported its three existing contacts. A new, clearly labelled, email-free test contact was created through HubSpot's actual UI.
- HubSpot's original webhook requests were correctly rejected because Vercel preserved the original path with the internal `__path` rewrite parameter. Commit `8d735b2` reconstructs both supported rewrite forms before HMAC verification. The new regression failed before the fix and passed afterward. No signature verification was disabled.
- Real HubSpot name changes then appeared in Beebizy automatically, without a manual import. The source row's `last_seen_run_id` was null, demonstrating webhook ingestion rather than the earlier full scan. The persisted inbox drained to zero without an error.
- The browser picker saved a selection privately to Postgres, recovered it after refresh, and added exactly one pending event registration on explicit submission. Check-in showed the same guest as awaiting RSVP with zero arrivals. No invitation emails were sent.
- Another HubSpot name update preserved the existing registration's custom answer, private staff note, pending status, quantity and null check-in time.
- The test contact was moved to HubSpot's **restorable** recycle bin (90-day recovery). Its webhook archived the source row without deleting the event registration. Only the disposable test event, unused fake guest and archived test mirror were subsequently removed from Beebizy.
- The final company state is ready: three active mirrored contacts, zero queued events, no import/webhook errors. Carlin's four real registrations remained unchanged, and her public event API still exposes all four questions.
- A stale private-draft warning discovered during the audit is fixed in `0485855`. A successful server read now clears an earlier warning for an empty draft; existing conflict/failure recovery tests still pass. The final browser reload showed no stale recovery warning.
- The public test-event API was checked and did not expose the private selection draft or its HubSpot contact ID.

Evidence: `/private/tmp/beebizy-hubspot-picker-live.png`, `/private/tmp/beebizy-hubspot-live-verified.png`, and the Carlin evidence paths in `docs/carlin-registration-launch-audit.md`.

Carlin's separately verified registration release (`1972be9`, `65d15cb`) is included in this branch and must remain included in future deployments. Marketplace verification is still pending the independent customer pilots. A Clerk development-instance warning was observed in the browser; this task did not replace authentication credentials or migrate the existing sign-in instance.
