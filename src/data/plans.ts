export const PLAN_IDS = ["solo", "team", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
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
  solo: ["corePlanning"],
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
  year: "beebizy_solo_annual",
};

export const SOLO_PRICE_OPTIONS: Record<
  BillingInterval,
  { amountCents: number; currency: "usd"; display: string }
> = {
  month: { amountCents: 7_900, currency: "usd", display: "$79" },
  year: { amountCents: 59_900, currency: "usd", display: "$599" },
};
