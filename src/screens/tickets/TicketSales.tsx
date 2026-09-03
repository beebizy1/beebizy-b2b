/**
 * Ticket sales across the whole portfolio.
 *
 * One table of every ticket type on every event, so the question "how are we selling?"
 * is answered without opening nine events. Allocation is `quantityTotal`, where zero
 * means unlimited — an unlimited tier has no fill rate, so it shows a dash rather than
 * a misleading 100%.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  Meter,
  PageHeader,
  Panel,
  StatTile,
} from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { formatMoney, sumCents } from "@/data/money";
import { useAllTickets } from "@/data/hooks";

export default function TicketSales() {
  const { date: formatDate } = usePreferences();
  const [search, setSearch] = useState("");
  const { data: tickets, isLoading, isError, error, refetch } = useAllTickets();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tickets ?? [];
    return (tickets ?? []).filter(
      (ticket) =>
        ticket.name.toLowerCase().includes(term) || ticket.eventTitle.toLowerCase().includes(term),
    );
  }, [tickets, search]);

  const sold = visible.reduce((sum, ticket) => sum + ticket.quantitySold, 0);
  const revenue = sumCents(visible.map((ticket) => ticket.priceCents * ticket.quantitySold));
  const allocated = visible.reduce((sum, ticket) => sum + ticket.quantityTotal, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Ticket Sales" description="Every ticket type across every event, and how it is selling." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Tickets sold" value={String(sold)} icon={Ticket} />
        <StatTile label="Revenue" value={formatMoney(revenue)} tone="success" />
        <StatTile
          label="Allocation"
          value={allocated > 0 ? String(allocated) : "Unlimited"}
          sublabel={allocated > 0 ? `${Math.round((sold / allocated) * 100)}% sold` : "No capped tiers"}
        />
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(inputEvent) => setSearch(inputEvent.target.value)}
          placeholder="Search ticket or event…"
          aria-label="Search ticket types"
          className="pl-9"
        />
      </div>

      {isError ? (
        <ErrorNotice error={error} title="Couldn't load ticket sales" onRetry={() => void refetch()} />
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead>Allocation</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }, (_, cell) => (
                        <TableCell key={cell}>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={Ticket}
                        title={search ? "No ticket types match that search" : "No ticket types yet"}
                        description={
                          search
                            ? "Try an event name, or clear the search."
                            : "Add ticket types on an event's Tickets tab and sales appear here."
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{ticket.name}</p>
                        {ticket.isActive ? null : <p className="text-sm text-muted-foreground">Not on sale</p>}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/events/${ticket.eventId}/tickets`}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {ticket.eventTitle}
                        </Link>
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          {formatDate(ticket.eventDate, "dayMonthYear")}
                          <EventStatusBadge status={ticket.eventStatus} />
                        </p>
                      </TableCell>
                      <TableCell data-numeric className="text-right">
                        {formatMoney(ticket.priceCents)}
                      </TableCell>
                      <TableCell data-numeric className="text-right">
                        {ticket.quantitySold}
                      </TableCell>
                      <TableCell className="min-w-[9rem]">
                        {ticket.quantityTotal > 0 ? (
                          <Meter
                            value={ticket.quantitySold}
                            max={ticket.quantityTotal}
                            tone={ticket.quantitySold >= ticket.quantityTotal ? "success" : "brand"}
                            caption={`${ticket.quantitySold} / ${ticket.quantityTotal}`}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">Unlimited</span>
                        )}
                      </TableCell>
                      <TableCell data-numeric className="text-right font-medium">
                        {formatMoney(ticket.priceCents * ticket.quantitySold)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
}
