# Beebizy

Event operations for teams that run events but aren't event companies — corporate ops,
lean startups, nonprofits. Plan the event, staff it with vendors, sell tickets and
fundraise, then report on what it cost and what came back.

The completed P0 and V1 Core scope, verification evidence, and rollout dependencies are
recorded in [`docs/P0-V1-COMPLETION.md`](docs/P0-V1-COMPLETION.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Local development without Clerk needs no credentials. In that environment the product
uses an isolated, session-scoped in-memory workspace seeded with a realistic portfolio.
Every screen and write works, a banner says the data is temporary, and the demo never
reads or writes a signed-in workspace.

**Sign-in is Clerk**, provisioned through the Vercel Marketplace:

```bash
vercel integration add clerk    # writes the keys into every environment
vercel env pull --yes           # and into .env.local for local dev
```

With a Clerk publishable key present, normal `/app` visits require a session and `/login`
renders Clerk's own widget (Google, email, MFA, password reset). Landing-page product
CTAs enter through that sign-in route. Without Clerk, the whole app falls back to the
demo session described above so local development remains credential-free.

Authenticated workspaces use the HTTP adapter backed by PostgreSQL. Demo sessions use a
separate in-memory adapter and never read or write production data.

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
    entities.ts    persisted domain model — money in cents, dates as ISO strings
    planner.ts     planning-proposal model, deterministic budgets and safe fallback
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
  pages/         marketing pages, plus Clerk sign-in and access-denied routes
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

Seven focused destinations:

| Where | What it answers |
| --- | --- |
| Dashboard | What needs a decision right now, ranked, linking to the fix |
| Calendar | Month and year view across events and venues |
| Events | Every event, its readiness, and anything wrong with it |
| Guests | Attendees and the events each is invited or registered for |
| Vendors | Suppliers, bookings and conversations |
| Budget | Ticket sales, budgets, fundraising and reporting |
| Library | Templates and venues |

Each event opens a workspace with six sections: Overview, Plan, Invites, Vendors,
Budget, and Share. Plan contains the AI budget, checklist, run-of-show, mood-board,
and marketplace-suggestion builders.

`⌘K` searches every event and jumps to any section.

## Public pages

Sharing is off by default. Turning it on for an event mints one token and exposes two
guest URLs:

- `/e/:token` — title, description, when, where, capacity, run of show
- `/e/:token/tickets` — checkout for ticket types on sale

Budgets, vendor fees, the guest list, attendee contacts, sponsorship amounts and
auction bids are never on a public page. The Share section states this before you send
the link.

## Persistence

Approved signed-in users use `src/data/http/adapter.ts`, the Vercel API router, and
PostgreSQL repositories under `src/server/`. An approved first-time user receives a
personal workspace, and every request is scoped to that workspace. Event planning
decisions are also written to the append-only `event_history` table as structured
before-and-after snapshots.

The beta app is restricted to `https://beebizy-studio-preview.vercel.app`. The three
Beebizy operators are always approved. Additional testers are invited without a code
change by adding the same comma-separated emails to `BETA_ACCESS_EMAILS` and
`VITE_BETA_ACCESS_EMAILS` in the Vercel Preview environment. Each new workspace starts
with three free months; expired, past-due, and cancelled access states are enforced by
the API and shown explicitly in the app.

The in-memory adapter remains the intentional public demo backend. Its writes are
session-scoped and are never mixed with authenticated workspaces.

## Conventions

- Semantic tokens only in screens (`bg-surface`, `text-muted-foreground`,
  `border-hairline`). No `bg-white`, no `text-gray-400` — that is what broke dark mode.
- User preferences persist server-side against the user, never in localStorage, so they
  follow the person rather than the browser.
- Error surfaces show the actual message. "Something went wrong" makes a permission
  failure indistinguishable from a missing index.
- Numbers use `data-numeric` (tabular figures) so they don't jitter as they change.
