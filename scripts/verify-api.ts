/**
 * End-to-end check of the real API with real Clerk tokens.
 *
 * A browser can't do this: Clerk's bot protection (Turnstile) correctly blocks headless
 * sign-up, and disabling it to make a test pass would be the wrong trade. So this mints
 * genuine sessions through Clerk's Backend API for two throwaway users and drives the HTTP
 * surface as they would.
 *
 * What it proves that the in-process tests can't:
 *   - the token is verified server-side, and a forged or missing one is refused;
 *   - a first-time user gets a workspace bootstrapped;
 *   - writes persist across requests — the thing the in-memory store could never do;
 *   - two users cannot see each other's data through the API, not merely through the repo.
 *
 * Run with: npm run verify:api -- http://localhost:3100
 */

import { createClerkClient } from "@clerk/backend";

const baseUrl = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY is required. Run `vercel env pull`.");

const clerk = createClerkClient({ secretKey });

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

interface Actor {
  userId: string;
  token: string;
  label: string;
}

/** Creates a throwaway user and a real session token for them. */
async function makeActor(label: string): Promise<Actor> {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const user = await clerk.users.createUser({
    emailAddress: [`beebizy+verify_${label}_${stamp}@example.com`],
    password: `Verify-${stamp}-Aa1!`,
    skipPasswordChecks: true,
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  const token = await clerk.sessions.getToken(session.id, "");
  return { userId: user.id, token: token.jwt, label };
}

async function api(actor: Actor | null, path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const post = (actor: Actor, path: string, body: unknown) =>
  api(actor, path, { method: "POST", body: JSON.stringify(body) });

async function main() {
  const created: string[] = [];
  try {
    /* --- Authentication is actually enforced. */
    check("no token is refused", (await api(null, "/me")).status === 401);
    check(
      "a forged token is refused",
      (await api({ userId: "x", token: "not.a.jwt", label: "x" }, "/me")).status === 401,
    );

    const alice = await makeActor("alice");
    const bob = await makeActor("bob");
    created.push(alice.userId, bob.userId);

    /* --- A first-time user gets a workspace. */
    const aliceMe = await api(alice, "/me");
    check(
      "first request bootstraps a workspace",
      aliceMe.status === 200 && Boolean(aliceMe.body.workspaceId) && aliceMe.body.role === "owner",
      JSON.stringify(aliceMe.body),
    );
    const bobMe = await api(bob, "/me");
    check("each user gets their own workspace", bobMe.body.workspaceId !== aliceMe.body.workspaceId);

    /* --- Writes persist across requests. */
    const venue = await post(alice, "/locations", { name: "API Hall", city: "Portland" });
    check("venue created", venue.status === 201, `${venue.status}`);

    const event = await post(alice, "/events", {
      title: "API Persistence Summit",
      date: new Date(Date.now() + 9 * 864e5).toISOString(),
      status: "published",
      category: "Summit",
      capacity: 40,
      locationId: venue.body.id,
    });
    check("event created", event.status === 201, `${event.status}`);
    check("venue joined onto the event", event.body.locationRecord?.name === "API Hall");

    const reread = await api(alice, `/events/${event.body.id}`);
    check("event is readable in a separate request", reread.body?.title === "API Persistence Summit");

    const task = await post(alice, `/events/${event.body.id}/checklist`, {
      title: "Confirm the caterer",
      category: "Catering",
    });
    check("checklist item created", task.status === 201);
    const tasks = await api(alice, `/events/${event.body.id}/checklist`);
    check("checklist item persists", Array.isArray(tasks.body) && tasks.body.length === 1);

    await post(alice, `/events/${event.body.id}/run-of-show`, {
      startTime: "09:00",
      duration: 30,
      title: "Doors open",
    });
    await post(alice, `/events/${event.body.id}/budget`, {
      name: "Catering",
      category: "Catering",
      type: "expense",
      estimatedCents: 100_000,
    });
    const vendor = await post(alice, "/vendors", { name: "API Catering", category: "Catering" });
    await post(alice, `/events/${event.body.id}/vendors`, {
      vendorId: vendor.body.id,
      status: "confirmed",
      feeCents: 95_000,
    });
    await api(alice, `/events/${event.body.id}/floorplan`, {
      method: "PUT",
      body: JSON.stringify({
        name: "API test room",
        items: [{ id: "table-1", shape: "long-table", label: "Table 1", x: 50, y: 50, seats: 40 }],
      }),
    });
    const history = await api(alice, `/events/${event.body.id}/history`);
    const historyResources = new Set(history.body.map((entry: { resource: string }) => entry.resource));
    check(
      "API exposes structured planning history",
      ["event", "run-of-show", "budget", "vendor-booking", "floorplan"].every((resource) => historyResources.has(resource)),
    );

    /* --- Derived reads come back computed, not stored. */
    const portfolio = await api(alice, "/analytics/portfolio");
    check("portfolio counts the new event", portfolio.body?.eventsTotal === 1, JSON.stringify(portfolio.body?.eventsTotal));
    const open = await api(alice, "/analytics/open-tasks");
    check("the open task shows on the cross-event list", Array.isArray(open.body) && open.body.length === 1);

    /* --- Tenancy, over HTTP this time. */
    check("Bob's event list is empty", (await api(bob, "/events")).body.length === 0);
    check("Bob cannot read Alice's event", (await api(bob, `/events/${event.body.id}`)).body === null);
    check("Bob cannot read Alice's history", (await api(bob, `/events/${event.body.id}/history`)).body.length === 0);
    check(
      "Bob cannot patch Alice's event",
      (await api(bob, `/events/${event.body.id}`, { method: "PATCH", body: JSON.stringify({ title: "Hijacked" }) })).status === 404,
    );
    check(
      "Bob cannot delete Alice's event",
      (await api(bob, `/events/${event.body.id}`, { method: "DELETE" })).status === 404,
    );
    check(
      "Alice's event is untouched",
      (await api(alice, `/events/${event.body.id}`)).body.title === "API Persistence Summit",
    );
    check("Bob's portfolio stays empty", (await api(bob, "/analytics/portfolio")).body.eventsTotal === 0);

    /* --- Guest access needs the token and only exposes the agenda. */
    const share = await post(alice, `/events/${event.body.id}/share`, {});
    const guest = await fetch(`${baseUrl}/api/public/events/${share.body.shareToken}`);
    const guestBody = (await guest.json()) as Record<string, unknown>;
    check("share link resolves with no session", guest.status === 200);
    check(
      "the guest payload carries only what Share promises",
      Object.keys(guestBody).sort().join(",") === "agenda,event,tickets,timeZone",
      Object.keys(guestBody).join(","),
    );
    check(
      "an unknown share token is refused",
      (await fetch(`${baseUrl}/api/public/events/nope`)).status === 404,
    );

    /* --- Cascade on delete, through the API. */
    await api(alice, `/events/${event.body.id}`, { method: "DELETE" });
    check("event is gone", (await api(alice, `/events/${event.body.id}`)).body === null);
    check(
      "its checklist went with it",
      (await api(alice, `/events/${event.body.id}/checklist`)).body.length === 0,
    );
    check("the venue survived", (await api(alice, "/locations")).body.length === 1);
  } finally {
    // Deleting the Clerk users leaves the workspaces behind; that is fine for a scratch
    // database and keeps this script from needing destructive database access.
    for (const userId of created) {
      await clerk.users.deleteUser(userId).catch(() => {});
    }
  }

  console.log(failures === 0 ? "\nALL API CHECKS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
