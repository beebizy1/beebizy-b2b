/**
 * Overview: the whole event on one screen, without editing anything.
 *
 * Readiness is broken into the dimensions that produced it, because a 62% that hides
 * "vendors are fine, checklist is behind" is a number nobody can act on.
 */

import { Link } from "wouter";
import { CheckSquare, Clock, Coins, History, Store, Ticket, Users } from "lucide-react";
import {
  EmptyState,
  KeyValue,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { useBudget, useChecklist, useEventHistory, useEventVendors, useRunOfShow, useSponsorships, useTickets } from "@/data/hooks";
import { formatMoney, sumCents } from "@/data/money";
import { eventSectionHref } from "@/app/shell/nav";
import type { Event, EventHealth } from "@/data/entities";

export default function OverviewSection({ event, health }: { event: Event; health: EventHealth | null | undefined }) {
  const { data: checklist, isLoading: checklistLoading } = useChecklist(event.id);
  const { data: vendors } = useEventVendors(event.id);
  const { data: budget } = useBudget(event.id);
  const { data: tickets } = useTickets(event.id);
  const { data: sponsorships } = useSponsorships(event.id);
  const { data: runOfShow, isLoading: rosLoading } = useRunOfShow(event.id);
  const { data: history, isLoading: historyLoading } = useEventHistory(event.id);

  const expenses = (budget ?? []).filter((item) => item.type === "expense");
  const revenue = (budget ?? []).filter((item) => item.type === "revenue");
  const plannedSpend = sumCents(expenses.map((item) => item.estimatedCents));
  const actualSpend = sumCents(expenses.map((item) => item.actualCents));
  const plannedRevenue = sumCents(revenue.map((item) => item.estimatedCents));
  const ticketRevenue = sumCents((tickets ?? []).map((t) => t.priceCents * t.quantitySold));
  const confirmedSponsorship = sumCents(
    (sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents),
  );

  const openByCategory = new Map<string, number>();
  for (const item of checklist ?? []) {
    if (item.completed) continue;
    openByCategory.set(item.category, (openByCategory.get(item.category) ?? 0) + 1);
  }
  const openCategories = [...openByCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Readiness breakdown"
            description="What the score is made of, so you can see which part is behind"
          />
          <div className="space-y-5 p-5">
            <Meter
              label="Checklist complete"
              value={health?.checklistDone ?? 0}
              max={health?.checklistTotal || 1}
              tone={
                !health || health.checklistTotal === 0
                  ? "neutral"
                  : health.checklistDone / health.checklistTotal >= 0.8
                    ? "success"
                    : health.checklistDone / health.checklistTotal >= 0.5
                      ? "warning"
                      : "danger"
              }
              caption={health ? `${health.checklistDone} of ${health.checklistTotal}` : "—"}
            />
            <Meter
              label="Vendors confirmed"
              value={health?.vendorsConfirmed ?? 0}
              max={health?.vendorsTotal || 1}
              tone={
                !health || health.vendorsTotal === 0
                  ? "neutral"
                  : health.vendorsConfirmed === health.vendorsTotal
                    ? "success"
                    : "warning"
              }
              caption={health ? `${health.vendorsConfirmed} of ${health.vendorsTotal}` : "—"}
            />
            <Meter
              label="Capacity filled"
              value={event.registrationCount}
              max={event.capacity || 1}
              tone={
                event.capacity === null
                  ? "neutral"
                  : event.registrationCount > event.capacity
                    ? "danger"
                    : event.registrationCount / event.capacity >= 0.85
                      ? "warning"
                      : "brand"
              }
              caption={event.capacity ? `${event.registrationCount} of ${event.capacity}` : "No capacity set"}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Run of show"
            description={runOfShow?.length ? `${runOfShow.length} cues` : "The order of the day"}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={eventSectionHref(event.id, "plan")}>Open plan</Link>
              </Button>
            }
          />
          {rosLoading ? (
            <LoadingRows rows={3} className="p-4" />
          ) : (runOfShow ?? []).length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No run of show yet"
              description="Add cues in the Plan section, or start the event from a template that already has them."
            />
          ) : (
            <ol className="divide-y divide-hairline">
              {(runOfShow ?? []).slice(0, 6).map((cue) => (
                <li key={cue.id} className="flex items-baseline gap-4 px-5 py-3">
                  <span data-numeric className="w-14 shrink-0 font-mono text-xs font-semibold text-foreground">
                    {cue.startTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{cue.title}</span>
                    {cue.responsible ? (
                      <span className="block truncate text-xs text-muted-foreground">{cue.responsible}</span>
                    ) : null}
                  </span>
                  {cue.duration ? (
                    <span data-numeric className="shrink-0 text-xs text-muted-foreground">
                      {cue.duration}m
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Budget" description="Booked, not forecast" />
          <dl className="divide-y divide-hairline px-5 py-2">
            <KeyValue label="Planned spend">{formatMoney(plannedSpend)}</KeyValue>
            <KeyValue label="Actual spend">
              <span className={actualSpend > plannedSpend ? "text-danger-text" : undefined}>
                {formatMoney(actualSpend)}
              </span>
            </KeyValue>
            <KeyValue label="Planned revenue">{formatMoney(plannedRevenue)}</KeyValue>
            <KeyValue label="Ticket sales">{formatMoney(ticketRevenue)}</KeyValue>
            <KeyValue label="Sponsorship confirmed">{formatMoney(confirmedSponsorship)}</KeyValue>
            <KeyValue label="Fundraising total">{formatMoney(health?.fundraisingCents ?? 0)}</KeyValue>
          </dl>
          <div className="border-t border-hairline p-3">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={eventSectionHref(event.id, "budget")}>
                <Coins className="mr-1.5 size-3.5" />
                Open money
              </Link>
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Open work by area" description="Where the incomplete checklist items sit" />
          {checklistLoading ? (
            <LoadingRows rows={3} className="p-4" />
          ) : openCategories.length === 0 ? (
            <EmptyState icon={CheckSquare} title="Checklist is clear" description="Every item is ticked off." />
          ) : (
            <ul className="flex flex-wrap gap-2 p-5">
              {openCategories.map(([category, count]) => (
                <li key={category}>
                  <Pill tone={count >= 3 ? "warning" : "neutral"}>
                    {category} · {count}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Planning history" description="Structured decisions retained for reporting and future recommendations" />
          {historyLoading ? (
            <LoadingRows rows={3} className="p-4" />
          ) : (history ?? []).length === 0 ? (
            <EmptyState icon={History} title="No changes recorded yet" description="Edits to the event, schedule, budget, and floorplan will appear here." />
          ) : (
            <ol className="divide-y divide-hairline">
              {(history ?? []).slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex gap-3 px-5 py-3">
                  <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{entry.summary}</span>
                    <time dateTime={entry.createdAt} className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}
                    </time>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Jump to" />
          <div className="divide-y divide-hairline">
            <Link
              href={eventSectionHref(event.id, "guests")}
              className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent/60"
            >
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 font-medium text-foreground">Registrations</span>
              <span data-numeric className="text-muted-foreground">
                {event.registrationCount}
              </span>
            </Link>
            <Link
              href={eventSectionHref(event.id, "vendors")}
              className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent/60"
            >
              <Store className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 font-medium text-foreground">Vendors</span>
              <span data-numeric className="text-muted-foreground">
                {vendors?.length ?? 0}
              </span>
            </Link>
            <Link
              href={eventSectionHref(event.id, "budget")}
              className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent/60"
            >
              <Ticket className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 font-medium text-foreground">Ticket types</span>
              <span data-numeric className="text-muted-foreground">
                {tickets?.length ?? 0}
              </span>
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
