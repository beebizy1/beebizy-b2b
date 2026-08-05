/**
 * The risk rules are the product's opinion about what matters, so they are the thing
 * most worth pinning down: a regression here means someone doesn't get told their
 * caterer never confirmed.
 */

import { describe, expect, it } from "vitest";
import { buildAttention, computeEventHealth, daysUntil, describeWhen, fundraisingCents, ticketRevenueCents } from "./derive";
import type {
  AuctionItem,
  BudgetItem,
  ChecklistItem,
  Event,
  EventVendor,
  RaffleItem,
  Sponsorship,
  TicketType,
} from "./entities";

const NOW = new Date("2027-03-10T12:00:00.000Z");

const iso = (dayOffset: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
};

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    ownerId: "owner",
    title: "Test Event",
    description: null,
    date: iso(6),
    endDate: null,
    location: null,
    locationId: null,
    locationRecord: null,
    capacity: 100,
    status: "published",
    category: "Summit",
    imageUrl: null,
    registrationCount: 40,
    shareToken: null,
    createdAt: iso(-60),
    ...overrides,
  };
}

function task(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: `cl-${Math.random().toString(36).slice(2)}`,
    eventId: "evt-1",
    title: "A task",
    description: null,
    completed: false,
    dueDate: null,
    assignedTo: null,
    category: "General",
    sortOrder: 1,
    createdAt: iso(-30),
    ...overrides,
  };
}

function booking(status: EventVendor["status"], category: string): EventVendor {
  return {
    id: `ev-${category}`,
    eventId: "evt-1",
    vendorId: `ven-${category}`,
    notes: null,
    status,
    feeCents: 100_000,
    vendor: {
      id: `ven-${category}`,
      ownerId: "owner",
      name: `${category} Co`,
      category,
      description: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      logoUrl: null,
      rating: null,
      city: null,
      state: null,
      country: null,
      lastMessage: null,
      lastMessageAt: null,
      lastDirection: null,
      unreadCount: 0,
      createdAt: iso(-100),
    },
    createdAt: iso(-30),
  };
}

function expense(estimated: number, actual: number | null): BudgetItem {
  return {
    id: `bud-${estimated}-${actual}`,
    eventId: "evt-1",
    name: "Line",
    category: "General",
    type: "expense",
    estimatedCents: estimated,
    actualCents: actual,
    notes: null,
    sortOrder: 1,
    createdAt: iso(-20),
  };
}

const emptyFacts = {
  checklist: [] as ChecklistItem[],
  vendors: [] as EventVendor[],
  budget: [] as BudgetItem[],
  tickets: [] as TicketType[],
  sponsorships: [] as Sponsorship[],
  auction: [] as AuctionItem[],
  raffle: [] as RaffleItem[],
};

describe("daysUntil", () => {
  it("counts calendar days, not elapsed hours", () => {
    expect(daysUntil(iso(0), NOW)).toBe(0);
    expect(daysUntil(iso(1), NOW)).toBe(1);
    expect(daysUntil(iso(-1), NOW)).toBe(-1);
  });

  it("returns null for an unparseable date rather than NaN", () => {
    expect(daysUntil("not a date", NOW)).toBeNull();
  });
});

describe("describeWhen", () => {
  it("prefers relative language at human scales", () => {
    expect(describeWhen(iso(0), NOW)).toBe("today");
    expect(describeWhen(iso(1), NOW)).toBe("tomorrow");
    expect(describeWhen(iso(6), NOW)).toBe("in 6 days");
    expect(describeWhen(iso(21), NOW)).toBe("in 3 weeks");
    expect(describeWhen(iso(-1), NOW)).toBe("yesterday");
    expect(describeWhen(iso(-40), NOW)).toBe("6 weeks ago");
  });
});

describe("computeEventHealth — readiness", () => {
  it("scores 0 when there is nothing to measure", () => {
    const health = computeEventHealth({ event: makeEvent({ capacity: null }), ...emptyFacts }, NOW);
    expect(health.readiness).toBe(0);
  });

  it("does not punish a simple event for having no vendors", () => {
    const allDone = [task({ completed: true }), task({ completed: true })];
    const health = computeEventHealth(
      { event: makeEvent({ capacity: null }), ...emptyFacts, checklist: allDone },
      NOW,
    );
    expect(health.readiness).toBe(100);
  });

  it("weights checklist above vendors above capacity", () => {
    const checklistBehind = computeEventHealth(
      {
        event: makeEvent({ capacity: null }),
        ...emptyFacts,
        checklist: [task(), task()],
        vendors: [booking("confirmed", "AV")],
      },
      NOW,
    );
    const vendorsBehind = computeEventHealth(
      {
        event: makeEvent({ capacity: null }),
        ...emptyFacts,
        checklist: [task({ completed: true }), task({ completed: true })],
        vendors: [booking("pending", "AV")],
      },
      NOW,
    );
    // Same 50/50 split of dimensions, but the checklist carries more weight.
    expect(checklistBehind.readiness).toBeLessThan(vendorsBehind.readiness);
  });
});

describe("computeEventHealth — risks", () => {
  it("flags an overdue task by name", () => {
    const health = computeEventHealth(
      {
        event: makeEvent(),
        ...emptyFacts,
        checklist: [task({ title: "Confirm headcount", dueDate: iso(-2) })],
      },
      NOW,
    );
    expect(health.risks[0]).toMatchObject({ level: "urgent", section: "plan" });
    expect(health.risks[0]?.message).toContain("Confirm headcount");
  });

  it("names the unconfirmed vendor categories and how soon the event is", () => {
    const health = computeEventHealth(
      {
        event: makeEvent({ date: iso(6) }),
        ...emptyFacts,
        vendors: [booking("pending", "Catering"), booking("pending", "Print"), booking("confirmed", "AV")],
      },
      NOW,
    );
    const vendorRisk = health.risks.find((risk) => risk.section === "suppliers");
    expect(vendorRisk?.level).toBe("urgent");
    expect(vendorRisk?.message).toBe("Catering and Print still unconfirmed, in 6 days");
  });

  it("downgrades an unconfirmed vendor to a watch when the event is further out", () => {
    const health = computeEventHealth(
      { event: makeEvent({ date: iso(18) }), ...emptyFacts, vendors: [booking("pending", "Catering")] },
      NOW,
    );
    expect(health.risks.find((risk) => risk.section === "suppliers")?.level).toBe("watch");
  });

  it("stays quiet about vendors on a distant event", () => {
    const health = computeEventHealth(
      { event: makeEvent({ date: iso(60) }), ...emptyFacts, vendors: [booking("pending", "Catering")] },
      NOW,
    );
    expect(health.risks.some((risk) => risk.section === "suppliers")).toBe(false);
  });

  it("flags a draft that is nearly here", () => {
    const health = computeEventHealth({ event: makeEvent({ status: "draft", date: iso(10) }), ...emptyFacts }, NOW);
    expect(health.risks[0]).toMatchObject({ level: "urgent", section: "overview" });
  });

  it("flags oversubscription with the exact overage", () => {
    const health = computeEventHealth(
      { event: makeEvent({ capacity: 100, registrationCount: 112 }), ...emptyFacts },
      NOW,
    );
    const risk = health.risks.find((r) => r.section === "people");
    expect(risk?.message).toContain("oversubscribed by 12");
  });

  it("flags overspend as a percentage of plan", () => {
    const health = computeEventHealth(
      { event: makeEvent(), ...emptyFacts, budget: [expense(100_000, 130_000)] },
      NOW,
    );
    expect(health.risks.find((r) => r.section === "money")?.message).toBe("Spend is 30% over the plan");
  });

  it("says nothing about a completed or cancelled event", () => {
    for (const status of ["completed", "cancelled"] as const) {
      const health = computeEventHealth(
        {
          event: makeEvent({ status, date: iso(-5) }),
          ...emptyFacts,
          checklist: [task({ dueDate: iso(-20) })],
          budget: [expense(100_000, 200_000)],
        },
        NOW,
      );
      expect(health.risks).toEqual([]);
    }
  });

  it("puts urgent risks before watch risks", () => {
    const health = computeEventHealth(
      {
        event: makeEvent({ date: iso(6) }),
        ...emptyFacts,
        checklist: [task({ dueDate: iso(-1) })],
        budget: [expense(100_000, 103_000)],
      },
      NOW,
    );
    expect(health.risks.map((risk) => risk.level)).toEqual(["urgent", "watch"]);
  });
});

describe("revenue", () => {
  it("counts ticket revenue as price times sold, per type", () => {
    const tickets: TicketType[] = [
      {
        id: "tt-1",
        eventId: "evt-1",
        name: "Seat",
        description: null,
        priceCents: 45_000,
        quantityTotal: 100,
        quantitySold: 3,
        isActive: true,
        sortOrder: 1,
        createdAt: iso(-10),
      },
    ];
    expect(ticketRevenueCents(tickets)).toBe(135_000);
  });

  it("counts only confirmed sponsorship, plus live bids and raffle sales", () => {
    const sponsorships: Sponsorship[] = [
      { id: "s1", eventId: "evt-1", companyName: "A", tier: "gold", amountCents: 500_000, logoUrl: null, contactEmail: null, contactName: null, notes: null, status: "confirmed", createdAt: iso(-30) },
      { id: "s2", eventId: "evt-1", companyName: "B", tier: "silver", amountCents: 300_000, logoUrl: null, contactEmail: null, contactName: null, notes: null, status: "pending", createdAt: iso(-30) },
    ];
    const auction: AuctionItem[] = [
      { id: "a1", eventId: "evt-1", title: "Lot", description: null, imageUrl: null, startingBidCents: 10_000, currentBidCents: 25_000, fairMarketValueCents: null, winnerName: null, donorName: null, paymentMethod: null, paymentLink: null, paymentReceivedAt: null, status: "open", auctionType: "silent", lotNumber: 1, createdAt: iso(-20) },
      { id: "a2", eventId: "evt-1", title: "No bids", description: null, imageUrl: null, startingBidCents: 50_000, currentBidCents: null, fairMarketValueCents: null, winnerName: null, donorName: null, paymentMethod: null, paymentLink: null, paymentReceivedAt: null, status: "open", auctionType: "live", lotNumber: 2, createdAt: iso(-20) },
    ];
    const raffle: RaffleItem[] = [
      { id: "r1", eventId: "evt-1", name: "Bike", description: null, imageUrl: null, ticketPriceCents: 5_000, totalTickets: 100, soldTickets: 10, winnerName: null, winnerEmail: null, winnerTicketId: null, drawnAt: null, status: "open", createdAt: iso(-15) },
    ];
    // 500_000 confirmed + 25_000 bid (unbid lot contributes nothing) + 50_000 raffle
    expect(fundraisingCents(sponsorships, auction, raffle)).toBe(575_000);
  });
});

describe("buildAttention", () => {
  it("ranks urgent before watch, even when the urgent event is further away", () => {
    const near = makeEvent({ id: "near", title: "Near", date: iso(3) });
    // Inside the 14-day window, so its overdue task is urgent rather than a watch.
    const far = makeEvent({ id: "far", title: "Far", date: iso(12) });

    const nearHealth = computeEventHealth(
      { event: near, ...emptyFacts, budget: [expense(100_000, 102_000)] },
      NOW,
    );
    const farHealth = computeEventHealth(
      { event: far, ...emptyFacts, checklist: [task({ title: "Late thing", dueDate: iso(-3) })] },
      NOW,
    );

    const items = buildAttention([near, far], [nearHealth, farHealth]);
    expect(items[0]?.level).toBe("urgent");
    expect(items[0]?.eventTitle).toBe("Far");
    expect(items.at(-1)?.level).toBe("watch");
  });

  it("drops risks whose event is missing rather than throwing", () => {
    const orphan = computeEventHealth({ event: makeEvent({ id: "ghost", status: "draft", date: iso(5) }), ...emptyFacts }, NOW);
    expect(buildAttention([], [orphan])).toEqual([]);
  });
});
