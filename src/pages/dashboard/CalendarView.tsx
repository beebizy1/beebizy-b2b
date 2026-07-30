import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListEvents } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/QueryError";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  draft: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  cancelled: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
  completed: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
};

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  draft: "bg-amber-400",
  cancelled: "bg-red-500",
  completed: "bg-slate-400",
};

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [, navigate] = useLocation();

  const { data: events = [], isLoading, isError, error } = useListEvents();

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events) {
      const key = format(parseISO(event.date as unknown as string), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, "yyyy-MM-dd");
    return eventsByDay.get(key) ?? [];
  }, [selectedDay, eventsByDay]);

  const handleDayClick = (day: Date) => {
    setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day));
  };

  const handleBookEvent = (day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    navigate(`/dashboard/events/new?date=${iso}`);
  };

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 flex flex-col h-full min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
            <p className="text-muted-foreground mt-1">Book and manage events across all locations.</p>
          </div>
          <Button onClick={() => handleBookEvent(selectedDay ?? new Date())} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Book Event
          </Button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()); }}
          >
            Today
          </Button>
        </div>

        {isError && <QueryError error={error} label="Failed to load events." />}

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs font-medium flex-wrap">
          {Object.entries(STATUS_DOT).map(([status, dot]) => (
            <div key={status} className="flex items-center gap-1.5 capitalize text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              {status}
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6 flex-1">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b border-border">
                {weekdays.map((d) => (
                  <div key={d} className="py-3 text-center text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 divide-x divide-y divide-border">
                {calendarDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                  const today = isToday(day);
                  const MAX_SHOWN = 3;

                  return (
                    <div
                      key={key}
                      onClick={() => handleDayClick(day)}
                      className={`min-h-[90px] p-1.5 cursor-pointer transition-colors group relative
                        ${inMonth ? "bg-card hover:bg-muted/40" : "bg-muted/20 hover:bg-muted/30"}
                        ${isSelected ? "ring-2 ring-inset ring-primary" : ""}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition-colors
                            ${today ? "bg-primary text-primary-foreground" : ""}
                            ${!today && inMonth ? "text-foreground" : ""}
                            ${!today && !inMonth ? "text-muted-foreground/50" : ""}
                            ${isSelected && !today ? "bg-primary/10 text-primary" : ""}
                          `}
                        >
                          {format(day, "d")}
                        </span>
                        {/* Book event on hover */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleBookEvent(day); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
                          title={`Book event on ${format(day, "MMM d")}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="space-y-0.5">
                        {dayEvents.slice(0, MAX_SHOWN).map((event) => (
                          <button
                            key={event.id}
                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/events/${event.id}`); }}
                            className={`w-full text-left text-xs px-1.5 py-0.5 rounded border truncate font-medium transition-opacity hover:opacity-80
                              ${STATUS_STYLES[event.status] ?? STATUS_STYLES.draft}
                            `}
                            title={event.title}
                          >
                            {event.title}
                          </button>
                        ))}
                        {dayEvents.length > MAX_SHOWN && (
                          <div className="text-xs text-muted-foreground px-1 font-medium">
                            +{dayEvents.length - MAX_SHOWN} more
                          </div>
                        )}
                      </div>

                      {isLoading && (
                        <div className="absolute inset-0 bg-background/50 animate-pulse rounded" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day detail panel */}
          <div className="lg:w-72 shrink-0">
            {selectedDay ? (
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {format(selectedDay, "EEEE")}
                      </div>
                      <div className="text-2xl font-bold text-foreground mt-0.5">
                        {format(selectedDay, "MMMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {selectedDayEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">No events booked</p>
                      <Button
                        size="sm"
                        className="mt-4 gap-1"
                        onClick={() => handleBookEvent(selectedDay)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Book this day
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDayEvents.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => navigate(`/dashboard/events/${event.id}`)}
                          className="w-full text-left p-3 rounded-xl border border-border bg-background hover:bg-muted/40 transition-colors group"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[event.status] ?? "bg-slate-400"}`} />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {event.title}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {format(parseISO(event.date as unknown as string), "h:mm a")}
                                {event.endDate && (
                                  <> — {format(parseISO(event.endDate as unknown as string), "h:mm a")}</>
                                )}
                              </div>
                              {event.locationRecord && (
                                <div className="text-xs text-teal-600 dark:text-teal-400 mt-1 truncate">
                                  {event.locationRecord.name}
                                </div>
                              )}
                              {!event.locationRecord && event.location && (
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                  {event.location}
                                </div>
                              )}
                              <div className="mt-1.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium capitalize ${STATUS_STYLES[event.status] ?? ""}`}>
                                  {event.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1 mt-2"
                        onClick={() => handleBookEvent(selectedDay)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add another event
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl shadow-sm p-6 text-center">
                <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground font-medium">Select a day</p>
                <p className="text-xs text-muted-foreground mt-1">Click any date to see events or book a new one.</p>
              </div>
            )}

            {/* Quick stats for this month */}
            <div className="mt-4 bg-card border border-border rounded-2xl shadow-sm p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {format(currentMonth, "MMMM")} at a glance
              </div>
              {(() => {
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);
                const monthEvents = events.filter((e) => {
                  const d = parseISO(e.date as unknown as string);
                  return d >= monthStart && d <= monthEnd;
                });
                const byStatus = monthEvents.reduce<Record<string, number>>((acc, e) => {
                  acc[e.status] = (acc[e.status] ?? 0) + 1;
                  return acc;
                }, {});
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total events</span>
                      <span className="font-bold text-foreground">{monthEvents.length}</span>
                    </div>
                    {Object.entries(byStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5 capitalize text-muted-foreground">
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
                          {status}
                        </div>
                        <span className="font-semibold text-foreground">{count}</span>
                      </div>
                    ))}
                    {monthEvents.length === 0 && (
                      <p className="text-xs text-muted-foreground">No events this month.</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
