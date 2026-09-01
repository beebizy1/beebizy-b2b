import { describe, expect, it } from "vitest";
import type { Event } from "./entities";
import {
  buildBudgetSuggestions,
  buildRuleBasedSuggestions,
  marketplaceSearchUrl,
  moodConceptDataUrl,
  suggestedTotalBudgetCents,
  type PastEventPlanningRecord,
} from "./planner";

const event: Event = {
  id: "event-1",
  ownerId: "owner-1",
  title: "Design Partner Summit",
  description: null,
  date: "2026-10-20T16:00:00.000Z",
  endDate: null,
  location: "Los Angeles",
  locationId: null,
  locationRecord: null,
  capacity: 200,
  status: "draft",
  category: "Summit",
  imageUrl: null,
  registrationCount: 0,
  shareToken: null,
  createdAt: "2026-08-27T00:00:00.000Z",
};

describe("planning suggestions", () => {
  it("suggests $70k for 200 guests", () => {
    expect(suggestedTotalBudgetCents(200)).toBe(7_000_000);
  });

  it("allocates every cent of the requested budget", () => {
    const lines = buildBudgetSuggestions(7_000_000);
    expect(lines.map((line) => line.name).slice(0, 3)).toEqual(["Venue", "Catering", "Entertainment"]);
    expect(lines.slice(0, 3).map((line) => line.estimatedCents)).toEqual([3_000_000, 1_000_000, 500_000]);
    expect(lines.reduce((sum, line) => sum + line.estimatedCents, 0)).toBe(7_000_000);
  });

  it("builds a complete reviewable plan", () => {
    const plan = buildRuleBasedSuggestions(event, {
      eventId: event.id,
      headcount: 200,
      totalBudgetCents: 7_000_000,
      theme: "Future of community",
    });

    expect(plan.budget.length).toBeGreaterThanOrEqual(7);
    expect(plan.checklist.length).toBeGreaterThanOrEqual(6);
    expect(plan.runOfShow.length).toBeGreaterThanOrEqual(6);
    expect(plan.moodConcepts).toHaveLength(3);
    expect(plan.vendors.every((vendor) => vendor.marketplaceUrl.startsWith("https://app.beebizy.com/"))).toBe(true);
  });

  it("adapts the plan from similar completed events in the same workspace", () => {
    const memory: PastEventPlanningRecord[] = [{
      event: {
        ...event,
        id: "past-summit",
        title: "Leadership Summit 2025",
        status: "completed",
        capacity: 220,
        date: "2025-10-20T16:00:00.000Z",
      },
      budget: [
        { name: "Venue", category: "Venue", type: "expense", estimatedCents: 2_800_000, actualCents: 4_000_000 },
        { name: "Catering", category: "Catering", type: "expense", estimatedCents: 1_800_000, actualCents: 2_000_000 },
      ],
      checklist: [
        { title: "Confirm speaker releases", category: "Programme", dueDaysBefore: 14 },
      ],
      runOfShow: [
        { startTime: "08:00", duration: 45, title: "Executive rehearsal", responsible: "Production" },
        { startTime: "09:00", duration: 30, title: "Guest arrival", responsible: "Guest experience" },
      ],
      moodCaptions: ["Warm editorial stage with honey lighting"],
      floorplanShapes: ["stage", "round-table", "av"],
    }];

    const plan = buildRuleBasedSuggestions(
      event,
      { eventId: event.id, headcount: 200, totalBudgetCents: 7_000_000, theme: "Future of community" },
      memory,
    );

    expect(plan.learning).toMatchObject({ eventCount: 1, eventTitles: ["Leadership Summit 2025"] });
    expect(plan.checklist.some((item) => item.title === "Confirm speaker releases")).toBe(true);
    expect(plan.runOfShow.some((item) => item.title === "Executive rehearsal")).toBe(true);
    expect(plan.budget.find((item) => item.category === "Venue")!.estimatedCents).toBeGreaterThan(3_000_000);
    expect(plan.budget.reduce((sum, item) => sum + item.estimatedCents, 0)).toBe(7_000_000);
  });

  it("encodes marketplace searches and mood-board artwork safely", () => {
    expect(marketplaceSearchUrl("DJ & music")).toContain("DJ%20%26%20music");
    expect(moodConceptDataUrl({
      name: "Black & Gold",
      description: "",
      palette: ["#000000", "#F7B500", "#FFF4D6", "#FFFFFF"],
      keywords: [],
    })).toMatch(/^data:image\/svg\+xml/);
  });
});
