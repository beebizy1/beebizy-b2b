export const HIDEABLE_EVENT_TAB_IDS = [
  "registrations",
  "check-in",
  "run-of-show",
  "checklist",
  "volunteers",
  "contingency",
  "vendors",
  "budget",
  "floorplan",
  "inspiration",
  "fundraising",
  "analytics",
  "menu",
  "tickets",
  "raffle",
  "silent-auction",
  "live-auction",
  "rfp",
  "deposits",
] as const;

export type HideableEventTabId = (typeof HIDEABLE_EVENT_TAB_IDS)[number];
export type EventNavigationTabId = "overview" | HideableEventTabId;

export interface EventNavigationSettings {
  hiddenTabIds: HideableEventTabId[];
  tabOrder: EventNavigationTabId[];
}

export const DEFAULT_EVENT_NAVIGATION: EventNavigationSettings = { hiddenTabIds: [], tabOrder: [] };

export function normalizeEventNavigation(value: unknown): EventNavigationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_EVENT_NAVIGATION };
  const input = value as Record<string, unknown>;
  const allowed = new Set<string>(HIDEABLE_EVENT_TAB_IDS);
  const ordered = new Set<string>(["overview", ...HIDEABLE_EVENT_TAB_IDS]);
  return {
    hiddenTabIds: Array.isArray(input.hiddenTabIds)
      ? [...new Set(input.hiddenTabIds.filter((id): id is HideableEventTabId => typeof id === "string" && allowed.has(id)))]
      : [],
    tabOrder: Array.isArray(input.tabOrder)
      ? [...new Set(input.tabOrder.filter((id): id is EventNavigationTabId => typeof id === "string" && ordered.has(id)))]
      : [],
  };
}
