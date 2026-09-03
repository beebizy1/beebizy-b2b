/**
 * How the event is performing, in four readings.
 *
 * Everything here is derived from records the event already holds — registrations,
 * checklist items, sponsorships, budget lines — rather than from stored summary figures.
 * A number on this tab can always be traced back to the rows that produced it.
 */

import { BarChart2, ClipboardList, HandCoins, Users } from "lucide-react";
import { EmptyState, ErrorNotice, LoadingRows, Meter, Panel, PanelHeader, StatTile } from "@/components/primitives";
import { formatMoney, sumCents } from "@/data/money";
import {
  useBudget,
  useChecklist,
  useEventHealth,
  useEventRegistrations,
  useSponsorships,
} from "@/data/hooks";
import type { Event } from "@/data/entities";

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export default function AnalyticsPanel({ event }: { event: Event }) {
  const { data: health } = useEventHealth(event.id);
  const {
    data: registrations,
    isLoading: registrationsLoading,
    isError,
    error,
    refetch,
  } = useEventRegistrations(event.id);
  const { data: checklist, isLoading: checklistLoading } = useChecklist(event.id);
  const { data: sponsorships, isLoading: sponsorshipsLoading } = useSponsorships(event.id);
  const { data: budget, isLoading: budgetLoading } = useBudget(event.id);

  const confirmed = (registrations ?? []).filter((r) => r.status === "confirmed").length;
  const pending = (registrations ?? []).filter((r) => r.status === "pending").length;
  const cancelled = (registrations ?? []).filter((r) => r.status === "cancelled").length;

  const done = (checklist ?? []).filter((item) => item.completed).length;
  const total = checklist?.length ?? 0;

  const raised = sumCents((sponsorships ?? []).map((s) => s.amountCents));
  const confirmedRaised = sumCents(
    (sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents),
  );

  const planned = sumCents((budget ?? []).filter((l) => l.type === "expense").map((l) => l.estimatedCents));
  const actual = sumCents((budget ?? []).filter((l) => l.type === "expense").map((l) => l.actualCents));
  const revenue = sumCents((budget ?? []).filter((l) => l.type === "revenue").map((l) => l.actualCents));
  const scale = Math.max(planned, actual, revenue, 1);

  if (isError) return <ErrorNotice error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Confirmed"
          value={String(confirmed)}
          icon={Users}
          tone="success"
          sublabel={event.capacity ? `of ${event.capacity} capacity` : "No capacity set"}
          loading={registrationsLoading}
        />
        <StatTile
          label="Readiness"
          value={`${health?.readiness ?? 0}%`}
          icon={BarChart2}
          sublabel="Checklist weighted by how close the event is"
        />
        <StatTile
          label="Raised"
          value={formatMoney(confirmedRaised)}
          icon={HandCoins}
          sublabel={raised > confirmedRaised ? `${formatMoney(raised)} including pledged` : "Confirmed sponsorship"}
          loading={sponsorshipsLoading}
        />
        <StatTile
          label="Spend vs plan"
          value={`${percent(actual, planned)}%`}
          sublabel={`${formatMoney(actual)} of ${formatMoney(planned)}`}
          loading={budgetLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Registrations" description="Where every registration currently sits" />
          {registrationsLoading ? (
            <div className="p-5">
              <LoadingRows rows={3} />
            </div>
          ) : (registrations?.length ?? 0) === 0 ? (
            <EmptyState icon={Users} title="No registrations yet" />
          ) : (
            <div className="space-y-4 p-5">
              <Meter value={confirmed} max={registrations?.length ?? 1} tone="success" label="Confirmed" />
              <Meter value={pending} max={registrations?.length ?? 1} tone="warning" label="Pending" />
              <Meter value={cancelled} max={registrations?.length ?? 1} tone="danger" label="Cancelled" />
              {event.capacity ? (
                <p className="text-sm text-muted-foreground">
                  <span data-numeric>{percent(confirmed, event.capacity)}%</span> of the room is confirmed.
                </p>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Checklist progress" description="Completed against outstanding" />
          {checklistLoading ? (
            <div className="p-5">
              <LoadingRows rows={3} />
            </div>
          ) : total === 0 ? (
            <EmptyState icon={ClipboardList} title="Nothing on the checklist yet" />
          ) : (
            <div className="space-y-4 p-5">
              <Meter value={done} max={total} tone="success" label={`${done} of ${total} done`} />
              <p className="text-sm text-muted-foreground">
                <span data-numeric>{total - done}</span> {total - done === 1 ? "item is" : "items are"} still open.
              </p>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Fundraising breakdown" description="Sponsorship by tier" />
          {sponsorshipsLoading ? (
            <div className="p-5">
              <LoadingRows rows={3} />
            </div>
          ) : (sponsorships?.length ?? 0) === 0 ? (
            <EmptyState icon={HandCoins} title="No sponsorships recorded" />
          ) : (
            <ul className="divide-y divide-hairline">
              {sponsorships?.map((sponsor) => (
                <li key={sponsor.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{sponsor.companyName}</p>
                    <p className="text-sm capitalize text-muted-foreground">
                      {sponsor.tier} · {sponsor.status}
                    </p>
                  </div>
                  <span data-numeric className="shrink-0 font-medium text-foreground">
                    {formatMoney(sponsor.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Budget & ROI" description="Committed spend against booked revenue" />
          {budgetLoading ? (
            <div className="p-5">
              <LoadingRows rows={3} />
            </div>
          ) : (budget?.length ?? 0) === 0 ? (
            <EmptyState icon={BarChart2} title="No budget lines yet" />
          ) : (
            <div className="space-y-4 p-5">
              {/* One shared scale across all three, so the bars are comparable rather
                  than each normalised to its own maximum. */}
              <Meter value={planned} max={scale} label="Planned spend" caption={formatMoney(planned)} tone="neutral" />
              <Meter value={actual} max={scale} label="Actual spend" caption={formatMoney(actual)} tone="warning" />
              <Meter value={revenue} max={scale} label="Revenue booked" caption={formatMoney(revenue)} tone="success" />
              <p className="text-sm text-muted-foreground">
                Net{" "}
                <span data-numeric className="font-medium text-foreground">
                  {formatMoney(revenue - actual)}
                </span>{" "}
                against actual spend.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
