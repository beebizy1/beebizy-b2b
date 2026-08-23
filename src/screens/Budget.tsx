/**
 * Money across the portfolio.
 *
 * Replaces three pages that never reconciled with each other — Ticket Sales, Reporting
 * and "Financial Data" — with one view: what every event has sold, spent and raised,
 * and which ones are over plan.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { Coins, Ticket, TrendingDown, Trophy } from "lucide-react";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  PageHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import { useAllEventHealth, useAllTickets, useEvents, usePortfolio } from "@/data/hooks";
import { BarComparison, type BarComparisonRow } from "@/components/BarComparison";
import { usePreferences } from "@/app/preferences";
import { formatMoney, sumCents } from "@/data/money";
import { eventSectionHref } from "@/app/shell/nav";
import { cn } from "@/lib/utils";

export default function Budget() {
  const { date: formatDate } = usePreferences();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: events, isLoading: eventsLoading, isError, error, refetch } = useEvents();
  const { data: healths } = useAllEventHealth();
  const { data: tickets, isLoading: ticketsLoading } = useAllTickets();

  const healthById = useMemo(() => new Map((healths ?? []).map((h) => [h.eventId, h])), [healths]);

  /** One row per event that has any money attached to it at all. */
  const rows = useMemo(() => {
    return (events ?? [])
      .map((event) => {
        const health = healthById.get(event.id);
        return {
          event,
          planned: health?.budgetPlannedCents ?? 0,
          spent: health?.budgetSpentCents ?? 0,
          ticketRevenue: health?.ticketRevenueCents ?? 0,
          fundraising: health?.fundraisingCents ?? 0,
        };
      })
      .filter((row) => row.planned > 0 || row.spent > 0 || row.ticketRevenue > 0 || row.fundraising > 0)
      .sort((a, b) => b.ticketRevenue + b.fundraising - (a.ticketRevenue + a.fundraising));
  }, [events, healthById]);

  const chartRows: BarComparisonRow[] = useMemo(
    () =>
      rows
        .map((row) => ({
          key: row.event.id,
          label: row.event.title,
          sublabel: formatDate(row.event.date, "monthYear"),
          values: { spend: row.spent, in: row.ticketRevenue + row.fundraising },
        }))
        .sort((a, b) => Math.max(b.values.spend, b.values.in) - Math.max(a.values.spend, a.values.in))
        .slice(0, 10),
    [rows, formatDate],
  );

  const overPlan = rows.filter((row) => row.planned > 0 && row.spent > row.planned);
  const ticketRevenue = sumCents((tickets ?? []).map((ticket) => ticket.priceCents * ticket.quantitySold));
  const ticketsSold = (tickets ?? []).reduce((total, ticket) => total + ticket.quantitySold, 0);

  const onSale = useMemo(
    () =>
      (tickets ?? [])
        .filter((ticket) => ticket.isActive && ticket.eventStatus !== "cancelled")
        .sort((a, b) => b.priceCents * b.quantitySold - a.priceCents * a.quantitySold),
    [tickets],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Budget"
        title="What each event cost and what it brought in"
        description="Booked revenue and committed spend per event. Amounts are what has actually happened, not forecast."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Revenue booked"
          value={formatMoney(portfolio?.revenueCents ?? 0, { compact: true })}
          icon={Coins}
          tone="success"
          loading={portfolioLoading}
        />
        <StatTile
          label="Tickets sold"
          value={ticketsSold}
          sublabel={formatMoney(ticketRevenue, { compact: true })}
          icon={Ticket}
          tone="info"
          loading={ticketsLoading}
        />
        <StatTile
          label="Committed spend"
          value={formatMoney(portfolio?.budgetSpentCents ?? 0, { compact: true })}
          sublabel={portfolio ? `of ${formatMoney(portfolio.budgetPlannedCents, { compact: true })} planned` : undefined}
          icon={TrendingDown}
          loading={portfolioLoading}
        />
        <StatTile
          label="Events over plan"
          value={overPlan.length}
          icon={Trophy}
          tone={overPlan.length > 0 ? "danger" : "success"}
          loading={eventsLoading}
        />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load financials" onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHeader
          title="Spend against money in, by event"
          description="Same scale for both — exact figures are in the table below"
        />
        <div className="p-5">
          {eventsLoading ? (
            <LoadingRows rows={4} />
          ) : (
            <BarComparison
              series={[
                { key: "spend", label: "Committed spend", slot: 1 },
                { key: "in", label: "Tickets and fundraising", slot: 2 },
              ]}
              rows={chartRows}
              format={(value) => formatMoney(value, { compact: true })}
              emptyMessage="No event has money recorded against it yet."
            />
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="By event" description="Spend against plan, and what came back in" />
        {eventsLoading ? (
          <LoadingRows rows={5} className="p-4" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No money recorded yet"
            description="Add budget lines or ticket types to an event and it will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 font-semibold">Spend vs plan</th>
                  <th className="px-3 py-2 text-right font-semibold">Tickets</th>
                  <th className="px-3 py-2 text-right font-semibold">Fundraising</th>
                  <th className="px-3 py-2 text-right font-semibold">Booked in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Deliberately not "net": internally funded events book their money as
                  // revenue budget lines, and a gala's sponsorship appears both as a
                  // sponsorship record and a budget line. Subtracting one from the other
                  // would double-count. This column is external money in, nothing else.
                  const bookedIn = row.ticketRevenue + row.fundraising;
                  const over = row.planned > 0 && row.spent > row.planned;
                  return (
                    <tr key={row.event.id} className="border-b border-hairline last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link
                          href={eventSectionHref(row.event.id, "budget")}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {row.event.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(row.event.date, "dayMonthYear")}
                          {" · "}
                          {row.event.status}
                        </p>
                      </td>
                      <td className="min-w-[180px] px-3 py-3">
                        {row.planned > 0 ? (
                          <Meter
                            value={row.spent}
                            max={row.planned}
                            tone={over ? "danger" : row.spent / row.planned > 0.85 ? "warning" : "brand"}
                            caption={`${formatMoney(row.spent, { compact: true })} / ${formatMoney(row.planned, { compact: true })}`}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">No budget set</span>
                        )}
                      </td>
                      <td data-numeric className="px-3 py-3 text-right text-sm text-foreground">
                        {formatMoney(row.ticketRevenue)}
                      </td>
                      <td data-numeric className="px-3 py-3 text-right text-sm text-foreground">
                        {formatMoney(row.fundraising)}
                      </td>
                      <td
                        data-numeric
                        className={cn(
                          "px-3 py-3 text-right text-sm font-semibold",
                          bookedIn > 0 ? "text-success-text" : "text-muted-foreground",
                        )}
                      >
                        {formatMoney(bookedIn)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Ticket types on sale" description="Across every active event" />
        {ticketsLoading ? (
          <LoadingRows rows={4} className="p-4" />
        ) : onSale.length === 0 ? (
          <EmptyState icon={Ticket} title="Nothing on sale" description="Put a ticket type on sale from an event's Money section." />
        ) : (
          <ul className="divide-y divide-hairline">
            {onSale.map((ticket) => {
              const remaining = ticket.quantityTotal === 0 ? null : ticket.quantityTotal - ticket.quantitySold;
              return (
                <li key={ticket.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{ticket.name}</span>
                      {remaining === 0 ? <Pill tone="warning">sold out</Pill> : null}
                    </div>
                    <Link
                      href={eventSectionHref(ticket.eventId, "budget")}
                      className="truncate text-xs text-muted-foreground hover:underline"
                    >
                      {ticket.eventTitle}
                    </Link>
                  </div>
                  <span data-numeric className="text-sm font-semibold text-foreground">
                    {formatMoney(ticket.priceCents)}
                  </span>
                  <span data-numeric className="w-28 text-right text-xs text-muted-foreground">
                    {ticket.quantitySold} sold
                    {remaining === null ? "" : ` · ${Math.max(0, remaining)} left`}
                  </span>
                  <span data-numeric className="w-24 text-right text-sm text-foreground">
                    {formatMoney(ticket.priceCents * ticket.quantitySold)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
