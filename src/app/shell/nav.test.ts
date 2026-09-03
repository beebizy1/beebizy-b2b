import { describe, expect, it } from "vitest";
import { isNavActive, NAV_ITEMS } from "./nav";

describe("product navigation", () => {
  it("lists the twelve destinations in the reference order", () => {
    expect(NAV_ITEMS.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Dashboard", href: "/app" },
      { label: "Plan an event", href: "/app/plan" },
      { label: "Calendar", href: "/app/calendar" },
      { label: "Events", href: "/app/events" },
      { label: "Templates", href: "/app/templates" },
      { label: "Locations", href: "/app/locations" },
      { label: "Vendors", href: "/app/vendors" },
      { label: "Messages", href: "/app/messages" },
      { label: "Attendees", href: "/app/attendees" },
      { label: "Registrations", href: "/app/registrations" },
      { label: "Reporting", href: "/app/reporting" },
      { label: "Historical Data", href: "/app/history" },
    ]);
  });

  it("does not mark Calendar and Events active at the same time", () => {
    expect(isNavActive("/app/calendar", "/app/calendar")).toBe(true);
    expect(isNavActive("/app/events", "/app/calendar")).toBe(false);
    expect(isNavActive("/app/events", "/app/events/event_123")).toBe(true);
  });

  it("keeps Dashboard inactive on every other destination", () => {
    expect(isNavActive("/app", "/app")).toBe(true);
    expect(isNavActive("/app", "/app/locations")).toBe(false);
  });
});
