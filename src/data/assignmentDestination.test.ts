import { describe, expect, it } from "vitest";
import type { PublicAssignmentPayload } from "./entities";
import { directPublicAssignmentDestination } from "./assignmentDestination";

const volunteerAssignment: PublicAssignmentPayload = {
  kind: "volunteer",
  eventTitle: "Demo Day",
  eventDate: "2026-10-12T16:00:00.000Z",
  eventEndDate: null,
  timeZone: "America/Los_Angeles",
  location: "Santa Clara",
  assignee: "Poorvi Shukla",
  title: "Counter 1",
  description: null,
  dueDate: null,
  dueDateCivil: null,
  completed: false,
  appPath: "/app/events/event-1/volunteers?shift=volunteer-1",
  dayNumber: 1,
  startTime: "08:00",
  endTime: "12:00",
  endDayOffset: 0,
  checkInPath: "/check-in/private-counter-token",
  checkInStation: { name: "Counter 1", lane: "Last names A-D" },
};

describe("directPublicAssignmentDestination", () => {
  it("opens a volunteer's private check-in list directly when a counter is assigned", () => {
    expect(directPublicAssignmentDestination(volunteerAssignment)).toBe("/check-in/private-counter-token");
  });

  it("keeps ordinary volunteer shifts and internal assignments on the assignment page", () => {
    expect(directPublicAssignmentDestination({ ...volunteerAssignment, checkInPath: null, checkInStation: null })).toBeNull();
    expect(directPublicAssignmentDestination({ ...volunteerAssignment, kind: "checklist" })).toBeNull();
  });
});
