import { describe, expect, it } from "vitest";
import type { PublicAssignmentPayload } from "./entities";
import { endTimeAfterMinutes, googleCalendarUrl } from "./assignmentCalendar";

const assignment: PublicAssignmentPayload = {
  kind: "checklist",
  eventTitle: "SCU Demo Day",
  eventDate: "2026-10-08T16:00:00.000Z",
  eventEndDate: null,
  timeZone: "America/Los_Angeles",
  location: "Santa Clara University",
  assignee: "Cristina",
  title: "Confirm registration desk",
  description: "Bring the printed guest list.",
  dueDate: "2026-10-07T19:00:00.000Z",
  dueDateCivil: "2026-10-07",
  completed: false,
  appPath: "/app/events/event-1/checklist?task=task-1",
  dayNumber: null,
  startTime: null,
  endTime: null,
  endDayOffset: 0,
};

describe("Google Calendar assignment links", () => {
  it("creates an all-day calendar entry for a checklist due date", () => {
    const url = new URL(googleCalendarUrl(assignment));

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Confirm registration desk - SCU Demo Day");
    expect(url.searchParams.get("dates")).toBe("20261007/20261008");
    expect(url.searchParams.get("location")).toBe("Santa Clara University");
    expect(url.searchParams.get("details")).not.toContain("https://beebizy.app/assignment/token");
  });

  it("uses the exact event day, shift time and venue time zone for a volunteer", () => {
    const url = new URL(googleCalendarUrl({
      ...assignment,
      kind: "volunteer",
      title: "Welcome desk",
      dueDate: null,
      dayNumber: 2,
      startTime: "08:00",
      endTime: "12:00",
      endDayOffset: 0,
    }));

    expect(url.searchParams.get("dates")).toBe("20261009T080000/20261009T120000");
    expect(url.searchParams.get("ctz")).toBe("America/Los_Angeles");
  });

  it("keeps an overnight Run of Show cue on the correct two calendar days", () => {
    const endTime = endTimeAfterMinutes("23:50", 30);
    const url = new URL(googleCalendarUrl({
      ...assignment,
      kind: "run-of-show",
      title: "Overnight load-out",
      dueDate: null,
      dayNumber: 3,
      startTime: "23:50",
      endTime,
      endDayOffset: 1,
    }));

    expect(endTime).toBe("00:20");
    expect(url.searchParams.get("dates")).toBe("20261010T235000/20261011T002000");
  });

  it("preserves Run of Show durations longer than one day", () => {
    const url = new URL(googleCalendarUrl({
      ...assignment,
      kind: "run-of-show",
      dueDate: null,
      dueDateCivil: null,
      dayNumber: 1,
      startTime: "08:00",
      endTime: "10:00",
      endDayOffset: 2,
    }));

    expect(url.searchParams.get("dates")).toBe("20261008T080000/20261010T100000");
  });
});
