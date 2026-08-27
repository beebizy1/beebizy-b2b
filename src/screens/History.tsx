import { Link } from "wouter";
import { CalendarDays, Coins, History as HistoryIcon, Users } from "lucide-react";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  PageHeader,
  Panel,
  PanelHeader,
  StatTile,
} from "@/components/primitives";
import { useAllEventHealth, useEvents } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { formatMoney, sumCents } from "@/data/money";

export default function History() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const { data: health } = useAllEventHealth();
  const { date: formatDate } = usePreferences();
  const now = Date.now();
  const past = (events ?? [])
    .filter((event) => event.status === "completed" || event.status === "cancelled" || new Date(event.date).getTime() < now)
    .sort((a, b) => b.date.localeCompare(a.date));
  const pastIds = new Set(past.map((event) => event.id));
  const pastHealth = (health ?? []).filter((item) => pastIds.has(item.eventId));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="History"
        title="Past events become your playbook"
        description="Compare headcount, spend and planning decisions so the next event starts with evidence instead of a blank page."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Past events" value={past.length} icon={HistoryIcon} loading={isLoading} />
        <StatTile
          label="Guests hosted"
          value={past.reduce((total, event) => total + event.registrationCount, 0)}
          icon={Users}
          loading={isLoading}
        />
        <StatTile
          label="Planned spend"
          value={formatMoney(sumCents(pastHealth.map((item) => item.budgetPlannedCents)), { compact: true })}
          icon={Coins}
          loading={isLoading}
        />
        <StatTile
          label="Committed spend"
          value={formatMoney(sumCents(pastHealth.map((item) => item.budgetSpentCents)), { compact: true })}
          icon={CalendarDays}
          loading={isLoading}
        />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load event history" onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHeader title="Event archive" description="Open any event to review its run of show, checklist and recorded decisions" />
        {isLoading ? (
          <LoadingRows rows={6} className="p-4" />
        ) : past.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Your history starts after the first event"
            description="Completed events will appear here automatically."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {past.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/app/events/${event.id}`}
                  className="grid gap-2 px-5 py-4 transition-colors hover:bg-accent/60 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{event.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {event.category} · {event.locationRecord?.name ?? event.location ?? "No venue"}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.date, "dayMonthYear")} · {event.registrationCount} guests
                  </span>
                  <EventStatusBadge status={event.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
