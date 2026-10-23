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

export interface EventNavigationSettings {
  hiddenTabIds: HideableEventTabId[];
}

export const DEFAULT_EVENT_NAVIGATION: EventNavigationSettings = { hiddenTabIds: [] };

export function normalizeEventNavigation(value: unknown): EventNavigationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_EVENT_NAVIGATION };
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.hiddenTabIds)) return { ...DEFAULT_EVENT_NAVIGATION };
  const allowed = new Set<string>(HIDEABLE_EVENT_TAB_IDS);
  return {
    hiddenTabIds: [...new Set(input.hiddenTabIds.filter((id): id is HideableEventTabId => typeof id === "string" && allowed.has(id)))],
  };
}
