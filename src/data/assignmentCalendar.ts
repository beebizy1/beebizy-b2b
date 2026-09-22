import type { PublicAssignmentPayload } from "./entities";
import { eventDayOptions } from "./eventDays";
import { resolveTimeZone } from "../lib/datetime";

const GOOGLE_CALENDAR_URL = "https://calendar.google.com/calendar/render";

function compactDate(civilDate: string): string {
  return civilDate.replaceAll("-", "");
}

function minutesFromLocalTime(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function compactLocalDateTime(civilDate: string, time: string): string {
  return `${compactDate(civilDate)}T${time.replace(":", "")}00`;
}

export function timeAfterMinutes(time: string, duration: number): { time: string; dayOffset: number } {
  const start = minutesFromLocalTime(time) ?? 0;
  const total = start + duration;
  const minutes = ((total % 1_440) + 1_440) % 1_440;
  return {
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    dayOffset: Math.floor(total / 1_440),
  };
}

/** Preserves local wall-clock semantics; the calendar URL carries the IANA zone separately. */
export function endTimeAfterMinutes(time: string, duration: number | null): string | null {
  if (duration === null || duration <= 0 || minutesFromLocalTime(time) === null) return null;
  return timeAfterMinutes(time, duration).time;
}

function addCivilDays(civilDate: string, days: number): string {
  const date = new Date(`${civilDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assignmentCivilDate(assignment: PublicAssignmentPayload): string {
  if (assignment.kind === "checklist" && assignment.dueDateCivil) {
    return assignment.dueDateCivil;
  }
  const day = Math.max(1, assignment.dayNumber ?? 1);
  return eventDayOptions(assignment.eventDate, assignment.eventEndDate, assignment.timeZone, day)[day - 1]!.civilDate;
}

function assignmentDetails(assignment: PublicAssignmentPayload): string {
  return [
    assignment.description,
    `Event: ${assignment.eventTitle}`,
    `Assigned to: ${assignment.assignee}`,
  ].filter(Boolean).join("\n\n");
}

/** Opens Google's prefilled event editor without requiring Beebizy to access the user's calendar. */
export function googleCalendarUrl(assignment: PublicAssignmentPayload): string {
  const civilDate = assignmentCivilDate(assignment);
  const startMinutes = assignment.startTime ? minutesFromLocalTime(assignment.startTime) : null;
  const explicitEndMinutes = assignment.endTime ? minutesFromLocalTime(assignment.endTime) : null;
  const fallbackEnd = assignment.startTime ? timeAfterMinutes(assignment.startTime, 30) : null;
  const endTime = assignment.endTime ?? fallbackEnd?.time ?? null;
  const inferredOffset = explicitEndMinutes !== null && startMinutes !== null && explicitEndMinutes <= startMinutes ? 1 : 0;
  const endDayOffset = assignment.endTime
    ? Math.max(0, assignment.endDayOffset || inferredOffset)
    : fallbackEnd?.dayOffset ?? 0;
  const endCivilDate = addCivilDays(civilDate, endDayOffset);
  const dates = assignment.startTime && endTime
    ? `${compactLocalDateTime(civilDate, assignment.startTime)}/${compactLocalDateTime(endCivilDate, endTime)}`
    : `${compactDate(civilDate)}/${compactDate(addCivilDays(civilDate, 1))}`;
  const search = new URLSearchParams({
    action: "TEMPLATE",
    text: `${assignment.title} - ${assignment.eventTitle}`,
    dates,
    details: assignmentDetails(assignment),
  });
  if (assignment.location) search.set("location", assignment.location);
  if (assignment.startTime) search.set("ctz", resolveTimeZone(assignment.timeZone));
  return `${GOOGLE_CALENDAR_URL}?${search.toString()}`;
}
