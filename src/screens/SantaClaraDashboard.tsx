/** The focused operating home shown only to verified Santa Clara pilot accounts. */

import { Link } from "wouter";
import {
  ArrowRight,
  CalendarPlus,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNotice, LoadingRows, Panel, Pill } from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { useEvents } from "@/data/hooks";
import { eventTabHref, visibleEventTabs } from "@/app/shell/nav";
import type { Event } from "@/data/entities";

const WORK_AREAS = visibleEventTabs("enterprise", "santa-clara");

function nextEvent(events: Event[]): Event | null {
  const active = events
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const future = active.find((event) => new Date(event.date).getTime() >= Date.now());
  return future ?? active.at(-1) ?? null;
}

export default function SantaClaraDashboard() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const { date: formatDate, when } = usePreferences();
  const featured = nextEvent(events ?? []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-primary/35 bg-gradient-to-br from-primary-wash via-surface to-surface p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-text">Santa Clara pilot workspace</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Customized for Santa Clara University
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              One focused place to prepare the program, coordinate people, and run registration on event day.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/app/plan">
                <FileSpreadsheet className="mr-2 size-4" />Import spreadsheet
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/events/new">
                <CalendarPlus className="mr-2 size-4" />New event
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {isError ? <ErrorNotice error={error} title="Couldn't load Santa Clara events" onRetry={() => void refetch()} /> : null}
      {isLoading ? <LoadingRows rows={4} /> : null}

      {!isLoading && !featured ? (
        <Panel>
          <EmptyState
            icon={FileSpreadsheet}
            title="Bring in the first event"
            description="Upload the existing Excel or CSV plan, or connect a public Google Sheet. Beebizy will prepare the event for review before saving anything."
            action={<Button asChild><Link href="/app/plan">Import the event plan</Link></Button>}
          />
        </Panel>
      ) : null}

      {featured ? (
        <>
          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="info">Current event</Pill>
                  <span className="text-xs text-muted-foreground">{when(featured.date)}</span>
                </div>
                <h2 className="mt-2 truncate text-xl font-bold text-foreground">{featured.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(featured.date, "dayMonthYearTime")} · {featured.locationRecord?.name ?? featured.location ?? "Location not set"}
                </p>
              </div>
              <div data-numeric className="shrink-0 rounded-xl bg-surface-sunken px-4 py-3 text-right">
                <p className="text-2xl font-bold tabular-nums text-foreground">{featured.registrationCount}</p>
                <p className="text-xs text-muted-foreground">
                  of {featured.capacity ?? "unlimited"} registered
                </p>
              </div>
            </div>

            <div className="grid gap-3 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
              {WORK_AREAS.map((area, index) => (
                <Link
                  key={area.id}
                  href={eventTabHref(featured.id, area.id)}
                  className="group flex min-h-36 flex-col rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-primary/45 hover:bg-primary-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary-muted text-primary-text">
                      {area.icon ? <area.icon className="size-4" aria-hidden="true" /> : null}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{area.label}</h3>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{area.hint}.</p>
                  <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-text">
                    Open <ArrowRight className="ml-1 size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </Panel>

          {(events?.length ?? 0) > 1 ? (
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm"><Link href="/app/events">View all Santa Clara events</Link></Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
