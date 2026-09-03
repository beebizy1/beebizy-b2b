/**
 * Post-event summary.
 *
 * The read-back after the day: who came, what it cost, what it returned, and how the
 * plan actually ran. Everything is derived from the event's own records, so this page
 * is a view of the truth rather than a separate report someone has to keep up to date.
 */

import { Link } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  FileText,
  MapPin,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePreferences } from "@/app/preferences";
import { formatMoney, sumCents } from "@/data/money";
import {
  useBudget,
  useChecklist,
  useEvent,
  useEventRegistrations,
  useRunOfShow,
  useSponsorships,
  useTeamHours,
} from "@/data/hooks";

export default function PostEventSummary({ id }: { id: string }) {
  const { date: formatDate } = usePreferences();
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const { data: registrations } = useEventRegistrations(id);
  const { data: budget } = useBudget(id);
  const { data: checklist } = useChecklist(id);
  const { data: runOfShow } = useRunOfShow(id);
  const { data: sponsorships } = useSponsorships(id);
  const { data: teamHours } = useTeamHours(id);

  if (isError) return <ErrorNotice error={error} title="Couldn't load this event" onRetry={() => void refetch()} />;
  if (isLoading) return <LoadingRows rows={6} />;

  if (!event) {
    return (
      <Panel>
        <EmptyState
          icon={FileText}
          title="That event doesn't exist"
          description="It may have been deleted."
          action={
            <Button asChild variant="outline">
              <Link href="/app/events">Back to events</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const totalReg = registrations?.length ?? 0;
  const confirmed = (registrations ?? []).filter((r) => r.status === "confirmed").length;
  const fillRate = event.capacity ? Math.round((confirmed / event.capacity) * 100) : null;

  const expenses = (budget ?? []).filter((line) => line.type === "expense");
  const estimated = sumCents(expenses.map((line) => line.estimatedCents));
  const actual = sumCents(expenses.map((line) => line.actualCents));
  const spend = actual || estimated;

  const revenue =
    sumCents((budget ?? []).filter((line) => line.type === "revenue").map((line) => line.actualCents)) +
    sumCents((sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents));

  // Return on what was actually spent. With no spend there is nothing to divide by, so
  // the tile shows a dash rather than a fabricated percentage.
  const roiPct = spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : null;
  const roiPositive = roiPct !== null && roiPct >= 0;

  const checklistDone = (checklist ?? []).filter((item) => item.completed).length;
  const checklistTotal = checklist?.length ?? 0;
  const totalHours = (teamHours ?? []).reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <div className="space-y-6">
      <Link
        href={`/app/events/${event.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to event
      </Link>

      <header className="border-b border-hairline pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="size-4 text-primary-text" aria-hidden="true" />
              Post-Event Summary
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{event.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatDate(event.date, "dayMonthYear")}
                {event.endDate ? ` – ${formatDate(event.endDate, "dayMonthYear")}` : ""}
              </span>
              {event.location ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {event.location}
                </span>
              ) : null}
              {event.category ? <Pill>{event.category}</Pill> : null}
              <EventStatusBadge status={event.status} />
            </div>
            {event.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{event.description}</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Generated {formatDate(new Date(), "dayMonthYear")}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Registrations"
          value={String(totalReg)}
          icon={Users}
          sublabel={event.capacity ? `of ${event.capacity} capacity` : undefined}
        />
        <StatTile
          label="Fill rate"
          value={fillRate === null ? "—" : `${fillRate}%`}
          icon={CheckCircle2}
          tone={fillRate !== null && fillRate >= 75 ? "success" : "warning"}
          sublabel={`${confirmed} confirmed`}
        />
        <StatTile
          label="Total spend"
          value={formatMoney(spend)}
          icon={DollarSign}
          sublabel={actual ? `vs ${formatMoney(estimated)} budgeted` : "Estimated"}
        />
        <StatTile
          label="ROI"
          value={roiPct === null ? "—" : `${roiPct}%`}
          icon={roiPositive ? TrendingUp : TrendingDown}
          tone={roiPct === null ? "neutral" : roiPositive ? "success" : "danger"}
          sublabel={revenue > 0 ? `${formatMoney(revenue)} revenue` : "Cost-only event"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Budget breakdown"
            description={`Budgeted ${formatMoney(estimated)} · Actual ${formatMoney(actual)}`}
          />
          {expenses.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No budget data.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{line.name}</p>
                        <p className="text-sm text-muted-foreground">{line.category}</p>
                      </TableCell>
                      <TableCell data-numeric className="text-right text-muted-foreground">
                        {formatMoney(line.estimatedCents)}
                      </TableCell>
                      <TableCell data-numeric className="text-right">
                        {formatMoney(line.actualCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Delivery"
            description="How much of the plan was completed, and what it took"
          />
          <div className="divide-y divide-hairline">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Checklist completed</span>
              <span data-numeric className="font-medium text-foreground">
                {checklistDone} / {checklistTotal}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Run-of-show cues</span>
              <span data-numeric className="font-medium text-foreground">
                {runOfShow?.length ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Staff hours booked</span>
              <span data-numeric className="font-medium text-foreground">
                {totalHours}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Sponsorship confirmed</span>
              <span data-numeric className="font-medium text-foreground">
                {formatMoney(
                  sumCents((sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents)),
                )}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {(teamHours?.length ?? 0) > 0 ? (
        <Panel className="overflow-hidden">
          <PanelHeader title="Team hours" description="Who worked on this, and for how long" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamHours?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-foreground">{entry.staffMember}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.role}</TableCell>
                    <TableCell data-numeric className="text-right">
                      {entry.hours}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
