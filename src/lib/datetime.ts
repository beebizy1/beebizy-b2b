/**
 * Dates formatted in the workspace's time zone, not the reader's.
 *
 * Every date in this app belongs to a place. A gala starts at 6pm in Portland whether
 * you're checking the run of show from Portland, from a hotel in Berlin, or from a
 * Vercel function that thinks it lives in UTC. `new Date(iso).toLocaleDateString()`
 * answers in whatever zone the machine happens to be in, which means the same event
 * reads as two different times to two people on the same team — and, worse, as two
 * different *days*, so "overdue" and "in 6 days" flip across the boundary.
 *
 * So the zone is an argument here, never an ambient default. Settings already stored
 * `timeZone`; this is what finally reads it.
 *
 * All of it is pure and takes `now` explicitly, so the tests can sit in Tokyo.
 */

/** A civil date — what a wall calendar in some zone says. No time, no offset. */
export interface CivilDay {
  year: number;
  month: number;
  day: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A stored zone can go stale — the IANA database drops names, and a hand-edited
 * settings row can hold anything. An unknown zone makes `Intl` throw, and a thrown
 * formatter would take down a screen over a preference, so it degrades to the
 * reader's own zone instead. Validation is cached: it costs a formatter construction.
 */
const zoneValidity = new Map<string, string>();

/** Whatever zone this machine is in — a fallback, never a default for stored data. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  const fallback = localTimeZone();
  if (!timeZone) return fallback;

  const cached = zoneValidity.get(timeZone);
  if (cached) return cached;

  let resolved = fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    resolved = timeZone;
  } catch {
    resolved = fallback;
  }
  zoneValidity.set(timeZone, resolved);
  return resolved;
}

/** Formatters are expensive to build and get hit once per row; keep them. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatterCache.set(key, cached);
  }
  return cached;
}

function parse(iso: string | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * What the calendar in `timeZone` says on this instant.
 *
 * `formatToParts` rather than a formatted string: `en-CA` happens to emit ISO order
 * today, but relying on a locale's layout to parse it back is the kind of thing that
 * breaks in one runtime and not another.
 */
export function civilDayInZone(instant: Date, timeZone: string): CivilDay {
  const parts = formatter(resolveTimeZone(timeZone), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * A civil day as a whole number of days, so two of them can be subtracted.
 *
 * Deliberately built through `Date.UTC` on the *civil* fields: that strips the offset
 * out of the arithmetic, which is what makes the difference exact across a DST change.
 * Subtracting two instants would be off by an hour twice a year — and an hour is
 * enough to turn "due today" into "overdue".
 */
export function dayNumberInZone(instant: Date, timeZone: string): number {
  const { year, month, day } = civilDayInZone(instant, timeZone);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * The same day number for a calendar cell, which is a y/m/d and not an instant.
 *
 * A month grid is built from civil dates — "the cell for 12 March" — so comparing it to
 * an event has to happen in that space too, never by way of a local-midnight `Date`.
 */
export function dayNumberOf(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Whole days from `now` to `iso`, counted in `timeZone`. Null if unparseable. */
export function daysBetweenInZone(
  iso: string | Date | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): number | null {
  const target = parse(iso);
  if (!target) return null;
  return dayNumberInZone(target, timeZone) - dayNumberInZone(now, timeZone);
}

/** True when `iso` falls on the same civil day as `now` in `timeZone`. */
export function isSameDayInZone(
  iso: string | Date | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return daysBetweenInZone(iso, timeZone, now) === 0;
}

/* ------------------------------------------------------------------ display */

/**
 * The date shapes the UI actually asks for, named by intent rather than by option bag.
 * A screen shouldn't be choosing between `day: "numeric"` and `day: "2-digit"`; that's
 * how a product ends up with four spellings of the same date.
 */
export type DateStyle =
  | "dayMonth" /* 12 Mar */
  | "dayMonthYear" /* 12 Mar 2026 */
  | "monthYear" /* Mar 2026 */
  | "monthYearLong" /* March 2026 */
  | "weekdayDayMonth" /* Thursday, 12 March */
  | "numeric" /* 3/12/2026 */
  | "time" /* 6:00 PM */
  | "dayMonthTime" /* 12 Mar, 6:00 PM */
  | "dayMonthYearTime" /* 12 Mar 2026, 6:00 PM */
  | "full" /* Thu, 12 Mar 2026, 6:00 PM */;

const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  dayMonth: { day: "numeric", month: "short" },
  dayMonthYear: { day: "numeric", month: "short", year: "numeric" },
  monthYear: { month: "short", year: "numeric" },
  monthYearLong: { month: "long", year: "numeric" },
  weekdayDayMonth: { weekday: "long", day: "numeric", month: "long" },
  numeric: { year: "numeric", month: "numeric", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  dayMonthTime: { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  dayMonthYearTime: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  full: {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

/** Placeholder for a missing or unparseable date. An em dash, never "Invalid Date". */
export const NO_DATE = "—";

/** Render a stored local `HH:mm` value as a compact 12-hour clock time. */
export function formatClockTime(time: string | null | undefined): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? "");
  if (!match) return NO_DATE;

  const hour = Number(match[1]);
  const minute = match[2];
  const displayHour = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return minute === "00" ? `${displayHour} ${suffix}` : `${displayHour}:${minute} ${suffix}`;
}

export function formatInZone(
  iso: string | Date | null | undefined,
  timeZone: string,
  style: DateStyle = "dayMonthYear",
): string {
  const date = parse(iso);
  if (!date) return NO_DATE;
  return formatter(resolveTimeZone(timeZone), STYLES[style]).format(date);
}

/**
 * The short zone name, for the one place per screen that has to say which zone these
 * times are in — a run of show read from another continent is a trap otherwise.
 */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  const resolved = resolveTimeZone(timeZone);
  const parts = formatter(resolved, { timeZoneName: "short" }).formatToParts(at);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? resolved;
}

/**
 * "in 6 days", "tomorrow", "3 weeks ago" — relative when relative is clearer.
 *
 * Counted in civil days in `timeZone`, so an event at 11pm tonight reads "today" to
 * the team running it rather than "tomorrow" because the server is in UTC.
 */
export function describeWhenInZone(
  iso: string | Date | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): string {
  const days = daysBetweenInZone(iso, timeZone, now);
  if (days === null) return "date unknown";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) {
    if (days < 14) return `in ${days} days`;
    if (days < 60) return `in ${Math.round(days / 7)} weeks`;
    return `in ${Math.round(days / 30)} months`;
  }
  const past = Math.abs(days);
  if (past < 14) return `${past} days ago`;
  if (past < 60) return `${Math.round(past / 7)} weeks ago`;
  return `${Math.round(past / 30)} months ago`;
}
