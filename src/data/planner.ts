import type { BudgetItemDraft, ChecklistItemDraft, Event, RunOfShowItemDraft } from "./entities";

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
  ["#171717", "#F7B500", "#FFF4D6", "#FFFFFF"],
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

export function buildRuleBasedSuggestions(event: Event, brief: PlanningBrief): PlanningSuggestions {
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
  const start = new Date(event.date);
  const startTime = Number.isNaN(start.getTime())
    ? "09:00"
    : `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;

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

  return {
    source: "rules",
    summary: `A review-ready starting plan for ${event.title}, built for ${headcount.toLocaleString()} guests and the “${theme}” direction.`,
    headcount,
    totalBudgetCents,
    budget: buildBudgetSuggestions(totalBudgetCents),
    checklist,
    runOfShow,
    moodConcepts,
    vendors,
  };
}

export function moodConceptDataUrl(concept: MoodConcept): string {
  const [first, second, third, fourth] = concept.palette;
  const safeTitle = concept.name.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${fourth}"/><rect width="720" height="520" x="70" y="70" rx="48" fill="${first}"/><circle cx="900" cy="230" r="160" fill="${second}"/><rect width="540" height="180" x="580" y="500" rx="40" fill="${third}"/><text x="110" y="660" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="${first}">${safeTitle}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
