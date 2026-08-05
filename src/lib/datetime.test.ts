/**
 * The zone-aware date logic, tested from the far side of the date line.
 *
 * These cases are the ones that were silently wrong before: an event late at night, a
 * reader in a different zone, and a DST boundary. Each of them used to move a date by a
 * day, which moves "overdue" and "in 6 days" with it.
 */

import { describe, expect, it } from "vitest";

import {
  civilDayInZone,
  daysBetweenInZone,
  describeWhenInZone,
  dayNumberInZone,
  dayNumberOf,
  formatInZone,
  isSameDayInZone,
  resolveTimeZone,
} from "./datetime";

const LA = "America/Los_Angeles";
const TOKYO = "Asia/Tokyo";
const BERLIN = "Europe/Berlin";

describe("civil days", () => {
  it("reads the calendar of the zone, not of the machine", () => {
    // 2026-03-12T04:00Z is still the 11th in Los Angeles and already the 12th in Tokyo.
    const instant = new Date("2026-03-12T04:00:00Z");
    expect(civilDayInZone(instant, LA)).toEqual({ year: 2026, month: 3, day: 11 });
    expect(civilDayInZone(instant, TOKYO)).toEqual({ year: 2026, month: 3, day: 12 });
  });

  it("agrees with a calendar cell built from y/m/d", () => {
    const instant = new Date("2026-03-12T19:30:00Z");
    expect(dayNumberInZone(instant, LA)).toBe(dayNumberOf(2026, 3, 12));
  });

  it("counts whole days across a spring-forward boundary", () => {
    // US DST starts 2026-03-08. Two instants 7 days apart in wall-clock terms are only
    // 167 hours apart; subtracting instants would give 6.96 days and round wrong.
    const before = new Date("2026-03-05T20:00:00Z"); /* 12:00 PST */
    const after = new Date("2026-03-12T19:00:00Z"); /* 12:00 PDT */
    expect(daysBetweenInZone(after, LA, before)).toBe(7);
  });

  it("counts whole days across a fall-back boundary", () => {
    const before = new Date("2026-10-29T19:00:00Z"); /* 12:00 PDT */
    const after = new Date("2026-11-05T20:00:00Z"); /* 12:00 PST */
    expect(daysBetweenInZone(after, LA, before)).toBe(7);
  });

  it("puts a late-night event on the day the team is running it", () => {
    // A gala starting 11pm in Los Angeles is already tomorrow in UTC — which is the zone
    // a Vercel function runs in.
    const gala = new Date("2026-06-12T06:30:00Z"); /* 11:30 PM PDT on the 11th */
    const duringTheDay = new Date("2026-06-11T20:00:00Z"); /* 1 PM PDT on the 11th */
    expect(isSameDayInZone(gala, LA, duringTheDay)).toBe(true);
    expect(isSameDayInZone(gala, "UTC", duringTheDay)).toBe(false);
    expect(describeWhenInZone(gala, LA, duringTheDay)).toBe("today");
    expect(describeWhenInZone(gala, "UTC", duringTheDay)).toBe("tomorrow");
  });

  it("returns null rather than NaN for an unparseable date", () => {
    expect(daysBetweenInZone("not a date", LA)).toBeNull();
    expect(daysBetweenInZone(null, LA)).toBeNull();
    expect(describeWhenInZone(undefined, LA)).toBe("date unknown");
  });
});

describe("formatting", () => {
  const instant = new Date("2026-03-12T02:30:00Z");

  it("renders the same instant differently in each zone", () => {
    /* 02:30Z is 7:30 PM PDT the previous evening, 11:30 AM in Tokyo, 3:30 AM in Berlin. */
    expect(formatInZone(instant, LA, "dayMonthYearTime")).toBe("Mar 11, 2026, 7:30 PM");
    expect(formatInZone(instant, TOKYO, "dayMonthYearTime")).toBe("Mar 12, 2026, 11:30 AM");
    expect(formatInZone(instant, BERLIN, "dayMonthYearTime")).toBe("Mar 12, 2026, 3:30 AM");
  });

  it("uses an em dash for a missing date instead of Invalid Date", () => {
    expect(formatInZone(null, LA)).toBe("—");
    expect(formatInZone("", LA)).toBe("—");
    expect(formatInZone("nope", LA)).toBe("—");
  });
});

describe("resolveTimeZone", () => {
  it("keeps a valid zone", () => {
    expect(resolveTimeZone(LA)).toBe(LA);
  });

  it("falls back rather than throwing on a zone Intl doesn't know", () => {
    // A stale stored preference must not be able to take a screen down.
    const resolved = resolveTimeZone("Mars/Olympus_Mons");
    expect(resolved).not.toBe("Mars/Olympus_Mons");
    expect(() => formatInZone(new Date(), "Mars/Olympus_Mons")).not.toThrow();
  });

  it("falls back when the preference is empty", () => {
    expect(resolveTimeZone("")).toBe(resolveTimeZone(null));
  });
});
