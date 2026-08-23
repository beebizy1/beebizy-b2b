/**
 * Money: budget, ticketing and fundraising in one place.
 *
 * These were four separate tabs — Budget, Tickets, Fundraising, plus SilentAuction /
 * LiveAuction / Raffle — which made "how is this event doing financially?" a question
 * you had to answer by hand. Every amount here is integer cents end to end.
 */

import { useMemo, useState } from "react";
import { Check, Coins, Gavel, Handshake, Pencil, Plus, Ticket, Trash2, Trophy, X } from "lucide-react";
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
  useAddAuctionItem,
  useAddBudgetItem,
  useAddRaffleItem,
  useAddSponsorship,
  useAddTicketType,
  useAuctionItems,
  useBudget,
  useDrawRaffle,
  useEventRoi,
  useRaffleItems,
  useRemoveAuctionItem,
  useRemoveBudgetItem,
  useRemoveRaffleItem,
  useRemoveSponsorship,
  useRemoveTicketType,
  useSaveEventRoi,
  useSellRaffleTickets,
  useSponsorships,
  useTickets,
  useUpdateAuctionItem,
  useUpdateBudgetItem,
  useUpdateSponsorship,
  useUpdateTicketType,
} from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import { usePreferences } from "@/app/preferences";
import {
  BOOKING_STATUSES,
  SPONSORSHIP_TIERS,
  type AuctionKind,
  type BookingStatus,
  type BudgetItem,
  type BudgetLineType,
  type Event,
  type SponsorshipTier,
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
  const [editing, setEditing] = useState(false);
  const currentDraft = () => ({
    name: item.name,
    category: item.category,
    type: item.type,
    notes: item.notes ?? "",
  });
  const [draft, setDraft] = useState(currentDraft);
  const variance = item.actualCents === null ? null : item.actualCents - item.estimatedCents;

  const cancelEditing = () => {
    setDraft(currentDraft());
    setEditing(false);
  };

  const startEditing = () => {
    setDraft(currentDraft());
    setEditing(true);
  };

  const saveDetails = () => {
    const name = draft.name.trim();
    const category = draft.category.trim();
    if (!name || !category) return;
    update.mutate(
      {
        eventId,
        id: item.id,
        patch: { name, category, type: draft.type, notes: draft.notes.trim() || null },
      },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast({ title: "Couldn't update budget line", description: error.message }),
      },
    );
  };

  return (
    <tr className="group border-b border-hairline last:border-0">
      <td className="px-5 py-2.5">
        {editing ? (
          <div className="min-w-52 space-y-2">
            <Input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              aria-label="Budget line name"
              className="h-8"
            />
            <Input
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              aria-label="Budget line notes"
              placeholder="Notes"
              className="h-8"
            />
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
          </>
        )}
      </td>
      <td className="px-3 py-2.5">
        {editing ? (
          <div className="min-w-36 space-y-2">
            <Input
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              aria-label="Budget category"
              className="h-8"
            />
            <Select
              value={draft.type}
              onValueChange={(value) => setDraft((current) => ({ ...current, type: value as BudgetLineType }))}
            >
              <SelectTrigger className="h-8" aria-label="Budget line type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Pill tone={item.type === "revenue" ? "success" : "neutral"}>{item.category}</Pill>
        )}
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
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <button
                type="button"
                aria-label={`Save ${item.name}`}
                onClick={saveDetails}
                disabled={!draft.name.trim() || !draft.category.trim() || update.isPending}
                className="rounded p-1 text-success-text hover:bg-success-tint disabled:opacity-40"
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Cancel editing ${item.name}`}
                onClick={cancelEditing}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`Edit ${item.name}`}
              onClick={startEditing}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
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
        </div>
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
  const [category, setCategory] = useState("General");
  const [notes, setNotes] = useState("");

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
            {
              eventId: event.id,
              draft: {
                name: trimmed,
                category: category.trim() || "General",
                type,
                estimatedCents: cents,
                notes: notes.trim() || null,
              },
            },
            {
              onSuccess: () => {
                setName("");
                setAmount("");
                setNotes("");
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
        <Input
          value={category}
          onChange={(inputEvent) => setCategory(inputEvent.target.value)}
          placeholder="Category"
          aria-label="Budget category"
          className="min-w-[9rem] flex-1"
        />
        <Input
          value={notes}
          onChange={(inputEvent) => setNotes(inputEvent.target.value)}
          placeholder="Notes (optional)"
          aria-label="Budget notes"
          className="min-w-[12rem] flex-2"
        />
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

function AuctionPanel({ event }: { event: Event }) {
  const { data: lots, isLoading } = useAuctionItems(event.id);
  const add = useAddAuctionItem();
  const update = useUpdateAuctionItem();
  const remove = useRemoveAuctionItem();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AuctionKind>("silent");
  const [opening, setOpening] = useState("");

  const bids = sumCents((lots ?? []).map((lot) => lot.currentBidCents));

  return (
    <Panel>
      <PanelHeader
        title="Auction lots"
        description={
          lots?.length
            ? `${lots.length} lots · ${formatMoney(bids)} in current bids`
            : "Silent lots open at reception; live lots run after dinner"
        }
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          const nextLot = (lots ?? []).reduce((max, lot) => Math.max(max, lot.lotNumber ?? 0), 0) + 1;
          add.mutate(
            {
              eventId: event.id,
              draft: {
                title: trimmed,
                auctionType: kind,
                startingBidCents: centsFromInput(opening),
                lotNumber: nextLot,
              },
            },
            {
              onSuccess: () => {
                setTitle("");
                setOpening("");
              },
              onError: (error) => toast({ title: "Couldn't add lot", description: error.message }),
            },
          );
        }}
      >
        <Input
          value={title}
          onChange={(inputEvent) => setTitle(inputEvent.target.value)}
          placeholder="Lot title…"
          aria-label="Lot title"
          className="min-w-[10rem] flex-1"
        />
        <Select value={kind} onValueChange={(value) => setKind(value as AuctionKind)}>
          <SelectTrigger className="w-[110px]" aria-label="Auction type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="silent">Silent</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={opening}
          onChange={(inputEvent) => setOpening(inputEvent.target.value)}
          placeholder="Opening bid"
          inputMode="decimal"
          aria-label="Opening bid"
          className="w-32 text-right"
        />
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add lot
        </Button>
      </form>

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (lots ?? []).length === 0 ? (
        <EmptyState icon={Gavel} title="No lots yet" description="Add what you have been donated above." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(lots ?? []).map((lot) => (
            <li key={lot.id} className="group flex flex-wrap items-center gap-3 px-5 py-3">
              <span data-numeric className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                {lot.lotNumber ?? "—"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Gavel className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate text-sm font-medium text-foreground">{lot.title}</span>
                  <Pill tone={lot.auctionType === "live" ? "warning" : "neutral"}>{lot.auctionType}</Pill>
                  {lot.status !== "open" ? <Pill tone="success">{lot.status}</Pill> : null}
                </div>
                {lot.donorName ? (
                  <p className="truncate text-xs text-muted-foreground">Donated by {lot.donorName}</p>
                ) : null}
                {lot.startingBidCents !== null ? (
                  <p data-numeric className="text-xs text-muted-foreground">
                    Opens at {formatMoney(lot.startingBidCents)}
                  </p>
                ) : null}
              </div>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Current bid</span>
                <MoneyCell
                  value={lot.currentBidCents}
                  label={`Current bid for ${lot.title}`}
                  onCommit={(next) =>
                    update.mutate(
                      { eventId: event.id, id: lot.id, patch: { currentBidCents: next } },
                      { onError: (error) => toast({ title: "Couldn't update bid", description: error.message }) },
                    )
                  }
                />
              </label>

              <Input
                defaultValue={lot.winnerName ?? ""}
                placeholder="Winner"
                aria-label={`Winner for ${lot.title}`}
                className="h-8 w-32"
                onBlur={(blurEvent) => {
                  const next = blurEvent.target.value.trim() || null;
                  if (next === lot.winnerName) return;
                  update.mutate(
                    { eventId: event.id, id: lot.id, patch: { winnerName: next, status: next ? "won" : "open" } },
                    { onError: (error) => toast({ title: "Couldn't update winner", description: error.message }) },
                  );
                }}
              />

              <button
                type="button"
                aria-label={`Delete lot ${lot.title}`}
                onClick={() =>
                  remove.mutate(
                    { eventId: event.id, id: lot.id },
                    { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
                  )
                }
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RafflePanel({ event }: { event: Event }) {
  const { data: raffles, isLoading } = useRaffleItems(event.id);
  const add = useAddRaffleItem();
  const remove = useRemoveRaffleItem();
  const sell = useSellRaffleTickets();
  const draw = useDrawRaffle();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [selling, setSelling] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [quantity, setQuantity] = useState("1");

  const resetSale = () => {
    setSelling(null);
    setBuyerName("");
    setBuyerEmail("");
    setQuantity("1");
  };

  return (
    <Panel>
      <PanelHeader
        title="Raffles"
        description={raffles?.length ? "The draw is weighted by ticket quantity" : "Sell tickets, then draw a winner"}
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = name.trim();
          const cents = centsFromInput(price);
          if (!trimmed || cents === null) return;
          const parsedTotal = total.trim() === "" ? 0 : Number.parseInt(total, 10);
          add.mutate(
            {
              eventId: event.id,
              draft: {
                name: trimmed,
                ticketPriceCents: cents,
                totalTickets: Number.isFinite(parsedTotal) ? parsedTotal : 0,
              },
            },
            {
              onSuccess: () => {
                setName("");
                setPrice("");
                setTotal("");
              },
              onError: (error) => toast({ title: "Couldn't add raffle", description: error.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="Prize…"
          aria-label="Raffle prize"
          className="min-w-[9rem] flex-1"
        />
        <Input
          value={price}
          onChange={(inputEvent) => setPrice(inputEvent.target.value)}
          placeholder="Per ticket"
          inputMode="decimal"
          aria-label="Raffle ticket price"
          className="w-28 text-right"
        />
        <Input
          value={total}
          onChange={(inputEvent) => setTotal(inputEvent.target.value)}
          placeholder="Tickets (0 = ∞)"
          inputMode="numeric"
          aria-label="Total tickets, zero for unlimited"
          className="w-32 text-right"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || centsFromInput(price) === null || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isLoading ? (
        <LoadingRows rows={2} className="p-4" />
      ) : (raffles ?? []).length === 0 ? (
        <EmptyState icon={Trophy} title="No raffles yet" description="Add a prize above to start selling tickets." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(raffles ?? []).map((raffle) => (
            <li key={raffle.id} className="group space-y-2 px-5 py-3">
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
                  <>
                    <Button variant="outline" size="sm" onClick={() => setSelling(selling === raffle.id ? null : raffle.id)}>
                      Sell tickets
                    </Button>
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
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label={`Delete raffle ${raffle.name}`}
                  onClick={() =>
                    remove.mutate(
                      { eventId: event.id, id: raffle.id },
                      { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
                    )
                  }
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
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

              {selling === raffle.id ? (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline bg-surface-sunken p-3"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    const parsedQuantity = Number.parseInt(quantity, 10);
                    if (!buyerName.trim() || !buyerEmail.trim() || !Number.isFinite(parsedQuantity)) return;
                    sell.mutate(
                      {
                        eventId: event.id,
                        raffleItemId: raffle.id,
                        buyerName: buyerName.trim(),
                        buyerEmail: buyerEmail.trim(),
                        quantity: parsedQuantity,
                      },
                      {
                        onSuccess: resetSale,
                        onError: (error) => toast({ title: "Couldn't sell", description: error.message }),
                      },
                    );
                  }}
                >
                  <Input
                    value={buyerName}
                    onChange={(inputEvent) => setBuyerName(inputEvent.target.value)}
                    placeholder="Buyer name"
                    aria-label="Buyer name"
                    className="h-8 min-w-[8rem] flex-1"
                  />
                  <Input
                    type="email"
                    value={buyerEmail}
                    onChange={(inputEvent) => setBuyerEmail(inputEvent.target.value)}
                    placeholder="Buyer email"
                    aria-label="Buyer email"
                    className="h-8 min-w-[10rem] flex-1"
                  />
                  <Input
                    value={quantity}
                    onChange={(inputEvent) => setQuantity(inputEvent.target.value)}
                    inputMode="numeric"
                    aria-label="Ticket quantity"
                    className="h-8 w-20 text-right"
                  />
                  <Button type="submit" size="sm" disabled={sell.isPending}>
                    Sell
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={resetSale}>
                    Cancel
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SponsorsPanel({ event }: { event: Event }) {
  const { data: sponsors, isLoading } = useSponsorships(event.id);
  const add = useAddSponsorship();
  const update = useUpdateSponsorship();
  const remove = useRemoveSponsorship();
  const [company, setCompany] = useState("");
  const [tier, setTier] = useState<SponsorshipTier>("gold");
  const [amount, setAmount] = useState("");

  const confirmed = sumCents((sponsors ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents));
  const pipeline = sumCents((sponsors ?? []).filter((s) => s.status === "pending").map((s) => s.amountCents));

  return (
    <Panel>
      <PanelHeader
        title="Sponsors"
        description={
          sponsors?.length
            ? `${formatMoney(confirmed)} confirmed · ${formatMoney(pipeline)} in pipeline`
            : "Only confirmed sponsorship counts toward fundraising totals"
        }
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = company.trim();
          if (!trimmed) return;
          add.mutate(
            { eventId: event.id, draft: { companyName: trimmed, tier, amountCents: centsFromInput(amount) } },
            {
              onSuccess: () => {
                setCompany("");
                setAmount("");
              },
              onError: (error) => toast({ title: "Couldn't add sponsor", description: error.message }),
            },
          );
        }}
      >
        <Input
          value={company}
          onChange={(inputEvent) => setCompany(inputEvent.target.value)}
          placeholder="Company…"
          aria-label="Sponsor company"
          className="min-w-[9rem] flex-1"
        />
        <Select value={tier} onValueChange={(value) => setTier(value as SponsorshipTier)}>
          <SelectTrigger className="w-[118px]" aria-label="Sponsorship tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPONSORSHIP_TIERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={amount}
          onChange={(inputEvent) => setAmount(inputEvent.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          aria-label="Sponsorship amount"
          className="w-28 text-right"
        />
        <Button type="submit" size="sm" disabled={!company.trim() || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (sponsors ?? []).length === 0 ? (
        <EmptyState icon={Handshake} title="No sponsors yet" description="Add the companies you are talking to." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(sponsors ?? []).map((sponsor) => (
            <li key={sponsor.id} className="group flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{sponsor.companyName}</span>
                  <Pill tone={sponsor.tier === "gold" ? "warning" : sponsor.tier === "silver" ? "neutral" : "info"}>
                    {sponsor.tier}
                  </Pill>
                </div>
                {sponsor.notes ? <p className="truncate text-xs text-muted-foreground">{sponsor.notes}</p> : null}
              </div>

              <MoneyCell
                value={sponsor.amountCents}
                label={`Amount for ${sponsor.companyName}`}
                onCommit={(next) =>
                  update.mutate(
                    { eventId: event.id, id: sponsor.id, patch: { amountCents: next } },
                    { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
                  )
                }
              />

              <BookingStatusBadge status={sponsor.status} />

              <Select
                value={sponsor.status}
                onValueChange={(value) =>
                  update.mutate(
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

              <button
                type="button"
                aria-label={`Delete sponsor ${sponsor.companyName}`}
                onClick={() =>
                  remove.mutate(
                    { eventId: event.id, id: sponsor.id },
                    { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
                  )
                }
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Return on the event, recorded by hand.
 *
 * Deliberately manual: only the organizer knows what a town hall was worth. The old
 * "Financial Data" page collected the same three numbers with no way to see them
 * alongside the event they describe.
 */
function RoiPanel({ event }: { event: Event }) {
  const { date: formatDate } = usePreferences();
  const { data: roi, isLoading } = useEventRoi(event.id);
  const save = useSaveEventRoi();

  const [cost, setCost] = useState<string | null>(null);
  const [units, setUnits] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const costValue = cost ?? centsToInput(roi?.eventCostCents ?? null);
  const unitsValue = units ?? (roi ? String(roi.unitsSold) : "");
  const priceValue = price ?? centsToInput(roi?.avgItemPriceCents ?? null);
  const notesValue = notes ?? roi?.notes ?? "";

  const costCents = centsFromInput(costValue) ?? 0;
  const unitsSold = Number.parseInt(unitsValue || "0", 10) || 0;
  const avgPriceCents = centsFromInput(priceValue) ?? 0;
  const revenue = unitsSold * avgPriceCents;
  const net = revenue - costCents;
  const ratio = costCents > 0 ? Math.round((revenue / costCents) * 100) : null;

  return (
    <Panel>
      <PanelHeader
        title="Return"
        description={roi ? `Last updated ${formatDate(roi.updatedAt, "dayMonthYear")}` : "Record what it cost and what it returned"}
      />
      {isLoading ? (
        <LoadingRows rows={2} className="p-4" />
      ) : (
        <form
          className="space-y-4 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            save.mutate(
              {
                eventId: event.id,
                roi: {
                  eventCostCents: costCents,
                  unitsSold,
                  avgItemPriceCents: avgPriceCents,
                  notes: notesValue.trim(),
                },
              },
              {
                onSuccess: () => {
                  setCost(null);
                  setUnits(null);
                  setPrice(null);
                  setNotes(null);
                  toast({ title: "Return saved" });
                },
                onError: (error) => toast({ title: "Couldn't save", description: error.message }),
              },
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Total cost</span>
              <Input value={costValue} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="text-right" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Units sold</span>
              <Input value={unitsValue} onChange={(e) => setUnits(e.target.value)} inputMode="numeric" className="text-right" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Avg unit price</span>
              <Input value={priceValue} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="text-right" />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">What this event was worth</span>
            <Input
              value={notesValue}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal event — measured on attendance rather than revenue."
            />
          </label>

          <dl className="grid grid-cols-3 gap-3 rounded-lg border border-hairline bg-surface-sunken p-3">
            <div>
              <dt className="text-xs text-muted-foreground">Attributed revenue</dt>
              <dd data-numeric className="text-sm font-semibold text-foreground">
                {formatMoney(revenue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Net</dt>
              <dd data-numeric className={cn("text-sm font-semibold", net < 0 ? "text-danger-text" : "text-success-text")}>
                {formatMoney(net)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Revenue vs cost</dt>
              <dd data-numeric className="text-sm font-semibold text-foreground">
                {ratio === null ? "—" : `${ratio}%`}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={save.isPending}>
              Save return
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

export default function BudgetSection({ event }: { event: Event }) {
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
      <SponsorsPanel event={event} />
      <AuctionPanel event={event} />
      <RafflePanel event={event} />
      <RoiPanel event={event} />
    </div>
  );
}
