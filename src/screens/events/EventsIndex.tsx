/**
 * Events index.
 *
 * One list that answers three questions at a glance: when is it, how ready is it, and
 * is anything wrong with it. Grouping is a real preference (stored per user, not in
 * localStorage) because a franchise operator thinks in venues and a marketing team
 * thinks in categories.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, CalendarPlus, CalendarSearch, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  GroupLabel,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  PageHeader,
  ReadinessRing,
  RiskPill,
} from "@/components/primitives";
import { useAllEventHealth, useEvents, useSettings, useUpdateSettings } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { cn } from "@/lib/utils";
import type { Event, EventHealth, UserSettings } from "@/data/entities";
import EventsCalendar from "./EventsCalendar";

type Lens = "upcoming" | "all" | "draft" | "past";

const LENSES: Array<{ id: Lens; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "draft", label: "Drafts" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
];

const GROUPINGS: Array<{ id: UserSettings["homeGrouping"]; label: string }> = [
  { id: "location", label: "Group by venue" },
  { id: "category", label: "Group by category" },
  { id: "status", label: "Group by status" },
];

function applyLens(events: Event[], lens: Lens): Event[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isFuture = (event: Event) => new Date(event.date).getTime() >= startOfToday.getTime();

  switch (lens) {
    case "upcoming":
      return events.filter((e) => isFuture(e) && e.status !== "cancelled" && e.status !== "completed");
    case "draft":
      return events.filter((e) => e.status === "draft");
    case "past":
      return events.filter((e) => !isFuture(e) || e.status === "completed" || e.status === "cancelled");
    case "all":
      return events;
  }
}

function groupKeyFor(event: Event, grouping: UserSettings["homeGrouping"]): string {
  if (grouping === "location") return event.locationRecord?.name ?? event.location ?? "No venue";
  if (grouping === "category") return event.category || "Uncategorised";
  return event.status;
}

function EventRow({ event, health }: { event: Event; health: EventHealth | undefined }) {
  const { date: formatDate, when } = usePreferences();
  const filled = health?.capacityFilled ?? null;
  const topRisk = health?.risks[0];

  return (
    <li>
      <Link
        href={`/app/events/${event.id}`}
        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60 sm:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1fr)]"
      >
        <ReadinessRing value={health?.readiness ?? 0} size={44} label={`${event.title} readiness`} />

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{event.title}</span>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(event.date, "dayMonthYear")}
            {" · "}
            {when(event.date)}
            {" · "}
            {event.category}
          </p>
          {topRisk ? (
            <span className="inline-flex items-center gap-2">
              <RiskPill level={topRisk.level} />
              <span className="truncate text-xs text-muted-foreground">{topRisk.message}</span>
            </span>
          ) : null}
        </div>

        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {event.locationRecord?.name ?? event.location ?? "No venue"}
          {event.locationRecord?.city ? <span className="block">{event.locationRecord.city}</span> : null}
        </p>

        <div className="hidden sm:block">
          {event.capacity ? (
            <Meter
              value={event.registrationCount}
              max={event.capacity}
              tone={filled !== null && filled > 100 ? "danger" : filled !== null && filled >= 85 ? "warning" : "brand"}
              caption={`${event.registrationCount}/${event.capacity}`}
            />
          ) : (
            <p data-numeric className="text-xs text-muted-foreground">
              {event.registrationCount} registered
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

export default function EventsIndex() {
  const [lens, setLens] = useState<Lens>("upcoming");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");

  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const { data: healths } = useAllEventHealth();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const grouping = settings?.homeGrouping ?? "location";
  const healthById = useMemo(() => new Map((healths ?? []).map((h) => [h.eventId, h])), [healths]);

  const visible = useMemo(() => {
    const scoped = applyLens(events ?? [], lens);
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scoped.filter((event) =>
          [event.title, event.category, event.location ?? "", event.locationRecord?.name ?? ""].some((field) =>
            field.toLowerCase().includes(needle),
          ),
        )
      : scoped;
    // Upcoming reads best soonest-first; history reads best most-recent-first.
    return filtered.sort((a, b) => (lens === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [events, lens, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const event of visible) {
      const key = groupKeyFor(event, grouping);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [visible, grouping]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Events"
        title="Every event you run"
        description="Readiness is checklist progress, vendor confirmation and registrations, weighted by what applies."
        actions={
          <Button asChild>
            <Link href="/app/events/new">
              <CalendarPlus className="mr-1.5 size-4" />
              New event
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex w-fit rounded-lg border border-hairline bg-surface p-0.5 shadow-xs"
          role="tablist"
          aria-label="Filter events"
        >
          {LENSES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={lens === option.id}
              onClick={() => setLens(option.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                lens === option.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center gap-2 sm:max-w-md">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, venue or category"
              className="pl-9"
              aria-label="Search events"
            />
          </div>
          {view === "list" ? (
            <Select
              value={grouping}
              onValueChange={(value) => updateSettings.mutate({ homeGrouping: value as UserSettings["homeGrouping"] })}
            >
              <SelectTrigger className="w-[176px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPINGS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="inline-flex shrink-0 rounded-lg border border-hairline bg-surface p-0.5 shadow-xs">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                view === "list" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Calendar view"
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                view === "calendar"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load events" onRetry={() => void refetch()} /> : null}

      {view === "calendar" ? (
        <EventsCalendar events={visible} />
      ) : (
      <Panel>
        <PanelHeader
          title={`${visible.length} ${visible.length === 1 ? "event" : "events"}`}
          description={search ? `Matching “${search}”` : LENSES.find((l) => l.id === lens)?.label}
        />
        {isLoading ? (
          <LoadingRows rows={5} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarSearch}
            title={search ? "No events match that search" : "Nothing here yet"}
            description={
              search
                ? "Try a venue name, a category, or clear the search."
                : "Create your first event, or start from a template in the library."
            }
            action={
              search ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/app/events/new">
                    <CalendarPlus className="mr-1.5 size-4" />
                    New event
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <div>
            {groups.map(([groupName, groupEvents]) => (
              <section key={groupName}>
                <GroupLabel>
                  {groupName} · {groupEvents.length}
                </GroupLabel>
                <ul className="divide-y divide-hairline">
                  {groupEvents.map((event) => (
                    <EventRow key={event.id} event={event} health={healthById.get(event.id)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
      )}
    </div>
  );
}
