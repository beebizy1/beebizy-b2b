/**
 * Pure functions that turn raw records into the judgements the UI shows.
 *
 * The old dashboard could tell you there were 42 events. It could not tell you that
 * the one six days out has unconfirmed catering and three overdue tasks. Everything
 * that answers "what needs me?" is computed here — no I/O, no React, so it is trivial
 * to test and can run inside either adapter.
 */

import type {
  AttentionItem,
  AuctionItem,
  BudgetItem,
  ChecklistItem,
  Event,
  EventHealth,
  EventRisk,
  EventVendor,
  PortfolioSummary,
  RaffleItem,
  Registration,
  Sponsorship,
  TicketType,
} from "./entities";
import { sumCents } from "./money";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from now until `iso`. Negative once it's in the past, null if unparseable. */
export function daysUntil(iso: string, now: Date = new Date()): number | null {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / MS_PER_DAY);
}

/** "in 6 days", "tomorrow", "today", "3 weeks ago" — never a bare date when relative is clearer. */
export function describeWhen(iso: string, now: Date = new Date()): string {
  const days = daysUntil(iso, now);
  if (days === null) return "date unknown";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) {
    if (days < 14) return `in ${days} days`;
    if (days < 60) return `in ${Math.round(days / 7)} weeks`;
    return `in ${Math.round(days / 30)} months`;
  }
  const past = Math.abs(days);
  if (past < 14) return `${past} days ago`;
  if (past < 60) return `${Math.round(past / 7)} weeks ago`;
  return `${Math.round(past / 30)} months ago`;
}

export interface EventFacts {
  event: Event;
  checklist: ChecklistItem[];
  vendors: EventVendor[];
  budget: BudgetItem[];
  tickets: TicketType[];
  sponsorships: Sponsorship[];
  auction: AuctionItem[];
  raffle: RaffleItem[];
}

/** Gross ticket revenue booked so far. */
export function ticketRevenueCents(tickets: TicketType[]): number {
  return sumCents(tickets.map((t) => t.priceCents * t.quantitySold));
}

/** Money raised outside ticketing: confirmed sponsorships, current bids, raffle sales. */
export function fundraisingCents(
  sponsorships: Sponsorship[],
  auction: AuctionItem[],
  raffle: RaffleItem[],
): number {
  const sponsor = sumCents(sponsorships.filter((s) => s.status === "confirmed").map((s) => s.amountCents));
  const bids = sumCents(auction.map((item) => item.currentBidCents));
  const raffles = sumCents(raffle.map((item) => item.ticketPriceCents * item.soldTickets));
  return sponsor + bids + raffles;
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/**
 * Readiness on a 0–100 scale, blending checklist completion, vendor confirmation and
 * registration fill. Dimensions that don't apply (an event with no vendors) drop out
 * and their weight is redistributed, so a simple event isn't punished for being simple.
 */
function readinessScore(input: {
  checklistDone: number;
  checklistTotal: number;
  vendorsConfirmed: number;
  vendorsTotal: number;
  capacityFilled: number | null;
}): number {
  const dimensions: Array<{ weight: number; value: number }> = [];
  if (input.checklistTotal > 0) {
    dimensions.push({ weight: 5, value: (input.checklistDone / input.checklistTotal) * 100 });
  }
  if (input.vendorsTotal > 0) {
    dimensions.push({ weight: 3, value: (input.vendorsConfirmed / input.vendorsTotal) * 100 });
  }
  if (input.capacityFilled !== null) {
    dimensions.push({ weight: 2, value: Math.min(100, input.capacityFilled) });
  }
  if (dimensions.length === 0) return 0;
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  return Math.round(dimensions.reduce((sum, d) => sum + d.value * d.weight, 0) / totalWeight);
}

/** Comma-list with an Oxford "and": ["a","b","c"] → "a, b and c". */
function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The risks worth interrupting someone for. Ordered most to least severe, and
 * deliberately few — a list of nine warnings is a list nobody reads.
 */
function assessRisks(facts: EventFacts, now: Date): EventRisk[] {
  const { event } = facts;
  const risks: EventRisk[] = [];
  const days = daysUntil(event.date, now);
  const isLive = event.status === "published" || event.status === "draft";
  const upcoming = isLive && days !== null && days >= 0;

  if (!upcoming) return risks;

  const overdue = facts.checklist.filter((item) => !item.completed && item.dueDate !== null && new Date(item.dueDate) < now);
  if (overdue.length > 0) {
    risks.push({
      level: days <= 14 ? "urgent" : "watch",
      message:
        overdue.length === 1
          ? `“${overdue[0]!.title}” is overdue`
          : `${overdue.length} tasks overdue, including “${overdue[0]!.title}”`,
      section: "plan",
    });
  }

  const pendingVendors = facts.vendors.filter((v) => v.status === "pending");
  if (pendingVendors.length > 0 && days <= 21) {
    const categories = [...new Set(pendingVendors.map((v) => v.vendor?.category ?? "A vendor"))];
    risks.push({
      level: days <= 10 ? "urgent" : "watch",
      message: `${listPhrase(categories)} still unconfirmed, ${describeWhen(event.date, now)}`,
      section: "suppliers",
    });
  }

  if (event.status === "draft" && days <= 30) {
    risks.push({
      level: days <= 14 ? "urgent" : "watch",
      message: `Still a draft and it starts ${describeWhen(event.date, now)}`,
      section: "overview",
    });
  }

  if (event.capacity !== null && event.capacity > 0 && event.registrationCount > event.capacity) {
    risks.push({
      level: "urgent",
      message: `${event.registrationCount} registered against ${event.capacity} places — oversubscribed by ${event.registrationCount - event.capacity}`,
      section: "people",
    });
  }

  const expenses = facts.budget.filter((item) => item.type === "expense");
  const planned = sumCents(expenses.map((item) => item.estimatedCents));
  const spent = sumCents(expenses.map((item) => item.actualCents));
  if (planned > 0 && spent > planned) {
    const overBy = Math.round(((spent - planned) / planned) * 100);
    risks.push({
      level: overBy >= 10 ? "urgent" : "watch",
      message: `Spend is ${overBy}% over the plan`,
      section: "money",
    });
  }

  const soldOut = facts.tickets.filter((t) => t.isActive && t.quantityTotal > 0 && t.quantitySold >= t.quantityTotal);
  if (soldOut.length > 0) {
    risks.push({
      level: "watch",
      message: soldOut.length === 1 ? `${soldOut[0]!.name} is sold out` : `${soldOut.length} ticket types sold out`,
      section: "money",
    });
  }

  const order: Record<EventRisk["level"], number> = { urgent: 0, watch: 1, clear: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
}

export function computeEventHealth(facts: EventFacts, now: Date = new Date()): EventHealth {
  const { event } = facts;
  const checklistTotal = facts.checklist.length;
  const checklistDone = facts.checklist.filter((item) => item.completed).length;
  const vendorsTotal = facts.vendors.length;
  const vendorsConfirmed = facts.vendors.filter((v) => v.status === "confirmed").length;
  const capacityFilled =
    event.capacity !== null && event.capacity > 0 ? pct(event.registrationCount, event.capacity) : null;
  const expenses = facts.budget.filter((item) => item.type === "expense");

  return {
    eventId: event.id,
    daysUntil: daysUntil(event.date, now),
    readiness: readinessScore({ checklistDone, checklistTotal, vendorsConfirmed, vendorsTotal, capacityFilled }),
    checklistDone,
    checklistTotal,
    vendorsConfirmed,
    vendorsTotal,
    capacityFilled,
    budgetPlannedCents: sumCents(expenses.map((item) => item.estimatedCents)),
    budgetSpentCents: sumCents(expenses.map((item) => item.actualCents)),
    ticketRevenueCents: ticketRevenueCents(facts.tickets),
    fundraisingCents: fundraisingCents(facts.sponsorships, facts.auction, facts.raffle),
    risks: assessRisks(facts, now),
  };
}

/**
 * Flattens per-event risks into one ranked worklist. Urgency dominates, then proximity,
 * so "catering unconfirmed, 6 days out" outranks "over budget, 2 months out".
 */
export function buildAttention(events: Event[], healths: EventHealth[]): AttentionItem[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const items: AttentionItem[] = [];

  for (const health of healths) {
    const event = eventById.get(health.eventId);
    if (!event) continue;
    for (const [index, risk] of health.risks.entries()) {
      const proximity = health.daysUntil ?? 999;
      items.push({
        id: `${health.eventId}:${risk.section}:${index}`,
        eventId: health.eventId,
        eventTitle: event.title,
        level: risk.level,
        message: risk.message,
        section: risk.section,
        weight: (risk.level === "urgent" ? 0 : 1000) + Math.max(proximity, 0),
      });
    }
  }

  return items.sort((a, b) => a.weight - b.weight);
}

export interface PortfolioFacts {
  events: Event[];
  registrations: Registration[];
  attendeeCount: number;
  locationCount: number;
  vendorCount: number;
  budget: BudgetItem[];
  tickets: TicketType[];
  sponsorships: Sponsorship[];
  auction: AuctionItem[];
  raffle: RaffleItem[];
}

export function computePortfolio(facts: PortfolioFacts, now: Date = new Date()): PortfolioSummary {
  const live = facts.events.filter((e) => e.status !== "cancelled");
  const upcoming = live.filter((e) => {
    const days = daysUntil(e.date, now);
    return days !== null && days >= 0 && e.status !== "completed";
  });
  const expenses = facts.budget.filter((item) => item.type === "expense");

  return {
    eventsTotal: facts.events.length,
    eventsUpcoming: upcoming.length,
    eventsThisWeek: upcoming.filter((e) => (daysUntil(e.date, now) ?? 999) <= 7).length,
    attendeesTotal: facts.attendeeCount,
    registrationsConfirmed: facts.registrations.filter((r) => r.status === "confirmed").length,
    registrationsPending: facts.registrations.filter((r) => r.status === "pending").length,
    locationsTotal: facts.locationCount,
    vendorsTotal: facts.vendorCount,
    budgetPlannedCents: sumCents(expenses.map((item) => item.estimatedCents)),
    budgetSpentCents: sumCents(expenses.map((item) => item.actualCents)),
    revenueCents:
      ticketRevenueCents(facts.tickets) + fundraisingCents(facts.sponsorships, facts.auction, facts.raffle),
  };
}
