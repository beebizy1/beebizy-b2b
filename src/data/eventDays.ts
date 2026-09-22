import { dayNumberInZone } from "../lib/datetime.ts";

export interface EventDayOption {
  /** One-based number shown to planners. */
  dayNumber: number;
  /** The venue's wall-calendar date, independent of the viewer's time zone. */
  civilDate: string;
}

interface RunOfShowPosition {
  dayNumber?: number;
  startTime: string;
  sortOrder?: number;
}

const MS_PER_DAY = 86_400_000;

function civilDateFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive count of civil event days in the workspace time zone. */
export function eventDayCount(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string,
): number {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (!Number.isFinite(start.getTime()) || !end || !Number.isFinite(end.getTime())) return 1;
  return Math.max(1, dayNumberInZone(end, timeZone) - dayNumberInZone(start, timeZone) + 1);
}

export function eventDayOptions(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string,
  minimumDays = 1,
): EventDayOption[] {
  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime())) return [{ dayNumber: 1, civilDate: startsAt.slice(0, 10) }];
  const firstDay = dayNumberInZone(start, timeZone);
  const count = Math.max(eventDayCount(startsAt, endsAt, timeZone), Math.max(1, Math.trunc(minimumDays)));
  return Array.from({ length: count }, (_, index) => ({
    dayNumber: index + 1,
    civilDate: civilDateFromDayNumber(firstDay + index),
  }));
}

export function formatEventDayLabel(option: EventDayOption, locale?: string): string {
  const date = new Date(`${option.civilDate}T12:00:00.000Z`);
  const label = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `Day ${option.dayNumber} · ${label}`;
}

/** Date-only checklist deadline derived from the event's venue-local calendar day. */
export function checklistDueDateBeforeEvent(startsAt: string, timeZone: string, daysBefore: number): string | null {
  const civilDate = eventDayOptions(startsAt, null, timeZone)[0]?.civilDate;
  if (!civilDate) return null;
  const due = new Date(`${civilDate}T12:00:00.000Z`);
  if (!Number.isFinite(due.getTime())) return null;
  due.setUTCDate(due.getUTCDate() - Math.max(0, Math.trunc(daysBefore)));
  return due.toISOString();
}

/** Stable ordering shared by every in-memory run-of-show surface. */
export function compareRunOfShowItems(left: RunOfShowPosition, right: RunOfShowPosition): number {
  return (
    (left.dayNumber ?? 1) - (right.dayNumber ?? 1) ||
    left.startTime.localeCompare(right.startTime) ||
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  );
}
