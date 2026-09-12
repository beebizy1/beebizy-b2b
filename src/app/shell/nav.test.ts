import { describe, expect, it } from "vitest";
import { isAppPathAllowed, isNavActive, NAV_ITEMS, visibleEventTabs, visibleNavItems } from "./nav";

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

  it("shows the feedback inbox only to approved reviewers", () => {
    expect(visibleNavItems(false)).toEqual(NAV_ITEMS);
    expect(visibleNavItems(true).at(-1)).toMatchObject({ label: "Pilot feedback", href: "/app/feedback" });
  });

  it("removes team and enterprise destinations from the Solo plan", () => {
    expect(visibleNavItems(false, "solo").map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["Locations", "Vendors", "Messages", "Reporting"]),
    );
    expect(visibleNavItems(false, "team").map((item) => item.label)).toContain("Vendors");
    expect(visibleNavItems(false, "team").map((item) => item.label)).not.toContain("Reporting");
    expect(visibleEventTabs("solo").map((item) => item.label)).not.toContain("Contingency");
    expect(visibleEventTabs("team").map((item) => item.label)).toContain("Contingency");
  });

  it("shows only the Santa Clara pilot workflow for that workspace experience", () => {
    expect(visibleNavItems(false, "enterprise", "santa-clara").map((item) => item.label)).toEqual([
      "Dashboard",
      "Events",
      "Import spreadsheet",
    ]);
    expect(visibleEventTabs("enterprise", "santa-clara").map((item) => item.label)).toEqual([
      "Run of Show",
      "Checklist",
      "Budget",
      "Floorplan",
      "Registrations",
      "Check-in",
      "Volunteers",
    ]);
    expect(isAppPathAllowed("/app/events/event-1/checklist", "santa-clara")).toBe(true);
    expect(isAppPathAllowed("/app/plan", "santa-clara")).toBe(true);
    expect(isAppPathAllowed("/app/vendors", "santa-clara")).toBe(false);
    expect(isAppPathAllowed("/app/fundraising", "santa-clara")).toBe(false);
  });
});
