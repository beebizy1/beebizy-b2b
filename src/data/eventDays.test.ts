import { describe, expect, it } from "vitest";
import { compareRunOfShowItems, eventDayCount, eventDayOptions, formatEventDayLabel } from "./eventDays";

describe("multi-day events", () => {
  it("counts the venue's calendar days inclusively", () => {
    expect(
      eventDayCount(
        "2026-10-10T16:00:00.000Z",
        "2026-10-12T23:00:00.000Z",
        "America/Los_Angeles",
      ),
    ).toBe(3);
    expect(eventDayCount("2026-10-10T16:00:00.000Z", null, "America/Los_Angeles")).toBe(1);
  });

  it("builds one numbered option for each conference day", () => {
    expect(
      eventDayOptions(
        "2026-10-10T16:00:00.000Z",
        "2026-10-12T23:00:00.000Z",
        "America/Los_Angeles",
      ),
    ).toEqual([
      { dayNumber: 1, civilDate: "2026-10-10" },
      { dayNumber: 2, civilDate: "2026-10-11" },
      { dayNumber: 3, civilDate: "2026-10-12" },
    ]);
  });

  it("keeps scheduled days visible if the event end date is shortened", () => {
    expect(
      eventDayOptions("2026-10-10T16:00:00.000Z", null, "America/Los_Angeles", 3).map(
        (day) => day.dayNumber,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("labels each day with its number and venue date", () => {
    expect(formatEventDayLabel({ dayNumber: 2, civilDate: "2026-10-11" }, "en-US")).toBe(
      "Day 2 · Sun, Oct 11",
    );
  });

  it("orders schedule cues by day, time, then their saved position", () => {
    const cues = [
      { dayNumber: 2, startTime: "09:00", sortOrder: 0 },
      { dayNumber: 1, startTime: "10:00", sortOrder: 0 },
      { dayNumber: 1, startTime: "09:00", sortOrder: 2 },
      { dayNumber: 1, startTime: "09:00", sortOrder: 1 },
    ];

    expect(cues.sort(compareRunOfShowItems)).toEqual([
      { dayNumber: 1, startTime: "09:00", sortOrder: 1 },
      { dayNumber: 1, startTime: "09:00", sortOrder: 2 },
      { dayNumber: 1, startTime: "10:00", sortOrder: 0 },
      { dayNumber: 2, startTime: "09:00", sortOrder: 0 },
    ]);
  });
});
