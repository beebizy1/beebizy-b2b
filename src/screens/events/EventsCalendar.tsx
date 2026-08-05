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

/** Local midnight, so day comparisons don't drift across time zones. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
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

function occupiesDay(event: Event, day: Date): boolean {
  const start = startOfDay(new Date(event.date));
  const end = event.endDate ? startOfDay(new Date(event.endDate)) : start;
  return day >= start && day <= end;
}

function timeLabel(event: Event): string {
  return new Date(event.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function EventsCalendar({ events }: { events: Event[] }) {
  const today = startOfDay(new Date());
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const grid = useMemo(() => buildGrid(anchor), [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    for (const day of grid) {
      const onDay = events
        .filter((event) => occupiesDay(event, day))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (onDay.length > 0) map.set(day.getTime(), onDay);
    }
    return map;
  }, [grid, events]);

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
              const dayEvents = byDay.get(day.getTime()) ?? [];
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
                      const isStart = startOfDay(new Date(event.date)).getTime() === day.getTime();
                      return (
                        <li key={event.id}>
                          <Link
                            href={`/app/events/${event.id}`}
                            title={`${event.title} · ${timeLabel(event)}`}
                            className={cn(
                              "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                              STATUS_CHIP[event.status],
                            )}
                          >
                            {isStart ? (
                              <span data-numeric className="mr-1 font-semibold">
                                {timeLabel(event)}
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
