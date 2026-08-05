/**
 * Month calendar.
 *
 * A lens on the same event list rather than a separate destination — the old build had
 * Calendar as its own top-level nav item, which meant switching context to answer
 * "what does that week look like?". Multi-day events span their full run, because an
 * offsite that occupies three days should occupy three days here.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { dayNumberInZone, dayNumberOf } from "@/lib/datetime";
import type { Event, EventStatus } from "@/data/entities";

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
  const start = dayNumberInZone(new Date(event.date), timeZone);
  const end = event.endDate ? dayNumberInZone(new Date(event.endDate), timeZone) : start;
  return day >= start && day <= end;
}

export default function EventsCalendar({ events }: { events: Event[] }) {
  const { timeZone, date: formatDate } = usePreferences();
  const today = startOfDay(new Date());
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const grid = useMemo(() => buildGrid(anchor), [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    for (const day of grid) {
      const dayNumber = cellDay(day);
      const onDay = events
        .filter((event) => occupiesDay(event, dayNumber, timeZone))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (onDay.length > 0) map.set(dayNumber, onDay);
    }
    return map;
  }, [grid, events, timeZone]);

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
                    {dayEvents.slice(0, 3).map((event) => {
                      const isStart = dayNumberInZone(new Date(event.date), timeZone) === cellDay(day);
                      return (
                        <li key={event.id}>
                          <Link
                            href={`/app/events/${event.id}`}
                            title={`${event.title} · ${formatDate(event.date, "time")}`}
                            className={cn(
                              "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                              STATUS_CHIP[event.status],
                            )}
                          >
                            {isStart ? (
                              <span data-numeric className="mr-1 font-semibold">
                                {formatDate(event.date, "time")}
                              </span>
                            ) : (
                              <span className="mr-1" aria-hidden="true">
                                ↳
                              </span>
                            )}
                            {event.title}
                          </Link>
                        </li>
                      );
                    })}
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
      </div>
    </Panel>
  );
}
