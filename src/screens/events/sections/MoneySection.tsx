/**
 * Money: budget, ticketing and fundraising in one place.
 *
 * These were four separate tabs — Budget, Tickets, Fundraising, plus SilentAuction /
 * LiveAuction / Raffle — which made "how is this event doing financially?" a question
 * you had to answer by hand. Every amount here is integer cents end to end.
 */

import { useMemo, useState } from "react";
import { Coins, Gavel, Plus, Ticket, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BookingStatusBadge,
  EmptyState,
  ErrorNotice,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import {
  useAddBudgetItem,
  useAddTicketType,
  useAuctionItems,
  useBudget,
  useDrawRaffle,
  useRaffleItems,
  useRemoveBudgetItem,
  useRemoveTicketType,
  useSponsorships,
  useTickets,
  useUpdateBudgetItem,
  useUpdateSponsorship,
  useUpdateTicketType,
} from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import {
  BOOKING_STATUSES,
  type BookingStatus,
  type BudgetItem,
  type BudgetLineType,
  type Event,
} from "@/data/entities";

/** Inline money field that only writes on blur, so every keystroke isn't a mutation. */
function MoneyCell({
  value,
  label,
  onCommit,
  className,
}: {
  value: number | null;
  label: string;
  onCommit: (next: number | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(centsToInput(value));

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = centsFromInput(draft);
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      inputMode="decimal"
      aria-label={label}
      className={cn("h-8 w-28 text-right", className)}
    />
  );
}

function BudgetRow({ eventId, item }: { eventId: string; item: BudgetItem }) {
  const update = useUpdateBudgetItem();
  const remove = useRemoveBudgetItem();
  const variance = item.actualCents === null ? null : item.actualCents - item.estimatedCents;

  return (
    <tr className="group border-b border-hairline last:border-0">
      <td className="px-5 py-2.5">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
      </td>
      <td className="px-3 py-2.5">
        <Pill tone={item.type === "revenue" ? "success" : "neutral"}>{item.category}</Pill>
      </td>
      <td className="px-3 py-2.5 text-right">
        <MoneyCell
          value={item.estimatedCents}
          label={`Estimated for ${item.name}`}
          onCommit={(next) =>
            update.mutate(
              { eventId, id: item.id, patch: { estimatedCents: next ?? 0 } },
              { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
            )
          }
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <MoneyCell
          value={item.actualCents}
          label={`Actual for ${item.name}`}
          onCommit={(next) =>
            update.mutate(
              { eventId, id: item.id, patch: { actualCents: next } },
              { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
            )
          }
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        {variance === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span
            data-numeric
            className={cn(
              "text-sm font-medium",
              variance === 0
                ? "text-muted-foreground"
                : (item.type === "expense" ? variance > 0 : variance < 0)
                  ? "text-danger-text"
                  : "text-success-text",
            )}
          >
            {variance > 0 ? "+" : ""}
            {formatMoney(variance)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          aria-label={`Delete ${item.name}`}
          onClick={() =>
            remove.mutate(
              { eventId, id: item.id },
              { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
            )
          }
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}

function BudgetPanel({ event }: { event: Event }) {
  const { data: items, isLoading, isError, error, refetch } = useBudget(event.id);
  const add = useAddBudgetItem();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<BudgetLineType>("expense");

  const expenses = (items ?? []).filter((item) => item.type === "expense");
  const revenue = (items ?? []).filter((item) => item.type === "revenue");
  const plannedSpend = sumCents(expenses.map((item) => item.estimatedCents));
  const actualSpend = sumCents(expenses.map((item) => item.actualCents));

  return (
    <Panel>
      <PanelHeader
        title="Budget"
        description={`${expenses.length} expense lines, ${revenue.length} revenue lines`}
      />

      {plannedSpend > 0 ? (
        <div className="border-b border-hairline px-5 py-3">
          <Meter
            label="Spend against plan"
            value={actualSpend}
            max={plannedSpend}
            tone={actualSpend > plannedSpend ? "danger" : actualSpend / plannedSpend > 0.85 ? "warning" : "brand"}
            caption={`${formatMoney(actualSpend)} of ${formatMoney(plannedSpend)}`}
          />
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = name.trim();
          const cents = centsFromInput(amount);
          if (!trimmed || cents === null) return;
          add.mutate(
            { eventId: event.id, draft: { name: trimmed, type, estimatedCents: cents } },
            {
              onSuccess: () => {
                setName("");
                setAmount("");
              },
              onError: (mutationError) => toast({ title: "Couldn't add line", description: mutationError.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="Add a budget line…"
          aria-label="Budget line name"
          className="min-w-[10rem] flex-1"
        />
        <Select value={type} onValueChange={(value) => setType(value as BudgetLineType)}>
          <SelectTrigger className="w-[124px]" aria-label="Line type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={amount}
          onChange={(inputEvent) => setAmount(inputEvent.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          aria-label="Estimated amount"
          className="w-28 text-right"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || centsFromInput(amount) === null || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={5} className="p-4" />
      ) : (items ?? []).length === 0 ? (
        <EmptyState icon={Coins} title="No budget yet" description="Add lines above, or start from a template." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2 font-semibold">Line</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 text-right font-semibold">Estimated</th>
                <th className="px-3 py-2 text-right font-semibold">Actual</th>
                <th className="px-3 py-2 text-right font-semibold">Variance</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            {[
              { label: "Expenses", rows: expenses },
              { label: "Revenue", rows: revenue },
            ]
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <tbody key={group.label}>
                  <tr>
                    <th
                      colSpan={6}
                      className="bg-surface-sunken px-5 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((item) => (
                    <BudgetRow key={item.id} eventId={event.id} item={item} />
                  ))}
                  <tr className="border-b border-hairline bg-surface-sunken/60">
                    <td className="px-5 py-2 text-xs font-semibold text-foreground" colSpan={2}>
                      {group.label} total
                    </td>
                    <td data-numeric className="px-3 py-2 text-right text-sm font-semibold text-foreground">
                      {formatMoney(sumCents(group.rows.map((item) => item.estimatedCents)))}
                    </td>
                    <td data-numeric className="px-3 py-2 text-right text-sm font-semibold text-foreground">
                      {formatMoney(sumCents(group.rows.map((item) => item.actualCents)))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              ))}
          </table>
        </div>
      )}
    </Panel>
  );
}

function TicketsPanel({ event }: { event: Event }) {
  const { data: tickets, isLoading } = useTickets(event.id);
  const add = useAddTicketType();
  const update = useUpdateTicketType();
  const remove = useRemoveTicketType();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [allocation, setAllocation] = useState("");

  const revenue = sumCents((tickets ?? []).map((ticket) => ticket.priceCents * ticket.quantitySold));
  const sold = (tickets ?? []).reduce((total, ticket) => total + ticket.quantitySold, 0);

  return (
    <Panel>
      <PanelHeader
        title="Tickets"
        description={tickets?.length ? `${sold} sold · ${formatMoney(revenue)} booked` : "No ticket types yet"}
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = name.trim();
          const cents = centsFromInput(price);
          const total = allocation.trim() === "" ? 0 : Number.parseInt(allocation, 10);
          if (!trimmed || cents === null || !Number.isFinite(total)) return;
          add.mutate(
            { eventId: event.id, draft: { name: trimmed, priceCents: cents, quantityTotal: total } },
            {
              onSuccess: () => {
                setName("");
                setPrice("");
                setAllocation("");
              },
              onError: (mutationError) => toast({ title: "Couldn't add ticket type", description: mutationError.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="Ticket name…"
          aria-label="Ticket name"
          className="min-w-[9rem] flex-1"
        />
        <Input
          value={price}
          onChange={(inputEvent) => setPrice(inputEvent.target.value)}
          placeholder="Price"
          inputMode="decimal"
          aria-label="Ticket price"
          className="w-24 text-right"
        />
        <Input
          value={allocation}
          onChange={(inputEvent) => setAllocation(inputEvent.target.value)}
          placeholder="Qty (0 = ∞)"
          inputMode="numeric"
          aria-label="Allocation, zero for unlimited"
          className="w-28 text-right"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || centsFromInput(price) === null || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (tickets ?? []).length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No ticket types"
          description="Add a type above, then open Share to get a public checkout link."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {(tickets ?? []).map((ticket) => {
            const unlimited = ticket.quantityTotal === 0;
            const remaining = unlimited ? null : ticket.quantityTotal - ticket.quantitySold;
            return (
              <li key={ticket.id} className="group space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{ticket.name}</span>
                  {!ticket.isActive ? <Pill>off sale</Pill> : null}
                  {remaining === 0 ? <Pill tone="warning">sold out</Pill> : null}
                  <span data-numeric className="text-sm font-semibold text-foreground">
                    {formatMoney(ticket.priceCents)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update.mutate(
                        { eventId: event.id, id: ticket.id, patch: { isActive: !ticket.isActive } },
                        { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
                      )
                    }
                  >
                    {ticket.isActive ? "Take off sale" : "Put on sale"}
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${ticket.name}`}
                    onClick={() =>
                      remove.mutate(
                        { eventId: event.id, id: ticket.id },
                        { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
                      )
                    }
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {ticket.description ? <p className="text-xs text-muted-foreground">{ticket.description}</p> : null}
                {unlimited ? (
                  <p data-numeric className="text-xs text-muted-foreground">
                    {ticket.quantitySold} sold · unlimited allocation
                  </p>
                ) : (
                  <Meter
                    value={ticket.quantitySold}
                    max={ticket.quantityTotal}
                    tone={remaining === 0 ? "warning" : "brand"}
                    caption={`${ticket.quantitySold} of ${ticket.quantityTotal} · ${formatMoney(ticket.priceCents * ticket.quantitySold)}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function FundraisingPanel({ event }: { event: Event }) {
  const { data: sponsorships } = useSponsorships(event.id);
  const { data: auction } = useAuctionItems(event.id);
  const { data: raffles } = useRaffleItems(event.id);
  const updateSponsorship = useUpdateSponsorship();
  const draw = useDrawRaffle();

  const confirmedSponsorship = sumCents(
    (sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents),
  );
  const pipelineSponsorship = sumCents(
    (sponsorships ?? []).filter((s) => s.status === "pending").map((s) => s.amountCents),
  );
  const bids = sumCents((auction ?? []).map((item) => item.currentBidCents));
  const raffleRevenue = sumCents((raffles ?? []).map((item) => item.ticketPriceCents * item.soldTickets));

  const hasAnything = (sponsorships?.length ?? 0) + (auction?.length ?? 0) + (raffles?.length ?? 0) > 0;
  if (!hasAnything) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sponsorship confirmed" value={formatMoney(confirmedSponsorship, { compact: true })} tone="success" />
        <StatTile label="Sponsorship pipeline" value={formatMoney(pipelineSponsorship, { compact: true })} tone="warning" />
        <StatTile label="Current bids" value={formatMoney(bids, { compact: true })} tone="info" />
        <StatTile label="Raffle sales" value={formatMoney(raffleRevenue, { compact: true })} tone="brand" />
      </div>

      {(sponsorships ?? []).length > 0 ? (
        <Panel>
          <PanelHeader title="Sponsors" description="Confirmed sponsorship counts toward fundraising totals" />
          <ul className="divide-y divide-hairline">
            {(sponsorships ?? []).map((sponsor) => (
              <li key={sponsor.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{sponsor.companyName}</span>
                    <Pill tone={sponsor.tier === "gold" ? "warning" : sponsor.tier === "silver" ? "neutral" : "info"}>
                      {sponsor.tier}
                    </Pill>
                  </div>
                  {sponsor.notes ? <p className="truncate text-xs text-muted-foreground">{sponsor.notes}</p> : null}
                </div>
                <span data-numeric className="text-sm font-semibold text-foreground">
                  {formatMoney(sponsor.amountCents)}
                </span>
                <BookingStatusBadge status={sponsor.status} />
                <Select
                  value={sponsor.status}
                  onValueChange={(value) =>
                    updateSponsorship.mutate(
                      { eventId: event.id, id: sponsor.id, patch: { status: value as BookingStatus } },
                      { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[130px]" aria-label={`Status for ${sponsor.companyName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {(auction ?? []).length > 0 ? (
        <Panel>
          <PanelHeader title="Auction lots" description="Silent lots open at reception; live lots run after dinner" />
          <ul className="divide-y divide-hairline">
            {(auction ?? []).map((lot) => (
              <li key={lot.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span data-numeric className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                  {lot.lotNumber ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Gavel className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-sm font-medium text-foreground">{lot.title}</span>
                    <Pill tone={lot.auctionType === "live" ? "warning" : "neutral"}>{lot.auctionType}</Pill>
                  </div>
                  {lot.donorName ? (
                    <p className="truncate text-xs text-muted-foreground">Donated by {lot.donorName}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p data-numeric className="text-sm font-semibold text-foreground">
                    {formatMoney(lot.currentBidCents ?? lot.startingBidCents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {lot.currentBidCents === null ? "opening bid" : "current bid"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {(raffles ?? []).length > 0 ? (
        <Panel>
          <PanelHeader title="Raffles" description="The draw is weighted by ticket quantity" />
          <ul className="divide-y divide-hairline">
            {(raffles ?? []).map((raffle) => (
              <li key={raffle.id} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Trophy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{raffle.name}</span>
                  <Pill tone={raffle.status === "drawn" ? "success" : raffle.status === "open" ? "info" : "neutral"}>
                    {raffle.status}
                  </Pill>
                  <span data-numeric className="text-sm text-muted-foreground">
                    {formatMoney(raffle.ticketPriceCents)} each
                  </span>
                  {raffle.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={raffle.soldTickets === 0 || draw.isPending}
                      onClick={() =>
                        draw.mutate(
                          { eventId: event.id, raffleItemId: raffle.id },
                          {
                            onSuccess: (drawn) =>
                              toast({ title: "Winner drawn", description: `${drawn.winnerName} wins ${drawn.name}.` }),
                            onError: (error) => toast({ title: "Couldn't draw", description: error.message }),
                          },
                        )
                      }
                    >
                      Draw winner
                    </Button>
                  ) : null}
                </div>
                {raffle.winnerName ? (
                  <p className="text-xs text-success-text">
                    Winner: {raffle.winnerName} ({raffle.winnerEmail})
                  </p>
                ) : null}
                <Meter
                  value={raffle.soldTickets}
                  max={raffle.totalTickets || 1}
                  tone="brand"
                  caption={`${raffle.soldTickets} of ${raffle.totalTickets || "∞"} tickets · ${formatMoney(raffle.ticketPriceCents * raffle.soldTickets)}`}
                />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

export default function MoneySection({ event }: { event: Event }) {
  const { data: budget } = useBudget(event.id);
  const { data: tickets } = useTickets(event.id);
  const { data: sponsorships } = useSponsorships(event.id);
  const { data: auction } = useAuctionItems(event.id);
  const { data: raffles } = useRaffleItems(event.id);

  const totals = useMemo(() => {
    const expenses = (budget ?? []).filter((item) => item.type === "expense");
    const revenueLines = (budget ?? []).filter((item) => item.type === "revenue");
    const spend = sumCents(expenses.map((item) => item.actualCents ?? item.estimatedCents));
    const ticketRevenue = sumCents((tickets ?? []).map((t) => t.priceCents * t.quantitySold));
    const fundraising =
      sumCents((sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents)) +
      sumCents((auction ?? []).map((item) => item.currentBidCents)) +
      sumCents((raffles ?? []).map((item) => item.ticketPriceCents * item.soldTickets));
    // Budget revenue (internal allocations, grants) is reported separately rather than
    // summed with tickets and fundraising: a gala books its sponsorship both as a
    // sponsorship record and as a revenue line, so adding them would double-count.
    const budgetRevenue = sumCents(revenueLines.map((item) => item.actualCents));
    return { spend, ticketRevenue, fundraising, budgetRevenue };
  }, [budget, tickets, sponsorships, auction, raffles]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Committed spend" value={formatMoney(totals.spend, { compact: true })} icon={Coins} />
        <StatTile label="Ticket revenue" value={formatMoney(totals.ticketRevenue, { compact: true })} icon={Ticket} tone="info" />
        <StatTile label="Fundraising" value={formatMoney(totals.fundraising, { compact: true })} icon={Trophy} tone="success" />
        <StatTile
          label="Budget revenue in"
          value={formatMoney(totals.budgetRevenue, { compact: true })}
          tone="neutral"
          sublabel="Internal allocations and grants, recorded as actual"
        />
      </div>

      <BudgetPanel event={event} />
      <TicketsPanel event={event} />
      <FundraisingPanel event={event} />
    </div>
  );
}
