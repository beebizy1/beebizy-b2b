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

- Type checking, lint, 704 automated tests and production build pass.
- Real PostgreSQL temporary-table checks cover mixed-case email matching, stable identity, duplicate deliveries, stale source versions, conflicting emails, custom answers, notes, attendance, archived history, workspace isolation and pause fencing.
- Queue checks prove an old delivery, old lease, different tenant or paused worker cannot clear a newer pending update.
- HMAC checks reject altered payloads, wrong URLs/secrets and replayed v3 signatures; authentic classic notifications are supported without downgrading invalid v3 requests.
- The HubSpot CLI validated all ten configured contact webhook subscriptions without errors or warnings.
- Additive migrations 0098 and 0099 are applied. The unrelated unfinished SCU migration in the main worktree must be regenerated after integrating this history.

Live release and browser results will be recorded after deployment. Carlin's separately verified registration release (`1972be9`, `65d15cb`) is included in this branch and must remain included in future deployments.
