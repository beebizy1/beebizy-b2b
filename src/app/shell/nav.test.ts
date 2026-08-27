import { describe, expect, it } from "vitest";
import { isNavActive, NAV_ITEMS } from "./nav";

describe("P0 product navigation", () => {
  it("exposes planning, Dashboard, Calendar, and Events as distinct destinations", () => {
    expect(NAV_ITEMS.map(({ label, href }) => ({ label, href }))).toEqual(expect.arrayContaining([
      { label: "Dashboard", href: "/app" },
      { label: "Plan an event", href: "/app/plan" },
      { label: "Calendar", href: "/app/calendar" },
      { label: "Events", href: "/app/events" },
    ]));
  });

  it("does not mark Calendar and Events active at the same time", () => {
    expect(isNavActive("/app/calendar", "/app/calendar")).toBe(true);
    expect(isNavActive("/app/events", "/app/calendar")).toBe(false);
    expect(isNavActive("/app/events", "/app/events/event_123")).toBe(true);
  });
});
