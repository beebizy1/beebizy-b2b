/**
 * Today.
 *
 * The old dashboard opened with five counters and a collapsible list grouped by
 * location. It could tell you there were 42 events; it could not tell you that the one
 * six days away has unconfirmed catering and three overdue tasks. This page leads with
 * the worklist and links each item straight to the section that fixes it.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Coins,
  Inbox,
  ListChecks,
  MapPin,
  Palette,
  Sparkles,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  PageHeader,
  ReadinessRing,
  RiskPill,
  StatTile,
} from "@/components/primitives";
import { useAllEventHealth, useAttention, useEvents, usePortfolio, useVendors } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { formatMoney } from "@/data/money";
import { eventSectionHref } from "@/app/shell/nav";
import { useSession } from "@/app/session";
import type { Event, EventHealth } from "@/data/entities";

function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Events still ahead of us, soonest first — cancelled and completed excluded. */
function upcoming(events: Event[] | undefined, daysUntil: (iso: string) => number | null): Event[] {
  if (!events) return [];
  return events
    .filter((event) => event.status !== "cancelled" && event.status !== "completed")
    // Counted in civil days in the workspace zone, so an event later tonight is still
    // "ahead of us" rather than dropping off the list at UTC midnight.
    .filter((event) => (daysUntil(event.date) ?? -1) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function AttentionPanel() {
  const { data: attention, isLoading, isError, error, refetch } = useAttention();

  const shown = attention?.slice(0, 8) ?? [];
  const urgentCount = attention?.filter((item) => item.level === "urgent").length ?? 0;

  return (
    <Panel>
      <PanelHeader
        title="Needs you"
        description={
          urgentCount > 0
            ? `${urgentCount} urgent ${urgentCount === 1 ? "item" : "items"} across your events`
            : "Ranked by urgency, then by how soon the event starts"
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/tasks">All open tasks</Link>
          </Button>
        }
      />
      <div className="p-2">
        {isError ? (
          <ErrorNotice error={error} onRetry={() => void refetch()} className="m-3" />
        ) : isLoading ? (
          <LoadingRows rows={4} className="p-3" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing needs you right now"
            description="No overdue tasks, no unconfirmed vendors on near events, nothing over budget. This list fills itself back up soon enough."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {shown.map((item) => (
              <li key={item.id}>
                <Link
                  href={eventSectionHref(item.eventId, item.section)}
                  className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/60"
                >
                  <span className="pt-0.5">
                    <RiskPill level={item.level} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.message}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.eventTitle}</span>
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function NextUpRow({ event, health }: { event: Event; health: EventHealth | undefined }) {
  const { when } = usePreferences();
  const filled = health?.capacityFilled ?? null;
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <ReadinessRing value={health?.readiness ?? 0} size={48} label={`${event.title} readiness`} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/events/${event.id}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {event.title}
          </Link>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {when(event.date)} · {event.locationRecord?.name ?? event.location ?? "No venue"}
        </p>
        {event.capacity ? (
          <Meter
            value={event.registrationCount}
            max={event.capacity}
            tone={filled !== null && filled > 100 ? "danger" : filled !== null && filled >= 85 ? "warning" : "brand"}
            caption={`${event.registrationCount} of ${event.capacity} registered`}
            className="max-w-xs"
          />
        ) : (
          <p data-numeric className="text-xs text-muted-foreground">
            {event.registrationCount} registered · no capacity set
          </p>
        )}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-xs text-muted-foreground">Checklist</p>
        <p data-numeric className="text-sm font-semibold text-foreground">
          {health ? `${health.checklistDone}/${health.checklistTotal}` : "—"}
        </p>
      </div>
    </li>
  );
}

function NextUpPanel() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const { data: healths } = useAllEventHealth();
  const { daysUntil } = usePreferences();

  const healthById = useMemo(() => new Map((healths ?? []).map((h) => [h.eventId, h])), [healths]);
  const next = upcoming(events, daysUntil).slice(0, 4);

  return (
    <Panel>
      <PanelHeader
        title="Next up"
        description="Readiness blends checklist progress, vendor confirmation and registrations"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/events">All events</Link>
          </Button>
        }
      />
      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : next.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming events"
          description="Everything on the books has already happened."
          action={
            <Button asChild size="sm">
              <Link href="/app/events/new">
                <CalendarPlus className="mr-1.5 size-4" />
                Plan an event
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {next.map((event) => (
            <NextUpRow key={event.id} event={event} health={healthById.get(event.id)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InboxPanel() {
  const { data: vendors, isLoading } = useVendors();

  const waiting = useMemo(
    () => (vendors ?? []).filter((vendor) => vendor.unreadCount > 0).sort((a, b) => b.unreadCount - a.unreadCount),
    [vendors],
  );

  if (isLoading) return null;
  if (waiting.length === 0) return null;

  return (
    <Panel>
      <PanelHeader title="Waiting on you" description="Vendor replies you haven't read" />
      <ul className="divide-y divide-hairline">
        {waiting.slice(0, 4).map((vendor) => (
          <li key={vendor.id}>
            <Link
              href={`/app/vendors/${vendor.id}`}
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
            >
              <Inbox className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{vendor.name}</span>
                  <span
                    data-numeric
                    className="rounded-full bg-info px-1.5 text-[11px] font-bold text-info-foreground"
                  >
                    {vendor.unreadCount}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{vendor.lastMessage}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const suggestedBudget = [
  ["Venue", "$30,000"],
  ["Catering", "$10,000"],
  ["Entertainment", "$5,000"],
  ["Production & AV", "$10,000"],
  ["Staffing & logistics", "$6,000"],
  ["Design & decor", "$4,000"],
  ["Contingency", "$5,000"],
] as const;

function PlanningBrief() {
  const { data: events } = useEvents();
  const event = upcoming(events, () => 0)[0];
  const eventHref = event ? `/app/events/${event.id}` : "/app/events/new";

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-hairline bg-brand-surface text-brand-foreground shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Bee AI planning brief
          </div>
          <h2 className="mt-5 max-w-xl text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            Give Beebizy a headcount and theme. Get a practical first draft.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted">
            Start with suggested spend, then build the checklist, run of show, mood board and vendor shortlist in the same event workspace.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: ListChecks, label: "Run of show + checklist", href: `${eventHref}${event ? "/plan" : ""}` },
              { icon: Palette, label: "Theme mood boards", href: `${eventHref}${event ? "/plan" : ""}` },
              { icon: Store, label: "Marketplace vendors", href: event ? `${eventHref}/vendors` : "/app/vendors" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 rounded-xl border border-brand-hairline bg-background/5 px-3 py-3 text-sm font-semibold transition-colors hover:bg-background/10"
              >
                <item.icon className="size-4 text-primary" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-brand-hairline bg-background/5 p-6 lg:border-l lg:border-t-0 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-muted">Example · 250 guests</p>
              <p data-numeric className="mt-2 text-4xl font-extrabold tracking-tight">$70,000</p>
              <p className="mt-1 text-sm text-brand-muted">Suggested total budget</p>
            </div>
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
          </div>
          <dl className="mt-5 space-y-2 border-t border-brand-hairline pt-4">
            {suggestedBudget.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-brand-muted">{label}</dt>
                <dd data-numeric className="font-semibold text-brand-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export default function Today() {
  const { user } = useSession();
  const prefs = usePreferences();
  const { data: portfolio, isLoading: portfolioLoading, isError, error, refetch } = usePortfolio();

  const firstName = user?.name.split(" ")[0] ?? "there";
  const spendRatio =
    portfolio && portfolio.budgetPlannedCents > 0
      ? Math.round((portfolio.budgetSpentCents / portfolio.budgetPlannedCents) * 100)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={prefs.date(new Date(), "weekdayDayMonth")}
        title={`${greeting()}, ${firstName}`}
        description="Everything that needs a decision today, then the events it belongs to."
        actions={
          <Button asChild>
            <Link href="/app/events/new">
              <CalendarPlus className="mr-1.5 size-4" />
              New event
            </Link>
          </Button>
        }
      />

      {isError ? <ErrorNotice error={error} title="Couldn't load your portfolio" onRetry={() => void refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Upcoming"
          value={portfolio?.eventsUpcoming ?? 0}
          sublabel={portfolio ? `${portfolio.eventsThisWeek} within 7 days` : undefined}
          icon={CalendarDays}
          tone="brand"
          loading={portfolioLoading}
        />
        <StatTile
          label="Confirmed guests"
          value={portfolio?.registrationsConfirmed ?? 0}
          sublabel={portfolio ? `${portfolio.registrationsPending} awaiting confirmation` : undefined}
          icon={Users}
          tone="success"
          loading={portfolioLoading}
        />
        <StatTile
          label="Revenue booked"
          value={formatMoney(portfolio?.revenueCents ?? 0, { compact: true })}
          sublabel="Tickets, sponsorship and fundraising"
          icon={Ticket}
          tone="info"
          loading={portfolioLoading}
        />
        <StatTile
          label="Spend vs plan"
          value={spendRatio === null ? "—" : `${spendRatio}%`}
          sublabel={
            portfolio
              ? `${formatMoney(portfolio.budgetSpentCents, { compact: true })} of ${formatMoney(portfolio.budgetPlannedCents, { compact: true })}`
              : undefined
          }
          icon={Coins}
          tone={spendRatio !== null && spendRatio > 100 ? "danger" : "neutral"}
          loading={portfolioLoading}
        />
      </div>

      <PlanningBrief />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <AttentionPanel />
          <NextUpPanel />
        </div>
        <div className="space-y-6">
          <InboxPanel />
          <Panel>
            <PanelHeader title="Your setup" description="The building blocks everything else reuses" />
            <div className="divide-y divide-hairline">
              <Link
                href="/app/library"
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
              >
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-foreground">Venues</span>
                <span data-numeric className="text-sm text-muted-foreground">
                  {portfolio?.locationsTotal ?? 0}
                </span>
              </Link>
              <Link
                href="/app/vendors"
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
              >
                <Coins className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-foreground">Vendors</span>
                <span data-numeric className="text-sm text-muted-foreground">
                  {portfolio?.vendorsTotal ?? 0}
                </span>
              </Link>
              <Link
                href="/app/guests"
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
              >
                <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-foreground">People</span>
                <span data-numeric className="text-sm text-muted-foreground">
                  {portfolio?.guestsTotal ?? 0}
                </span>
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
