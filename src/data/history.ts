import type { EventHistoryChange } from "./entities";

/** Presentation text is derived once so every adapter names the same change identically. */
export function describeHistoryChange(change: EventHistoryChange): string {
  const snapshot = change.after ?? change.before;
  const label = snapshot && ["title", "name", "companyName"].map((key) => snapshot[key]).find((value) => typeof value === "string");
  const verb = change.action === "created" ? "Created" : change.action === "updated" ? "Updated" : "Deleted";
  return `${verb} ${change.resource}${label ? `: ${label}` : ""}`;
}
