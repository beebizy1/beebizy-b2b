export const PLAN_IDS = ["solo", "team", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ["month"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PLAN_CAPABILITIES = [
  "corePlanning",
  "collaboration",
  "vendorManagement",
  "inspirationBoards",
  "contingencyPlanning",
  "multiLocation",
  "customReporting",
] as const;
export type PlanCapability = (typeof PLAN_CAPABILITIES)[number];

const capabilities: Record<PlanId, readonly PlanCapability[]> = {
  solo: ["corePlanning", "collaboration", "inspirationBoards"],
  team: ["corePlanning", "collaboration", "vendorManagement", "inspirationBoards", "contingencyPlanning"],
  enterprise: [...PLAN_CAPABILITIES],
};
export function planHasCapability(plan: PlanId, capability: PlanCapability): boolean {
  return capabilities[plan].includes(capability);
}

export function effectivePlan(
  access: { status: string; plan?: PlanId | null } | null | undefined,
): PlanId {
  // Private-beta workspaces keep the complete product promised by the pilot. Everything
  // else fails closed to Solo until a paid or manually provisioned plan is recorded.
  if (access?.status === "beta") return "enterprise";
  return access?.plan ?? "solo";
}

export const PLAN_NAMES: Record<PlanId, string> = {
  solo: "Solo",
  team: "Team (Hive)",
  enterprise: "Enterprise (Colony)",
};

export const SOLO_PRICE_LOOKUP_KEYS: Record<BillingInterval, string> = {
  month: "beebizy_solo_monthly",
};

export const SOLO_PRICE_OPTIONS: Record<
  BillingInterval,
  { amountCents: number; currency: "usd"; display: string }
> = {
  month: { amountCents: 29_900, currency: "usd", display: "$299" },
};

/** Card details are collected at Checkout, but the first charge is delayed this many days. */
export const SOLO_TRIAL_DAYS = 90;

/**
 * What a Solo subscription actually includes.
 *
 * Solo is the only self-serve plan, and the pricing page quotes these limits directly.
 * They live here rather than in the page because the API enforces them: a limit that is
 * only ever written in marketing copy is a limit nobody is held to.
 */
export const SOLO_LIMITS = {
  teamMembers: 2,
  eventsPerYear: 3,
} as const;

/** Team is sold on unlimited events, but seats are capped. */
export const TEAM_LIMITS = {
  teamMembers: 10,
} as const;

/**
 * Seats a plan includes, or null where seats are not metered.
 *
 * Read by the API when a seat is taken - an invitation sent or a member joining - so the
 * ceiling quoted on the pricing page is the same number the database enforces.
 */
export const PLAN_SEAT_LIMITS: Record<PlanId, number | null> = {
  solo: SOLO_LIMITS.teamMembers,
  team: TEAM_LIMITS.teamMembers,
  enterprise: null,
};

export const SOLO_FEATURES = [
  "AI planner with editable checklists, mood boards and run of show",
  "Budget planning and spend tracking",
  "Event calendar and team task management",
  "Guest registration, check-in, printable lists and badges",
  "Drag-and-drop floor plan builder",
] as const;
