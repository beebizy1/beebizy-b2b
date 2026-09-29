import { describe, expect, it } from "vitest";
import { selectedEventDay, type EventDayOption } from "./eventDays";

const days: EventDayOption[] = [
  { dayNumber: 1, civilDate: "2026-10-10" },
  { dayNumber: 2, civilDate: "2026-10-11" },
  { dayNumber: 3, civilDate: "2026-10-12" },
];

describe("event workspace day selection", () => {
  it("selects the day from the reactive search string", () => {
    expect(selectedEventDay("day=2", days)).toBe(2);
  });

  it("returns day one when the query is missing or invalid", () => {
    expect(selectedEventDay("", days)).toBe(1);
    expect(selectedEventDay("day=99", days)).toBe(1);
    expect(selectedEventDay("day=not-a-number", days)).toBe(1);
  });

  it("ignores unrelated query parameters", () => {
    expect(selectedEventDay("station=north&day=3", days)).toBe(3);
  });
});
