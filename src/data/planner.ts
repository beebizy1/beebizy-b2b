import type { BudgetItemDraft, ChecklistItemDraft, Event, FloorplanShape, RunOfShowItemDraft } from "./entities";

export interface PlanningBrief {
  eventId: string;
  headcount: number;
  totalBudgetCents: number;
  theme: string;
}

export interface SuggestedBudgetLine extends BudgetItemDraft {
  rationale: string;
}

export interface SuggestedChecklistItem extends ChecklistItemDraft {
  dueDaysBefore: number;
}

export interface MoodConcept {
  name: string;
  description: string;
  palette: [string, string, string, string];
  keywords: string[];
}

export interface VendorSuggestion {
  category: string;
  searchQuery: string;
  why: string;
  marketplaceUrl: string;
}

export interface PlanningSuggestions {
  source: "ai" | "rules";
  summary: string;
  headcount: number;
  totalBudgetCents: number;
  budget: SuggestedBudgetLine[];
  checklist: SuggestedChecklistItem[];
  runOfShow: RunOfShowItemDraft[];
  moodConcepts: MoodConcept[];
  vendors: VendorSuggestion[];
  learning: PlanningLearning | null;
}

export interface PlanningLearning {
  eventCount: number;
  eventTitles: string[];
  explanation: string;
  signals: string[];
}

export interface PastEventPlanningRecord {
  event: Event;
  budget: Array<BudgetItemDraft & { actualCents?: number | null }>;
  checklist: Array<ChecklistItemDraft & { dueDaysBefore: number }>;
  runOfShow: RunOfShowItemDraft[];
  moodCaptions: string[];
  floorplanShapes: FloorplanShape[];
}

export const PLANNING_LIMITS = {
  minHeadcount: 1,
  maxHeadcount: 100_000,
  minBudgetCents: 100,
  maxBudgetCents: 100_000_000_000,
  maxThemeLength: 300,
} as const;

const BUDGET_WEIGHTS = [
  { name: "Venue", category: "Venue", allocationUnits: 30, rationale: "Space, permits, insurance and venue operations." },
  { name: "Catering", category: "Catering", allocationUnits: 10, rationale: "Food, beverage, service and dietary coverage." },
  { name: "Entertainment", category: "Entertainment", allocationUnits: 5, rationale: "Talent, music and attendee experience." },
  { name: "Production & AV", category: "AV", allocationUnits: 10, rationale: "Sound, lighting, staging and technical support." },
  { name: "Staffing", category: "Staffing", allocationUnits: 6, rationale: "Registration, security and event-day support." },
  { name: "Decor & branding", category: "Decor", allocationUnits: 4, rationale: "Wayfinding, visual identity and atmosphere." },
  { name: "Contingency", category: "General", allocationUnits: 5, rationale: "A protected reserve for late changes and surprises." },
] as const;

const BUDGET_ALLOCATION_UNITS = BUDGET_WEIGHTS.reduce((sum, line) => sum + line.allocationUnits, 0);

const FALLBACK_PALETTES: MoodConcept["palette"][] = [
  ["#6F5328", "#F7B500", "#FFF4D6", "#FFFFFF"],
  ["#183153", "#61A5C2", "#E9F5F9", "#F7C59F"],
  ["#4A2545", "#D17A22", "#F4E3C1", "#2E4057"],
];

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function addMinutes(time: string, minutes: number): string {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function minutesFromTime(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function eventStartTime(event: Event): string {
  const start = new Date(event.date);
  return Number.isNaN(start.getTime())
    ? "09:00"
    : `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function selectSimilarPastEvents(
  event: Event,
  records: PastEventPlanningRecord[],
  limit = 5,
): PastEventPlanningRecord[] {
  return records
    .filter((record) => record.event.status === "completed" && record.event.id !== event.id)
    .sort((left, right) => {
      const category = Number(left.event.category !== event.category) - Number(right.event.category !== event.category);
      if (category !== 0) return category;
      const targetCapacity = event.capacity ?? 0;
      const leftDistance = Math.abs((left.event.capacity ?? targetCapacity) - targetCapacity);
      const rightDistance = Math.abs((right.event.capacity ?? targetCapacity) - targetCapacity);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return new Date(right.event.date).getTime() - new Date(left.event.date).getTime();
    })
    .slice(0, limit);
}

function learnedBudget(totalBudgetCents: number, baseline: SuggestedBudgetLine[], records: PastEventPlanningRecord[]): SuggestedBudgetLine[] {
  const historicalShares = new Map<string, { total: number; events: number }>();
  for (const record of records) {
    const expenses = record.budget.filter((line) => line.type === "expense");
    const eventTotal = expenses.reduce((sum, line) => sum + (line.actualCents ?? line.estimatedCents), 0);
    if (eventTotal <= 0) continue;
    const eventShares = new Map<string, number>();
    for (const line of expenses) {
      const category = line.category ?? "General";
      eventShares.set(category, (eventShares.get(category) ?? 0) + (line.actualCents ?? line.estimatedCents) / eventTotal);
    }
    for (const [category, share] of eventShares) {
      const aggregate = historicalShares.get(category) ?? { total: 0, events: 0 };
      aggregate.total += share;
      aggregate.events += 1;
      historicalShares.set(category, aggregate);
    }
  }
  if (historicalShares.size === 0) return baseline;

  const baselineShares = new Map(baseline.map((line) => [line.category ?? "General", line.estimatedCents / totalBudgetCents]));
  const orderedCategories = [...baseline.map((line) => line.category ?? "General")];
  for (const category of historicalShares.keys()) if (!orderedCategories.includes(category)) orderedCategories.push(category);
  const rawWeights = orderedCategories.map((category) => {
    const historical = historicalShares.get(category);
    const historicalShare = historical ? historical.total / historical.events : 0;
    return (baselineShares.get(category) ?? 0) * 0.45 + historicalShare * 0.55;
  });
  const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  return orderedCategories.map((category, index) => {
    const original = baseline.find((line) => line.category === category);
    const estimatedCents = index === orderedCategories.length - 1
      ? totalBudgetCents - allocated
      : Math.round((totalBudgetCents * (rawWeights[index] ?? 0)) / weightTotal);
    allocated += estimatedCents;
    return {
      name: original?.name ?? category,
      category,
      type: "expense",
      estimatedCents,
      notes: original?.notes ?? `Allocation observed in similar completed events.`,
      rationale: original
        ? `${original.rationale} Adjusted using actual spending from similar completed events.`
        : "Included because this category appeared in similar completed events.",
      sortOrder: index,
    };
  });
}

function learnedChecklist(
  fallback: SuggestedChecklistItem[],
  records: PastEventPlanningRecord[],
): SuggestedChecklistItem[] {
  const candidates = new Map<string, { item: PastEventPlanningRecord["checklist"][number]; count: number }>();
  for (const record of records) {
    for (const item of record.checklist) {
      const key = normalizedTitle(item.title);
      if (!key) continue;
      const existing = candidates.get(key);
      if (existing) existing.count += 1;
      else candidates.set(key, { item, count: 1 });
    }
  }
  const learned = [...candidates.values()]
    .sort((left, right) => right.count - left.count || right.item.dueDaysBefore - left.item.dueDaysBefore)
    .slice(0, 4)
    .map(({ item }, index): SuggestedChecklistItem => ({
      ...item,
      description: item.description ?? "Recommended from a similar completed event.",
      sortOrder: index,
    }));
  const seen = new Set(learned.map((item) => normalizedTitle(item.title)));
  return [...learned, ...fallback.filter((item) => !seen.has(normalizedTitle(item.title)))]
    .slice(0, 12)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

function learnedRunOfShow(event: Event, fallback: RunOfShowItemDraft[], records: PastEventPlanningRecord[]): RunOfShowItemDraft[] {
  const closest = records[0];
  if (!closest || closest.runOfShow.length === 0) return fallback;
  const shift = minutesFromTime(eventStartTime(event)) - minutesFromTime(eventStartTime(closest.event));
  const learned = closest.runOfShow.map((cue) => ({ ...cue, startTime: addMinutes(cue.startTime, shift) }));
  const seen = new Set(learned.map((cue) => normalizedTitle(cue.title)));
  return [...learned, ...fallback.filter((cue) => !seen.has(normalizedTitle(cue.title)))]
    .slice(0, 12)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .map((cue, index) => ({ ...cue, sortOrder: index }));
}

export function suggestedTotalBudgetCents(headcount: number): number {
  return clampInteger(headcount, PLANNING_LIMITS.minHeadcount, PLANNING_LIMITS.maxHeadcount) * 35_000;
}

export function buildBudgetSuggestions(totalBudgetCents: number): SuggestedBudgetLine[] {
  const total = clampInteger(totalBudgetCents, PLANNING_LIMITS.minBudgetCents, PLANNING_LIMITS.maxBudgetCents);
  let allocated = 0;

  return BUDGET_WEIGHTS.map((line, index) => {
    const estimatedCents =
      index === BUDGET_WEIGHTS.length - 1
        ? total - allocated
        : Math.round((total * line.allocationUnits) / BUDGET_ALLOCATION_UNITS);
    allocated += estimatedCents;
    return {
      name: line.name,
      category: line.category,
      type: "expense",
      estimatedCents,
      notes: line.rationale,
      rationale: line.rationale,
      sortOrder: index,
    };
  });
}

export function marketplaceSearchUrl(query: string): string {
  return `https://app.beebizy.com/client-app/search-v2?q=${encodeURIComponent(query.trim())}`;
}

export function buildRuleBasedSuggestions(
  event: Event,
  brief: PlanningBrief,
  pastEvents: PastEventPlanningRecord[] = [],
): PlanningSuggestions {
  const theme = brief.theme.trim() || `${event.category} with a polished, welcoming feel`;
  const headcount = clampInteger(
    brief.headcount || event.capacity || PLANNING_LIMITS.minHeadcount,
    PLANNING_LIMITS.minHeadcount,
    PLANNING_LIMITS.maxHeadcount,
  );
  const totalBudgetCents = clampInteger(
    brief.totalBudgetCents || suggestedTotalBudgetCents(headcount),
    PLANNING_LIMITS.minBudgetCents,
    PLANNING_LIMITS.maxBudgetCents,
  );
  const startTime = eventStartTime(event);

  const checklist: SuggestedChecklistItem[] = [
    { title: "Confirm venue contract and access times", category: "Venue", dueDaysBefore: 60 },
    { title: `Lock catering quantities for ${headcount} guests`, category: "Catering", dueDaysBefore: 30 },
    { title: "Approve production, AV and power plan", category: "AV", dueDaysBefore: 21 },
    { title: "Confirm entertainment and usage rights", category: "Programme", dueDaysBefore: 21 },
    { title: "Finalize guest communications and registration staffing", category: "Marketing", dueDaysBefore: 14 },
    { title: "Run event-day safety and contingency review", category: "Compliance", dueDaysBefore: 7 },
    { title: "Send final run of show to every owner and vendor", category: "Logistics", dueDaysBefore: 3 },
  ].map((item, index) => ({ ...item, sortOrder: index }));

  const runOfShow: RunOfShowItemDraft[] = [
    { startTime: addMinutes(startTime, -90), duration: 60, title: "Vendor load-in and production check", responsible: "Production", description: "Confirm access, power, sound, lighting and safety." },
    { startTime: addMinutes(startTime, -30), duration: 30, title: "Team briefing and doors ready", responsible: "Event lead", description: "Review roles, escalation path and guest arrival plan." },
    { startTime, duration: 30, title: "Guest arrival and registration", responsible: "Guest experience", description: `Welcome and check in up to ${headcount} guests.` },
    { startTime: addMinutes(startTime, 30), duration: 20, title: "Opening and event orientation", responsible: "Host", description: "Set expectations, acknowledge partners and frame the experience." },
    { startTime: addMinutes(startTime, 50), duration: 90, title: "Main program", responsible: "Program lead", description: `Deliver the core ${event.category.toLowerCase()} content.` },
    { startTime: addMinutes(startTime, 140), duration: 45, title: "Break, networking and reset", responsible: "Guest experience", description: "Refresh catering and prepare the closing sequence." },
    { startTime: addMinutes(startTime, 185), duration: 45, title: "Closing program and next steps", responsible: "Host", description: "Close the loop on outcomes and calls to action." },
    { startTime: addMinutes(startTime, 230), duration: 60, title: "Guest departure and vendor strike", responsible: "Operations", description: "Complete departure, inventory and venue handback." },
  ].map((item, index) => ({ ...item, sortOrder: index }));

  const moodConcepts: MoodConcept[] = ["Signature", "Editorial", "Immersive"].map((name, index) => ({
    name: `${theme}: ${name}`,
    description: [
      `A confident primary interpretation of ${theme}, with clear branding and warm focal lighting.`,
      `A restrained, photographic interpretation of ${theme}, using layered neutrals and precise details.`,
      `A high-energy interpretation of ${theme}, using dramatic scale, contrast and guest interaction.`,
    ][index],
    palette: FALLBACK_PALETTES[index],
    keywords: [theme, name.toLowerCase(), event.category.toLowerCase()],
  }));

  const vendors = [
    { category: "Venue", searchQuery: "event venue", why: "Compare spaces that fit the headcount and production footprint." },
    { category: "Catering", searchQuery: "catering", why: "Source food and beverage options sized to the guest count." },
    { category: "AV & Tech", searchQuery: "AV equipment", why: "Cover sound, lighting, staging and technical labor." },
    { category: "Entertainment", searchQuery: "DJ music entertainment", why: "Match the energy and theme of the guest experience." },
  ].map((item) => ({ ...item, marketplaceUrl: marketplaceSearchUrl(item.searchQuery) }));

  const similarEvents = selectSimilarPastEvents(event, pastEvents);
  const baselineBudget = buildBudgetSuggestions(totalBudgetCents);
  const learned = similarEvents.length > 0;
  const learning: PlanningLearning | null = learned
    ? {
        eventCount: similarEvents.length,
        eventTitles: similarEvents.map((record) => record.event.title),
        explanation: `Recommendations use patterns from ${similarEvents.length} similar completed ${similarEvents.length === 1 ? "event" : "events"} in this workspace.`,
        signals: [
          `${similarEvents.filter((record) => record.budget.length > 0).length} budget histories`,
          `${similarEvents.reduce((sum, record) => sum + record.checklist.length, 0)} checklist items`,
          `${similarEvents.reduce((sum, record) => sum + record.runOfShow.length, 0)} run-of-show cues`,
          `${similarEvents.reduce((sum, record) => sum + record.moodCaptions.length, 0)} mood references`,
          `${similarEvents.reduce((sum, record) => sum + record.floorplanShapes.length, 0)} floorplan objects`,
        ],
      }
    : null;

  return {
    source: "rules",
    summary: learned
      ? `A review-ready starting plan for ${event.title}, adapted from ${similarEvents.length} similar completed ${similarEvents.length === 1 ? "event" : "events"}.`
      : `A review-ready starting plan for ${event.title}, built for ${headcount.toLocaleString()} guests and the “${theme}” direction.`,
    headcount,
    totalBudgetCents,
    budget: learnedBudget(totalBudgetCents, baselineBudget, similarEvents),
    checklist: learnedChecklist(checklist, similarEvents),
    runOfShow: learnedRunOfShow(event, runOfShow, similarEvents),
    moodConcepts,
    vendors,
    learning,
  };
}

export function moodConceptDataUrl(concept: MoodConcept): string {
  const [first, second, third, fourth] = concept.palette;
  const safeTitle = concept.name.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${fourth}"/><rect width="720" height="520" x="70" y="70" rx="48" fill="${first}"/><circle cx="900" cy="230" r="160" fill="${second}"/><rect width="540" height="180" x="580" y="500" rx="40" fill="${third}"/><text x="110" y="660" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="${first}">${safeTitle}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
