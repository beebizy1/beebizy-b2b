import { describe, expect, it } from "vitest";
import { eventTabsForEvent, isAppPathAllowed, isNavActive, NAV_ITEMS, orderedEventTabs, visibleEventTabs, visibleNavItems } from "./nav";

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

  it("keeps internal activity and feedback out of customer navigation, including staff demos", () => {
    expect(visibleNavItems(false)).toEqual(NAV_ITEMS);
    expect(visibleNavItems(true)).toEqual(NAV_ITEMS);
    expect(visibleNavItems(true).some(item=>item.href.includes("admin")||item.href.includes("feedback"))).toBe(false);
  });
  it("applies organization tool settings while keeping Overview and planner labels separate",()=>{
    const profile={kind:"organization" as const,experience:"standard" as const,eventTabs:["vendors","budget","deposits"] as const};
    expect(visibleEventTabs("enterprise","standard",{...profile,eventTabs:[...profile.eventTabs]}).map(t=>t.label)).toEqual(["Overview","Vendors","Budget","Payments/Deposits"]);
    expect(visibleEventTabs("enterprise","standard",{...profile,eventTabs:[]}).map(t=>t.id)).toEqual(["overview"]);
    expect(visibleEventTabs("enterprise","standard",{...profile,kind:"planner",eventTabs:["budget"]})[1]?.label).toBe("Budget & Return");
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

  it("shows only the Santa Clara pilot workflow for that account experience", () => {
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
      "Vendors",
    ]);
    expect(isAppPathAllowed("/app/events/event-1/checklist", "santa-clara")).toBe(true);
    expect(isAppPathAllowed("/app/plan", "santa-clara")).toBe(true);
    expect(isAppPathAllowed("/app/vendors", "santa-clara")).toBe(false);
    expect(isAppPathAllowed("/app/vendors/vendor-1", "santa-clara")).toBe(true);
    expect(isAppPathAllowed("/app/fundraising", "santa-clara")).toBe(false);
  });

  it("applies a saved tab order without losing new, unavailable, or duplicate tabs", () => {
    const tabs = visibleEventTabs("enterprise");
    const reordered = orderedEventTabs(tabs, ["vendors", "volunteers", "vendors", "share"]);
    expect(reordered.slice(0, 2).map((tab) => tab.id)).toEqual(["vendors", "volunteers"]);
    expect(new Set(reordered.map((tab) => tab.id)).size).toBe(tabs.length);
    expect(reordered).toHaveLength(tabs.length);
    expect(reordered.some((tab) => tab.id === "overview")).toBe(true);
  });

  it("hides event-specific tabs without ever removing Overview", () => {
    const tabs = visibleEventTabs("enterprise");
    const visible = eventTabsForEvent(tabs, ["raffle", "silent-auction", "overview", "unknown"]);

    expect(visible.map((tab) => tab.id)).not.toEqual(expect.arrayContaining(["raffle", "silent-auction"]));
    expect(visible[0]?.id).toBe("overview");
  });
});
