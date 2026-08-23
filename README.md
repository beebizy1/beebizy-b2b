# Beebizy

Event operations for teams that run events but aren't event companies — corporate ops,
lean startups, nonprofits. Plan the event, staff it with vendors, sell tickets and
fundraise, then report on what it cost and what came back.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No credentials are needed for the public product demo. A demo CTA starts an isolated,
session-scoped in-memory workspace seeded with a realistic portfolio — an event six days
out with unconfirmed catering, a gala with live fundraising, two completed events, and a
cancelled roadshow. Every screen and write works, a banner says the data is temporary,
and **Exit demo** clears the demo session before opening sign-in. The demo never reads or
writes a signed-in workspace.

**Sign-in is Clerk**, provisioned through the Vercel Marketplace:

```bash
vercel integration add clerk    # writes the keys into every environment
vercel env pull --yes           # and into .env.local for local dev
```

With a Clerk publishable key present, normal `/app` visits require a session and `/login`
renders Clerk's own widget (Google, email, MFA, password reset). The landing-page demo
CTA deliberately opens the isolated demo workspace described above. Without Clerk, the
whole app falls back to that demo session so local development remains credential-free.

Persistence is the separate half and is **not** wired yet — see *Firebase* below.

```bash
npm run verify       # typecheck + lint + test + build, the same as CI
npm run typecheck
npm run lint
npm run test
npm run build
```

## How it's put together

```
src/
  data/          the only thing that talks to storage
    entities.ts    domain model — money in cents, dates as ISO strings
    adapter.ts     the DataAdapter interface every backend implements
    derive.ts      pure functions: event health, risks, the attention worklist
    money.ts       integer-cent money, parsing and formatting
    hooks.ts       react-query surface used by screens
    memory/        in-memory adapter + demo seed
  app/           providers and chrome — session, theme, shell, command palette
  screens/       one folder per destination
  components/
    primitives.tsx shared vocabulary: PageHeader, StatTile, Meter, Pill, EmptyState…
    ui/            shadcn primitives
  pages/         marketing pages, plus Clerk's sign-in and sign-up
```

**Screens never import a backend.** They call `useData()` and get whatever adapter the
environment resolved. That is what makes "run the whole product with no credentials"
and "run it against Firestore" the same code path, and why the adapter can be swapped
in a test.

**Aggregates live behind the adapter.** Asking `analytics.portfolio()` or
`analytics.health()` for an answer lets each backend fetch it efficiently — the memory
adapter computes it locally, and a Firestore adapter can use one collection-group query
per subcollection regardless of how many events exist. The previous build issued one
query per event to sum budget lines.

**Money is integer cents everywhere.** The legacy Firestore documents stored money as
strings on tickets, auctions and sponsorships but as numbers on budget items, so `"90"
> "100"` was true and every total went through `parseFloat`. `money.ts` converts at the
adapter boundary; nothing above the data layer sees a money string.

**Derived state is computed, not stored.** Event readiness and the "needs you" list come
from `derive.ts` — pure, no I/O, unit tested — so they cannot drift out of sync with the
records they summarise.

## Navigation

Six destinations, not fourteen:

| Where | What it answers |
| --- | --- |
| Today | What needs a decision right now, ranked, linking to the fix |
| Events | Every event, its readiness, and anything wrong with it |
| People | Attendees and the events each is registered for |
| Vendors | Suppliers, bookings and conversations |
| Money | Ticket sales, budgets, fundraising |
| Library | Templates and venues |

Each event opens a workspace with six sections — Overview, Plan, People, Suppliers,
Money, Share — replacing the fourteen tabs that used to compete for one row.

`⌘K` searches every event and jumps to any section.

## Public pages

Sharing is off by default. Turning it on for an event mints one token and exposes two
guest URLs:

- `/e/:token` — title, description, when, where, capacity, run of show
- `/e/:token/tickets` — checkout for ticket types on sale

Budgets, vendor fees, the guest list, attendee contacts, sponsorship amounts and
auction bids are never on a public page. The Share section states this before you send
the link.

## Firebase

Firebase is now **database only** — Clerk replaced Firebase Auth, so `src/lib/firebase.ts`
exists for a future Firestore adapter and nothing else. `firestore.rules` and
`storage.rules` are deployed with the Firebase CLI. Three things to know before running
against a real project:

- **The Firestore adapter is not written.** Setting the env vars does not switch the app
  off demo data by itself; `DataProvider` still resolves to the in-memory adapter.

- **`firestore.indexes.json` is empty.** Composite indexes need to be added for the
  filtered-and-ordered queries a Firestore adapter will issue, or those reads fail at
  runtime with `failed-precondition`.
- **Share tokens are not verified by the rules.** `allow read: if
  resource.data.shareToken != null` lets anyone read *any* share-enabled event, so the
  token gates nothing. Fixing it properly means mirroring public event data into a
  `publicEvents/{shareToken}` document and reading that instead — a schema change, not a
  rules tweak.

## Conventions

- Semantic tokens only in screens (`bg-surface`, `text-muted-foreground`,
  `border-hairline`). No `bg-white`, no `text-gray-400` — that is what broke dark mode.
- User preferences persist server-side against the user, never in localStorage, so they
  follow the person rather than the browser.
- Error surfaces show the actual message. "Something went wrong" makes a permission
  failure indistinguishable from a missing index.
- Numbers use `data-numeric` (tabular figures) so they don't jitter as they change.
