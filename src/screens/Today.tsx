/**
 * Dashboard.
 *
 * Five counts across the top, then what's coming up and how the portfolio splits by
 * category and by venue. Everything is a plain white panel on the warm background.
 *
 * There is deliberately no worked example on this page. An earlier build opened with a
 * filled-in "$70,000 for 200 guests" planning brief, which read as the workspace's own
 * data to anyone who had not been told otherwise. Every number here is counted from real
 * records, so an empty workspace shows zeros rather than someone else's event.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { Activity, Calendar, MapPin, Ticket, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNotice, PageHeader, Panel, PanelHeader, StatTile } from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { useEvents, useGuests, useLocations, useRegistrations } from "@/data/hooks";
import { eventLocationLabel } from "./events/calendar";
import type { Event } from "@/data/entities";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Events starting within the next thirty days, soonest first. */
function upcomingWithin30Days(events: Event[]): Event[] {
  const now = Date.now();
  return events
    .filter((event) => {
      const at = new Date(event.date).getTime();
      return at >= now && at <= now + THIRTY_DAYS_MS && event.status !== "cancelled";
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function countBy(events: Event[], key: (event: Event) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const event of events) {
    const bucket = key(event);
    map.set(bucket, (map.get(bucket) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function BreakdownList({
  rows,
  empty,
  icon: Icon,
}: {
  rows: Array<[string, number]>;
  empty: string;
  icon?: typeof MapPin;
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-4 p-5">
      {rows.map(([label, count]) => (
        <li key={label} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <Icon className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
            ) : (
              <span className="size-3 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
            <span className="truncate font-medium text-foreground">{label}</span>
          </span>
          <span data-numeric className="shrink-0 font-mono text-muted-foreground">
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Today() {
  const { date: formatDate } = usePreferences();
  const { data: events, isLoading: eventsLoading, isError, error, refetch } = useEvents();
  const { data: locations, isLoading: locationsLoading } = useLocations();
  const { data: guests, isLoading: guestsLoading } = useGuests();
  const { data: registrations, isLoading: registrationsLoading } = useRegistrations();

  const all = useMemo(() => events ?? [], [events]);
  const upcoming = useMemo(() => upcomingWithin30Days(all), [all]);
  const byCategory = useMemo(() => countBy(all, (event) => event.category || "Uncategorised"), [all]);
  const byLocation = useMemo(
    () => countBy(all.filter((event) => event.locationId !== null), eventLocationLabel),
    [all],
  );

  const confirmed = (registrations ?? []).filter((row) => row.status === "confirmed").length;

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      {isError ? <ErrorNotice error={error} title="Couldn't load events" onRetry={() => void refetch()} /> : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total Events" value={String(all.length)} icon={Calendar} loading={eventsLoading} />
        <StatTile
          label="Total Locations"
          value={String(locations?.length ?? 0)}
          icon={MapPin}
          loading={locationsLoading}
        />
        <StatTile label="Total Attendees" value={String(guests?.length ?? 0)} icon={Users} loading={guestsLoading} />
        <StatTile
          label="Total Registrations"
          value={String(registrations?.length ?? 0)}
          icon={Ticket}
          loading={registrationsLoading}
        />
        <StatTile
          label="Confirmed Registrations"
          value={String(confirmed)}
          icon={Activity}
          loading={registrationsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Upcoming Events (Next 30 Days)" />
          {eventsLoading ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No upcoming events in the next 30 days.
            </p>
          ) : (
            <div className="space-y-4 p-5">
              {upcoming.map((event) => (
                <Link
                  key={event.id}
                  href={`/app/events/${event.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{event.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {formatDate(event.date, "dayMonthYear")} • {eventLocationLabel(event)}
                    </p>
                  </div>
                  <span
                    data-numeric
                    className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-sm font-medium text-primary-text"
                  >
                    {event.registrationCount} / {event.capacity ?? "∞"} registered
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-8">
          <Panel>
            <PanelHeader title="Events by Category" />
            {eventsLoading ? (
              <Skeleton className="m-5 h-40" />
            ) : (
              <BreakdownList rows={byCategory} empty="No categories found." />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Events by Location" />
            {eventsLoading ? (
              <Skeleton className="m-5 h-40" />
            ) : (
              <BreakdownList rows={byLocation} empty="No events linked to locations." icon={MapPin} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
