/**
 * Integration test against the real database.
 *
 * The property under test is the one the in-memory store got wrong, and the one where a
 * bug becomes a breach: **two workspaces must never see each other's rows.** Unit tests
 * can't prove it, because the thing being tested is the SQL.
 *
 * Run with: npm run verify:db
 */

import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import * as s from "../src/server/schema";
import * as repos from "../src/server/repos";
import type { RequestContext } from "../src/server/auth";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const suffix = Date.now().toString(36);
const alice: RequestContext = { userId: `user_alice_${suffix}`, workspaceId: `ws_alice_${suffix}`, role: "owner" };
const bob: RequestContext = { userId: `user_bob_${suffix}`, workspaceId: `ws_bob_${suffix}`, role: "owner" };

async function main() {
  for (const ctx of [alice, bob]) {
    await db.insert(s.workspaces).values({ id: ctx.workspaceId, name: `${ctx.userId} workspace` });
    await db.insert(s.workspaceMembers).values({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: "owner" });
  }

  /* Alice builds an event with a venue and a checklist. */
  const venue = await repos.locations.create(alice, { name: "Alice Hall", city: "Seattle" });
  const event = await repos.events.create(alice, {
    title: "Alice's Summit",
    date: new Date(Date.now() + 6 * 864e5).toISOString(),
    status: "published",
    category: "Summit",
    capacity: 2,
    locationId: venue.id,
  });
  check("event persists with its venue joined", event.locationRecord?.name === "Alice Hall", event.locationRecord?.name);
  await repos.checklist.create(alice, event.id, { title: "Confirm catering", category: "Catering" });

  /* Tenancy: Bob must see none of it. */
  check("Bob sees no events of Alice's", (await repos.events.list(bob)).length === 0);
  check("Bob cannot read Alice's event by id", (await repos.events.get(bob, event.id)) === null);
  check("Bob sees no venues of Alice's", (await repos.locations.list(bob)).length === 0);
  check("Bob sees no checklist rows of Alice's", (await repos.checklist.list(bob, event.id)).length === 0);

  let denied = false;
  try {
    await repos.events.update(bob, event.id, { title: "Hijacked" });
  } catch {
    denied = true;
  }
  check("Bob cannot update Alice's event", denied);
  check("Alice's title is untouched", (await repos.events.get(alice, event.id))?.title === "Alice's Summit");

  /* Aggregates are per workspace. */
  check("Alice's portfolio counts her event", (await repos.analytics.portfolio(alice)).eventsTotal === 1);
  check("Bob's portfolio is empty", (await repos.analytics.portfolio(bob)).eventsTotal === 0);

  /* Capacity and duplicates are enforced by the database, not by a check in memory. */
  const [a1, a2, a3] = await Promise.all([
    repos.attendees.create(alice, { name: "One", contact: `one-${suffix}@example.com` }),
    repos.attendees.create(alice, { name: "Two", contact: `two-${suffix}@example.com` }),
    repos.attendees.create(alice, { name: "Three", contact: `three-${suffix}@example.com` }),
  ]);
  await repos.registrations.create(alice, { eventId: event.id, attendeeId: a1!.id, status: "confirmed" });
  await repos.registrations.create(alice, { eventId: event.id, attendeeId: a2!.id, status: "confirmed" });

  let overCapacity = false;
  try {
    await repos.registrations.create(alice, { eventId: event.id, attendeeId: a3!.id, status: "confirmed" });
  } catch (error) {
    overCapacity = /capacity/i.test(String(error));
  }
  check("capacity of 2 refuses a third registration", overCapacity);

  let duplicate = false;
  try {
    await repos.registrations.create(alice, { eventId: event.id, attendeeId: a1!.id });
  } catch (error) {
    duplicate = /already registered/i.test(String(error));
  }
  check("unique index refuses a duplicate registration", duplicate);

  /* Raffle allocation is guarded inside the UPDATE, not by read-then-write. */
  const raffle = await repos.raffle.create(alice, event.id, { name: "Bike", ticketPriceCents: 5000, totalTickets: 3 });
  await repos.raffle.sellTickets(alice, event.id, raffle.id, { buyerName: "A", buyerEmail: "a@example.com", quantity: 2 });
  let oversold = false;
  try {
    await repos.raffle.sellTickets(alice, event.id, raffle.id, { buyerName: "B", buyerEmail: "b@example.com", quantity: 2 });
  } catch (error) {
    oversold = /only 1 tickets left/i.test(String(error));
  }
  check("raffle refuses to oversell its allocation", oversold);

  /* Share tokens resolve with no session, and are not guessable. */
  const { shareToken } = await repos.events.share(alice, event.id);
  check("share token is long and random", shareToken.length >= 32, `${shareToken.length} chars`);
  const shared = await repos.eventByShareToken(shareToken);
  check("share token resolves publicly", shared?.event.id === event.id);
  // The guest has no settings of their own, so the zone has to come from the workspace —
  // otherwise a shared event page tells a guest in Berlin the wrong start time.
  const [aliceWorkspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, alice.workspaceId));
  check(
    "the guest payload carries the workspace's time zone",
    Boolean(shared?.timeZone) && shared?.timeZone === aliceWorkspace?.timeZone,
    `${shared?.timeZone} vs ${aliceWorkspace?.timeZone}`,
  );
  check("an unknown token resolves to nothing", (await repos.eventByShareToken("nope")) === null);

  /* Cascade comes from the foreign keys, not from hand-written deletes. */
  await repos.events.remove(alice, event.id);
  check(
    "checklist rows cascade away",
    (await db.select().from(s.checklistItems).where(eq(s.checklistItems.eventId, event.id))).length === 0,
  );
  check(
    "registrations cascade away",
    (await db.select().from(s.registrations).where(eq(s.registrations.eventId, event.id))).length === 0,
  );
  const [survivingVenue] = await db.select().from(s.locations).where(eq(s.locations.id, venue.id));
  check("the venue survives its event", Boolean(survivingVenue));

  /* Deleting the workspace cleans up everything this test created. */
  for (const ctx of [alice, bob]) {
    await db.delete(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId));
  }

  console.log(failures === 0 ? "\nALL TENANCY CHECKS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
