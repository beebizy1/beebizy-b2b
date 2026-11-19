/**
 * Month calendar.
 *
 * A lens on the same event list rather than a separate destination — the old build had
 * Calendar as its own top-level nav item, which meant switching context to answer
 * "what does that week look like?". Multi-day events span their full run, because an
 * offsite that occupies three days should occupy three days here.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { dayNumberInZone, dayNumberOf, formatInZone } from "@/lib/datetime";
import type { Event, EventStatus, GoogleCalendarExternalEvent } from "@/data/entities";
import { eventLocationLabel } from "./calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_CHIP: Record<EventStatus, string> = {
  published: "bg-success-tint text-success-text hover:bg-success-tint/70",
  draft: "bg-muted text-muted-foreground hover:bg-muted/70",
  completed: "bg-info-tint text-info-text hover:bg-info-tint/70",
  cancelled: "bg-danger-tint text-danger-text line-through hover:bg-danger-tint/70",
};

const STATUS_SWATCH: Record<EventStatus, string> = {
  published: "bg-success",
  draft: "bg-muted-foreground",
  completed: "bg-info",
  cancelled: "bg-danger",
};

const GOOGLE_CHIP = "bg-primary-muted text-foreground hover:bg-primary-muted/70";

/**
 * The grid is made of *civil* days — "the cell for 12 March" — so these `Date`s are
 * carriers for a y/m/d and never compared against an instant. Which day an event lands
 * on is decided by `dayNumberInZone` in the workspace's zone: an 11pm event belongs to
 * the day the team is running it, not to tomorrow because the reader is in Berlin.
 */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** The cell's own civil-day number, comparable with `dayNumberInZone`. */
function cellDay(day: Date): number {
  return dayNumberOf(day.getFullYear(), day.getMonth() + 1, day.getDate());
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday-first index for a JS day number. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** The 6×7 grid covering a month, padded with the surrounding days. */
function buildGrid(monthAnchor: Date): Date[] {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = addDays(firstOfMonth, -mondayIndex(firstOfMonth));
  return Array.from({ length: 42 }, (_, index) => startOfDay(addDays(gridStart, index)));
}

function occupiesDay(event: Event, day: number, timeZone: string): boolean {
  const eventTimeZone = event.timeZone ?? timeZone;
  const start = dayNumberInZone(new Date(event.date), eventTimeZone);
  const end = event.endDate ? dayNumberInZone(new Date(event.endDate), eventTimeZone) : start;
  return day >= start && day <= end;
}

function utcDayNumber(value: string): number {
  const date = new Date(value);
  return dayNumberOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function googleEventOccupiesDay(event: GoogleCalendarExternalEvent, day: number, timeZone: string): boolean {
  if (event.isAllDay) return day >= utcDayNumber(event.startsAt) && day <= utcDayNumber(event.endsAt);
  const eventTimeZone = event.timeZone ?? timeZone;
  const start = dayNumberInZone(new Date(event.startsAt), eventTimeZone);
  const end = dayNumberInZone(new Date(event.endsAt), eventTimeZone);
  return day >= start && day <= end;
}

type CalendarItem =
  | { source: "beebizy"; event: Event }
  | { source: "google"; event: GoogleCalendarExternalEvent };

function CalendarItemChip({ item, day, workspaceTimeZone }: { item: CalendarItem; day: number; workspaceTimeZone: string }) {
  if (item.source === "google") {
    const event = item.event;
    const eventTimeZone = event.timeZone ?? workspaceTimeZone;
    const startDay = event.isAllDay ? utcDayNumber(event.startsAt) : dayNumberInZone(new Date(event.startsAt), eventTimeZone);
    const isStart = startDay === day;
    const label = event.isAllDay ? "All day" : formatInZone(event.startsAt, eventTimeZone, "time");
    const contents = (
      <>
        {isStart ? (
          <span data-numeric className="mr-1 font-semibold">{label}</span>
        ) : (
          <span className="mr-1" aria-hidden="true">↳</span>
        )}
        {event.title}
        {isStart && event.location ? <span className="ml-1 font-normal opacity-70">· {event.location}</span> : null}
      </>
    );
    return event.htmlLink ? (
      <a
        href={event.htmlLink}
        target="_blank"
        rel="noreferrer"
        title={`${event.title} · Google Calendar${event.location ? ` · ${event.location}` : ""}`}
        className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors", GOOGLE_CHIP)}
      >
        {contents}
      </a>
    ) : (
      <span
        title={`${event.title} · Google Calendar${event.location ? ` · ${event.location}` : ""}`}
        className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium", GOOGLE_CHIP)}
      >
        {contents}
      </span>
    );
  }

  const event = item.event;
  const eventTimeZone = event.timeZone ?? workspaceTimeZone;
  const isStart = dayNumberInZone(new Date(event.date), eventTimeZone) === day;
  return (
    <Link
      href={`/app/events/${event.id}`}
      title={`${event.title} · ${eventLocationLabel(event)} · ${formatInZone(event.date, eventTimeZone, "time")}`}
      className={cn(
        "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        STATUS_CHIP[event.status],
      )}
    >
      {isStart ? (
        <span data-numeric className="mr-1 font-semibold">
          {formatInZone(event.date, eventTimeZone, "time")}
        </span>
      ) : (
        <span className="mr-1" aria-hidden="true">↳</span>
      )}
      {event.title}
      {isStart ? <span className="ml-1 font-normal opacity-70">· {eventLocationLabel(event)}</span> : null}
    </Link>
  );
}

export default function EventsCalendar({
  events,
  googleEvents = [],
  onVisibleRangeChange,
}: {
  events: Event[];
  googleEvents?: GoogleCalendarExternalEvent[];
  onVisibleRangeChange?: (startsBefore: string, endsAfter: string) => void;
}) {
  const { timeZone, date: formatDate } = usePreferences();
  const today = startOfDay(new Date());
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const grid = useMemo(() => buildGrid(anchor), [anchor]);

  useEffect(() => {
    const first = grid[0];
    const last = grid.at(-1);
    if (!first || !last) return;
    onVisibleRangeChange?.(addDays(last, 1).toISOString(), first.toISOString());
  }, [grid, onVisibleRangeChange]);

  const byDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const day of grid) {
      const dayNumber = cellDay(day);
      const beebizyOnDay: CalendarItem[] = events
        .filter((event) => occupiesDay(event, dayNumber, timeZone))
        .map((event) => ({ source: "beebizy", event }));
      const googleOnDay: CalendarItem[] = googleEvents
        .filter((event) => googleEventOccupiesDay(event, dayNumber, timeZone))
        .map((event) => ({ source: "google", event }));
      const onDay = [...beebizyOnDay, ...googleOnDay].sort((left, right) => {
        const leftDate = left.source === "beebizy" ? left.event.date : left.event.startsAt;
        const rightDate = right.source === "beebizy" ? right.event.date : right.event.startsAt;
        return leftDate.localeCompare(rightDate);
      });
      if (onDay.length > 0) map.set(dayNumber, onDay);
    }
    return map;
  }, [grid, events, googleEvents, timeZone]);

  const monthLabel = formatDate(anchor, "monthYearLong");
  const inMonth = (day: Date) => day.getMonth() === anchor.getMonth();

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <h2 className="title-sm text-foreground">{monthLabel}</h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous month"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next month"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-hairline">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const dayEvents = byDay.get(cellDay(day)) ?? [];
              const isToday = day.getTime() === today.getTime();
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[104px] border-b border-r border-hairline p-1.5 last:border-r-0",
                    !inMonth(day) && "bg-surface-sunken/60",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span
                      data-numeric
                      className={cn(
                        "text-xs",
                        isToday
                          ? "grid size-5 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
                          : inMonth(day)
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 2 ? (
                      <span data-numeric className="text-[10px] text-muted-foreground">
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  <ul className="space-y-1">
                    {dayEvents.slice(0, 3).map((item) => (
                      <li key={`${item.source}:${item.event.id}`}>
                        <CalendarItemChip item={item} day={cellDay(day)} workspaceTimeZone={timeZone} />
                      </li>
                    ))}
                    {dayEvents.length > 3 ? (
                      <li className="px-1.5 text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline px-5 py-2.5">
        {(Object.keys(STATUS_SWATCH) as EventStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {/* Solid tones in the key: the tinted chip colours are too close to tell apart
                at 10px. */}
            <span className={cn("size-2.5 rounded-sm", STATUS_SWATCH[status])} aria-hidden="true" />
            {status}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
          personal Google Calendar
        </span>
      </div>
    </Panel>
  );
}
