/**
 * These test the invariants the real backend also has to hold. They are the reason a
 * screen that works against the in-memory adapter can be trusted against Postgres:
 * denormalized counters stay in sync, deletes cascade, and allocations are exhaustible.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter, resetMemoryStore } from "./adapter";
import { DataError } from "../adapter";
import { DEFAULT_USER_SETTINGS } from "../entities";

beforeEach(() => {
  resetMemoryStore();
});

describe("events", () => {
  it("lists newest first and filters by status, category and venue", async () => {
    const all = await memoryAdapter.events.list();
    expect(all.length).toBeGreaterThan(5);
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i - 1]!.date >= all[i]!.date).toBe(true);
    }

    const drafts = await memoryAdapter.events.list({ status: "draft" });
    expect(drafts.every((event) => event.status === "draft")).toBe(true);

    const galas = await memoryAdapter.events.list({ category: "Gala" });
    expect(galas.every((event) => event.category === "Gala")).toBe(true);

    const atMoscone = await memoryAdapter.events.list({ locationId: "loc-moscone" });
    expect(atMoscone.every((event) => event.locationId === "loc-moscone")).toBe(true);
  });

  it("searches title, category and venue name", async () => {
    expect((await memoryAdapter.events.list({ search: "gala" })).length).toBe(1);
    expect((await memoryAdapter.events.list({ search: "moscone" })).length).toBeGreaterThan(0);
    expect((await memoryAdapter.events.list({ search: "zzzz" })).length).toBe(0);
  });

  it("returns detached copies, so a caller can't mutate the store", async () => {
    const event = await memoryAdapter.events.get("evt-gala");
    event!.title = "Mutated";
    expect((await memoryAdapter.events.get("evt-gala"))!.title).toBe("Annual Partner Gala & Fundraiser");
  });

  it("keeps the venue's event count in sync on create and delete", async () => {
    const before = (await memoryAdapter.locations.get("loc-moscone"))!.eventCount;
    const created = await memoryAdapter.events.create({
      title: "New thing",
      date: new Date().toISOString(),
      status: "draft",
      category: "Summit",
      locationId: "loc-moscone",
    });
    expect((await memoryAdapter.locations.get("loc-moscone"))!.eventCount).toBe(before + 1);

    await memoryAdapter.events.remove(created.id);
    expect((await memoryAdapter.locations.get("loc-moscone"))!.eventCount).toBe(before);
  });

  it("cascade-deletes every subcollection, because Firestore doesn't do it for us", async () => {
    expect((await memoryAdapter.checklist.list("evt-gala")).length).toBeGreaterThan(0);
    expect((await memoryAdapter.tickets.list("evt-gala")).length).toBeGreaterThan(0);
    expect((await memoryAdapter.auction.list("evt-gala")).length).toBeGreaterThan(0);
    expect((await memoryAdapter.registrations.listForEvent("evt-gala")).length).toBeGreaterThan(0);

    await memoryAdapter.events.remove("evt-gala");

    expect(await memoryAdapter.events.get("evt-gala")).toBeNull();
    expect(await memoryAdapter.checklist.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.tickets.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.auction.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.raffle.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.sponsorships.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.budget.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.eventVendors.list("evt-gala")).toEqual([]);
    expect(await memoryAdapter.registrations.listForEvent("evt-gala")).toEqual([]);
  });

  it("mints a share token once and reuses it", async () => {
    const first = await memoryAdapter.events.share("evt-cab");
    const second = await memoryAdapter.events.share("evt-cab");
    expect(first.shareToken).toBe(second.shareToken);
    // The guest payload carries the agenda and tickets because a guest has no session to
    // fetch them with, and the workspace's zone because their own is the wrong answer.
    const shared = (await memoryAdapter.events.getByShareToken(first.shareToken))!;
    expect(shared.event.id).toBe("evt-cab");
    expect(shared.agenda.every((cue) => cue.eventId === "evt-cab")).toBe(true);
    expect(shared.tickets.every((ticket) => ticket.eventId === "evt-cab" && ticket.isActive)).toBe(true);
    expect(shared.timeZone).toBe(DEFAULT_USER_SETTINGS.timeZone);
  });

  it("copies a template's contents into a new event", async () => {
    const template = (await memoryAdapter.templates.get("tpl-gala"))!;
    const created = await memoryAdapter.events.createFromTemplate("tpl-gala", {
      title: "From template",
      date: new Date().toISOString(),
      status: "draft",
      category: "Gala",
    });

    const checklist = await memoryAdapter.checklist.list(created.id);
    expect(checklist).toHaveLength(template.checklistItems.length);
    expect(checklist.every((item) => !item.completed)).toBe(true);
    expect(await memoryAdapter.budget.list(created.id)).toHaveLength(template.budgetItems.length);
    const history = await memoryAdapter.history.list(created.id);
    expect(history.filter((entry) => entry.resource === "run-of-show")).toHaveLength(template.runOfShowItems.length);
    expect(history.filter((entry) => entry.resource === "budget")).toHaveLength(template.budgetItems.length);
  });

  it("saves an event as a template with progress stripped", async () => {
    const template = await memoryAdapter.events.saveAsTemplate("evt-skickoff", { name: "Kickoff playbook" });
    const detail = (await memoryAdapter.templates.get(template.id))!;
    expect(detail.checklistItems.length).toBeGreaterThan(0);
    expect(detail.checklistItems.every((item) => !item.completed && item.dueDate === null)).toBe(true);
    expect(detail.budgetItems.every((item) => item.actualCents === null)).toBe(true);
  });

  it("throws a typed error for a missing event", async () => {
    await expect(memoryAdapter.events.update("nope", { title: "x" })).rejects.toBeInstanceOf(DataError);
  });
});

describe("registrations", () => {
  it("keeps the event's registration count in sync and excludes cancellations", async () => {
    const event = (await memoryAdapter.events.get("evt-atlas"))!;
    const guests = await memoryAdapter.guests.list();
    const existing = await memoryAdapter.registrations.listForEvent("evt-atlas");
    const taken = new Set(existing.map((row) => row.guestId));
    const unregistered = guests.find((guest) => !taken.has(guest.id));
    expect(unregistered).toBeDefined();

    const created = await memoryAdapter.registrations.create({
      eventId: "evt-atlas",
      guestId: unregistered!.id,
      status: "confirmed",
    });
    expect((await memoryAdapter.events.get("evt-atlas"))!.registrationCount).toBe(event.registrationCount + 1);

    await memoryAdapter.registrations.setStatus(created.id, "cancelled");
    expect((await memoryAdapter.events.get("evt-atlas"))!.registrationCount).toBe(event.registrationCount);
  });

  it("refuses a duplicate registration", async () => {
    const existing = (await memoryAdapter.registrations.listForEvent("evt-cab")).find((row) => row.status === "confirmed")!;
    await expect(
      memoryAdapter.registrations.create({ eventId: "evt-cab", guestId: existing.guestId }),
    ).rejects.toThrow(/already registered/i);
  });

  it("refuses to exceed capacity", async () => {
    // The advisory board seats 24 and the seed fills 12; push it to the limit.
    const guests = await memoryAdapter.guests.list();
    let added = 0;
    for (const guest of guests) {
      try {
        await memoryAdapter.registrations.create({ eventId: "evt-cab", guestId: guest.id, status: "confirmed" });
        added += 1;
      } catch (error) {
        if (error instanceof DataError && error.code === "conflict" && /capacity/i.test(error.message)) {
          expect((await memoryAdapter.events.get("evt-cab"))!.registrationCount).toBe(24);
          expect(added).toBeGreaterThan(0);
          return;
        }
      }
    }
    throw new Error("capacity was never enforced");
  });

  it("removes an guest's registrations and fixes the counts", async () => {
    const rows = await memoryAdapter.registrations.listForEvent("evt-cab");
    const target = rows[0]!;
    const before = (await memoryAdapter.events.get("evt-cab"))!.registrationCount;
    await memoryAdapter.guests.remove(target.guestId);
    expect((await memoryAdapter.events.get("evt-cab"))!.registrationCount).toBe(before - 1);
  });
});

describe("tickets", () => {
  it("sells against a share token and creates the buyer as an guest", async () => {
    const { shareToken } = await memoryAdapter.events.share("evt-gala");
    const [ticket] = await memoryAdapter.tickets.list("evt-gala");
    const soldBefore = ticket!.quantitySold;
    const registrationsBefore = (await memoryAdapter.registrations.listForEvent("evt-gala")).length;

    await memoryAdapter.tickets.purchase(shareToken, ticket!.id, {
      name: "Sam Buyer",
      contact: "sam.buyer@example.com",
      quantity: 2,
    });

    const after = (await memoryAdapter.tickets.list("evt-gala")).find((t) => t.id === ticket!.id)!;
    expect(after.quantitySold).toBe(soldBefore + 2);
    expect((await memoryAdapter.registrations.listForEvent("evt-gala")).length).toBe(registrationsBefore + 1);
    expect((await memoryAdapter.guests.list()).some((a) => a.contact === "sam.buyer@example.com")).toBe(true);
  });

  it("reuses an existing guest rather than duplicating them", async () => {
    const { shareToken } = await memoryAdapter.events.share("evt-gala");
    const [ticket] = await memoryAdapter.tickets.list("evt-gala");
    const known = (await memoryAdapter.guests.list())[0]!;
    const countBefore = (await memoryAdapter.guests.list()).length;

    await memoryAdapter.tickets.purchase(shareToken, ticket!.id, {
      name: known.name,
      contact: known.contact.toUpperCase(),
      quantity: 1,
    });
    expect((await memoryAdapter.guests.list()).length).toBe(countBefore);
  });

  it("refuses to sell more than the allocation, naming what is left", async () => {
    const { shareToken } = await memoryAdapter.events.share("evt-gala");
    const table = (await memoryAdapter.tickets.list("evt-gala")).find((t) => t.name === "Table of ten")!;
    const remaining = table.quantityTotal - table.quantitySold;

    await expect(
      memoryAdapter.tickets.purchase(shareToken, table.id, {
        name: "Greedy",
        contact: "greedy@example.com",
        quantity: remaining + 1,
      }),
    ).rejects.toThrow(new RegExp(`Only ${remaining} left`));
  });

  it("refuses an unknown or revoked share token", async () => {
    const [ticket] = await memoryAdapter.tickets.list("evt-gala");
    await expect(
      memoryAdapter.tickets.purchase("not-a-token", ticket!.id, { name: "A", contact: "a@b.c", quantity: 1 }),
    ).rejects.toThrow(/no longer active/i);
  });

  it("won't shrink an allocation below what is already sold", async () => {
    const table = (await memoryAdapter.tickets.list("evt-gala")).find((t) => t.name === "Table of ten")!;
    await expect(
      memoryAdapter.tickets.update("evt-gala", table.id, { quantityTotal: 1 }),
    ).rejects.toThrow(/already sold/i);
  });
});

describe("raffle", () => {
  it("weights the draw by ticket quantity and closes the raffle", async () => {
    const [raffle] = await memoryAdapter.raffle.list("evt-gala");
    const drawn = await memoryAdapter.raffle.draw("evt-gala", raffle!.id);
    expect(drawn.status).toBe("drawn");
    expect(drawn.winnerName).toBeTruthy();
    expect(drawn.drawnAt).toBeTruthy();
  });

  it("won't draw with no tickets sold", async () => {
    const created = await memoryAdapter.raffle.create("evt-cab", { name: "Empty raffle", ticketPriceCents: 1000, totalTickets: 10 });
    await expect(memoryAdapter.raffle.draw("evt-cab", created.id)).rejects.toThrow(/no tickets/i);
  });

  it("won't sell past the ticket total", async () => {
    const created = await memoryAdapter.raffle.create("evt-cab", { name: "Small raffle", ticketPriceCents: 1000, totalTickets: 5 });
    await expect(
      memoryAdapter.raffle.sellTickets("evt-cab", created.id, { buyerName: "A", buyerEmail: "a@b.c", quantity: 6 }),
    ).rejects.toThrow(/Only 5 tickets left/);
  });
});

describe("vendors", () => {
  it("recomputes the thread summary and unread count after a send", async () => {
    const before = (await memoryAdapter.vendors.get("ven-goldengate"))!;
    expect(before.unreadCount).toBeGreaterThan(0);

    await memoryAdapter.vendorMessages.send("ven-goldengate", { content: "450 confirmed.", senderName: "You" });
    const after = (await memoryAdapter.vendors.get("ven-goldengate"))!;
    expect(after.lastMessage).toBe("450 confirmed.");
    expect(after.lastDirection).toBe("outbound");

    await memoryAdapter.vendorMessages.markThreadRead("ven-goldengate");
    expect((await memoryAdapter.vendors.get("ven-goldengate"))!.unreadCount).toBe(0);
  });

  it("removes bookings and messages when a vendor is deleted", async () => {
    await memoryAdapter.vendors.remove("ven-goldengate");
    const bookings = await memoryAdapter.eventVendors.list("evt-skickoff");
    expect(bookings.some((booking) => booking.vendorId === "ven-goldengate")).toBe(false);
    expect(await memoryAdapter.vendorMessages.list("ven-goldengate")).toEqual([]);
  });
});

describe("locations", () => {
  it("refuses to delete a venue that still has events", async () => {
    await expect(memoryAdapter.locations.remove("loc-moscone")).rejects.toThrow(/still has events/i);
  });

  it("updates the venue snapshot embedded in each event", async () => {
    await memoryAdapter.locations.update("loc-moscone", { name: "Moscone Renamed" });
    const events = await memoryAdapter.events.list({ locationId: "loc-moscone" });
    expect(events.every((event) => event.locationRecord?.name === "Moscone Renamed")).toBe(true);
  });
});

describe("analytics", () => {
  it("computes portfolio totals from one pass, not a query per event", async () => {
    const portfolio = await memoryAdapter.analytics.portfolio();
    expect(portfolio.eventsTotal).toBeGreaterThan(5);
    expect(portfolio.registrationsConfirmed).toBeGreaterThan(0);
    expect(portfolio.budgetPlannedCents).toBeGreaterThan(0);
    expect(portfolio.revenueCents).toBeGreaterThan(0);
  });

  it("returns health for every event, or just the ones asked for", async () => {
    const all = await memoryAdapter.analytics.health();
    expect(all.length).toBe((await memoryAdapter.events.list()).length);

    const one = await memoryAdapter.analytics.health(["evt-skickoff"]);
    expect(one).toHaveLength(1);
    expect(one[0]!.checklistTotal).toBeGreaterThan(0);
  });

  it("surfaces the seeded unconfirmed-catering risk on the near event", async () => {
    const attention = await memoryAdapter.analytics.attention();
    const kickoff = attention.filter((item) => item.eventId === "evt-skickoff");
    expect(kickoff.some((item) => item.level === "urgent")).toBe(true);
    expect(kickoff.some((item) => /catering/i.test(item.message))).toBe(true);
  });

  it("orders the worklist most urgent first", async () => {
    const attention = await memoryAdapter.analytics.attention();
    for (let i = 1; i < attention.length; i += 1) {
      expect(attention[i - 1]!.weight <= attention[i]!.weight).toBe(true);
    }
  });
});

describe("floorplan", () => {
  it("reads the seeded plan and totals its seats", async () => {
    const plan = await memoryAdapter.floorplan.get("evt-gala");
    expect(plan).not.toBeNull();
    expect(plan!.items.length).toBeGreaterThan(10);
    const seats = plan!.items.reduce((total, item) => total + (item.seats ?? 0), 0);
    // Eleven ten-seat tables in the seed.
    expect(seats).toBe(110);
  });

  it("returns null for an event with no plan", async () => {
    expect(await memoryAdapter.floorplan.get("evt-cab")).toBeNull();
  });

  it("round-trips a saved plan", async () => {
    const saved = await memoryAdapter.floorplan.save("evt-cab", {
      name: "U-shape, 24 seats",
      items: [
        { id: "a", shape: "long-table", label: "Top", x: 50, y: 20, seats: 8 },
        { id: "b", shape: "long-table", label: "Left", x: 20, y: 50, seats: 8 },
        { id: "c", shape: "long-table", label: "Right", x: 80, y: 50, seats: 8 },
      ],
    });
    expect(saved.name).toBe("U-shape, 24 seats");

    const reread = await memoryAdapter.floorplan.get("evt-cab");
    expect(reread!.items).toHaveLength(3);
    expect(reread!.items.reduce((total, item) => total + (item.seats ?? 0), 0)).toBe(24);
  });

  it("overwrites rather than appending a second plan", async () => {
    await memoryAdapter.floorplan.save("evt-cab", { name: "First", items: [] });
    await memoryAdapter.floorplan.save("evt-cab", { name: "Second", items: [] });
    expect((await memoryAdapter.floorplan.get("evt-cab"))!.name).toBe("Second");
  });

  it("hands back a detached copy", async () => {
    const plan = await memoryAdapter.floorplan.get("evt-gala");
    plan!.items[0]!.label = "Mutated";
    expect((await memoryAdapter.floorplan.get("evt-gala"))!.items[0]!.label).not.toBe("Mutated");
  });

  it("goes away when the event is deleted", async () => {
    await memoryAdapter.events.remove("evt-gala");
    expect(await memoryAdapter.floorplan.get("evt-gala")).toBeNull();
  });

  it("refuses a plan for an event that does not exist", async () => {
    await expect(memoryAdapter.floorplan.save("nope", { name: "x", items: [] })).rejects.toThrow(/no longer exists/i);
  });
});

describe("templates", () => {
  it("replaces contents atomically and keeps the counts in step", async () => {
    const before = (await memoryAdapter.templates.get("tpl-offsite"))!;
    expect(before.checklistCount).toBe(before.checklistItems.length);

    const updated = await memoryAdapter.templates.replaceContents("tpl-offsite", {
      checklistItems: before.checklistItems.slice(0, 2),
      runOfShowItems: [],
      budgetItems: before.budgetItems,
    });

    expect(updated.checklistCount).toBe(2);
    expect(updated.checklistItems).toHaveLength(2);
    expect(updated.runOfShowCount).toBe(0);
    expect(updated.budgetCount).toBe(before.budgetItems.length);

    // The summary the library lists must agree with the document.
    const listed = (await memoryAdapter.templates.list()).find((t) => t.id === "tpl-offsite")!;
    expect(listed.checklistCount).toBe(2);
    expect(listed.runOfShowCount).toBe(0);
  });

  it("refuses to replace contents on a template that does not exist", async () => {
    await expect(
      memoryAdapter.templates.replaceContents("nope", { checklistItems: [], runOfShowItems: [], budgetItems: [] }),
    ).rejects.toThrow(/no longer exists/i);
  });
});

describe("open tasks", () => {
  it("lists only incomplete tasks on live events", async () => {
    const tasks = await memoryAdapter.analytics.openTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => !task.completed)).toBe(true);
    // The seed's completed and cancelled events both carry checklist items.
    expect(tasks.some((task) => task.eventId === "evt-townhall")).toBe(false);
    expect(tasks.some((task) => task.eventId === "evt-roadshow")).toBe(false);
  });

  it("carries enough of the event to be shown outside it", async () => {
    const task = (await memoryAdapter.analytics.openTasks())[0]!;
    expect(task.eventTitle).toBeTruthy();
    expect(task.eventDate).toBeTruthy();
    expect(typeof task.overdue).toBe("boolean");
  });

  it("puts overdue work first", async () => {
    const tasks = await memoryAdapter.analytics.openTasks();
    const lastOverdue = tasks.map((task) => task.overdue).lastIndexOf(true);
    const firstClear = tasks.map((task) => task.overdue).indexOf(false);
    if (lastOverdue !== -1 && firstClear !== -1) expect(lastOverdue).toBeLessThan(firstClear);
  });

  it("drops a task once it is completed", async () => {
    const before = await memoryAdapter.analytics.openTasks();
    const target = before[0]!;
    await memoryAdapter.checklist.update(target.eventId, target.id, { completed: true });
    const after = await memoryAdapter.analytics.openTasks();
    expect(after.some((task) => task.id === target.id)).toBe(false);
    expect(after).toHaveLength(before.length - 1);
  });
});

describe("boards", () => {
  it("lists the seeded boards, newest first", async () => {
    const boards = await memoryAdapter.canvases.list();
    expect(boards.length).toBe(2);
    expect(boards[0]!.createdAt >= boards[1]!.createdAt).toBe(true);
  });

  it("keeps a board that is not attached to any event", async () => {
    const boards = await memoryAdapter.canvases.list();
    expect(boards.some((board) => board.eventId === null)).toBe(true);
  });

  it("round-trips cards", async () => {
    const created = await memoryAdapter.canvases.create({ name: "Palette study" });
    expect(created.cards).toEqual([]);

    const saved = await memoryAdapter.canvases.replaceCards(created.id, [
      { id: "a", kind: "swatch", content: "#123456", caption: "Ink", x: 10, y: 10, width: 12, color: "#123456" },
      { id: "b", kind: "note", content: "Colder than the gala.", caption: null, x: 40, y: 20, width: 24, color: "#dbeafe" },
    ]);
    expect(saved.cards).toHaveLength(2);

    const reread = await memoryAdapter.canvases.get(created.id);
    expect(reread!.cards.map((card) => card.kind)).toEqual(["swatch", "note"]);
  });

  it("hands back a detached copy", async () => {
    const board = await memoryAdapter.canvases.get("cvs-gala-look");
    board!.cards[0]!.content = "Mutated";
    expect((await memoryAdapter.canvases.get("cvs-gala-look"))!.cards[0]!.content).not.toBe("Mutated");
  });

  it("detaches rather than deletes when its event goes", async () => {
    expect((await memoryAdapter.canvases.get("cvs-gala-look"))!.eventId).toBe("evt-gala");
    await memoryAdapter.events.remove("evt-gala");
    const board = await memoryAdapter.canvases.get("cvs-gala-look");
    // The concepting work outlives the event it was for.
    expect(board).not.toBeNull();
    expect(board!.eventId).toBeNull();
    expect(board!.cards.length).toBeGreaterThan(0);
  });

  it("throws for a board that does not exist", async () => {
    await expect(memoryAdapter.canvases.replaceCards("nope", [])).rejects.toThrow(/no longer exists/i);
  });
});

describe("settings", () => {
  it("round-trips a preference", async () => {
    await memoryAdapter.settings.update({ homeGrouping: "category", currency: "GBP" });
    const settings = await memoryAdapter.settings.get();
    expect(settings.homeGrouping).toBe("category");
    expect(settings.currency).toBe("GBP");
  });
});
