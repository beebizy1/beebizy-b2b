import { describe, expect, it } from "vitest";
import { registrationSegmentSummary, volunteerCoverage } from "./santaClara";

describe("Santa Clara registration categories", () => {
  it("keeps the requested categories visible even when their count is zero", () => {
    expect(registrationSegmentSummary([{ segment: "Investor" }, { segment: "Sponsor" }])).toEqual([
      ["Investor", 1],
      ["Company", 0],
      ["General", 0],
      ["Student", 0],
      ["Sponsor", 1],
    ]);
  });
});

describe("volunteer staffing coverage", () => {
  it("reports full and open shifts from active assignments", () => {
    const needs = [
      { id: "need-checkin", role: "Check-in", startTime: "08:00", endTime: "12:00", requiredCount: 2 },
      { id: "need-usher", role: "Usher", startTime: "09:00", endTime: "13:00", requiredCount: 1 },
    ];
    const shifts = [
      { needId: "need-checkin", status: "confirmed" as const },
      { needId: "need-checkin", status: "cancelled" as const },
      { needId: "need-usher", status: "scheduled" as const },
    ];

    expect(volunteerCoverage(needs, shifts)).toEqual([
      expect.objectContaining({ id: "need-checkin", filledCount: 1, openCount: 1, isFull: false }),
      expect.objectContaining({ id: "need-usher", filledCount: 1, openCount: 0, isFull: true }),
    ]);
  });

  it("does not count one linked assignment against two requirements with the same time", () => {
    const needs = [
      { id: "need-a", role: "Usher", startTime: "09:00", endTime: "13:00", requiredCount: 1 },
      { id: "need-b", role: "Usher", startTime: "09:00", endTime: "13:00", requiredCount: 1 },
    ];
    const result = volunteerCoverage(needs, [
      { needId: "need-a", status: "confirmed" },
    ]);
    expect(result.map(({ filledCount }) => filledCount)).toEqual([1, 0]);
  });
});
