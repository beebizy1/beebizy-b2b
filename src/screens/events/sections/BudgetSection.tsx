/**
 * Money: budget, ticketing and fundraising in one place.
 *
 * These were four separate tabs — Budget, Tickets, Fundraising, plus SilentAuction /
 * LiveAuction / Raffle — which made "how is this event doing financially?" a question
 * you had to answer by hand. Every amount here is integer cents end to end.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Copy, ExternalLink, Gavel, Handshake, Pencil, Plus, Sparkles, Ticket, Trash2, Trophy, X } from "lucide-react";
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
  useAuctionDonors,
  useAddAuctionDonor,
  useUpdateAuctionDonor,
  useSendAuctionDonorThankYou,
  useBudget,
  useDrawRaffle,
  useEventRoi,
  useRaffleItems,
  useRemoveAuctionItem,
  useRemoveBudgetItem,
  useRemoveRaffleItem,
  useUpdateRaffleItem,
  useRemoveSponsorship,
  useRemoveTicketType,
  useSaveEventRoi,
  useSellRaffleTickets,
  useSponsorships,
  useTickets,
  useTicketOrders,
  useRefundTicketOrder,
  useUpdateAuctionItem,
  useShareAuction,
  useUpdateAuctionSettings,
  usePublishAuctionItem,
  useUploadAuctionImage,
  useCloseAuctionItem,
  useOfferAuctionSecondChance,
  useAuctionOrders,
  useAuctionBidders,
  useAuctionBids,
  useRefundAuctionOrder,
  useExtendAuctionItem,
  useExtendAuctionItems,
  useUpdateBudgetItem,
  useUpdateSponsorship,
  useUpdateTicketType,
} from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import { ticketDraftFromForm } from "@/data/ticketDraft";
import { buildBudgetSuggestions, reallocateBudgetAmounts, suggestedTotalBudgetCents } from "@/data/planner";
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
import EventSpreadsheetImportDialog from "../EventSpreadsheetImportDialog";
import { normalizeAuctionPageSettings } from "@/data/auctionSettings";
import { csvCell } from "@/data/spreadsheet";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "@/lib/datetime";
import TicketInvitationBuilder from "./TicketInvitationBuilder";

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

  useEffect(() => setDraft(centsToInput(value)), [value]);

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

export function BudgetPanel({ event }: { event: Event }) {
  const { data: items, isLoading, isError, error, refetch } = useBudget(event.id);
  const add = useAddBudgetItem();
  const update = useUpdateBudgetItem();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<BudgetLineType>("expense");
  const [category, setCategory] = useState("General");
  const [notes, setNotes] = useState("");
  const [adjustingTotal, setAdjustingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState("");

  const expenses = (items ?? []).filter((item) => item.type === "expense");
  const revenue = (items ?? []).filter((item) => item.type === "revenue");
  const plannedSpend = sumCents(expenses.map((item) => item.estimatedCents));
  const actualSpend = sumCents(expenses.map((item) => item.actualCents));
  const headcount = event.capacity ?? Math.max(event.registrationCount, 100);
  const suggestedTotal = suggestedTotalBudgetCents(headcount);
  const suggestedLines = buildBudgetSuggestions(suggestedTotal);

  const addSuggestedBudget = async () => {
    const results = await Promise.allSettled(
      suggestedLines.map((line, index) =>
        add.mutateAsync({
          eventId: event.id,
          draft: {
            name: line.name,
            category: line.category,
            type: "expense",
            estimatedCents: line.estimatedCents,
            notes: line.rationale,
            sortOrder: index,
          },
        }),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    toast({
      title: failed ? "Some suggestions couldn't be added" : "Suggested budget added",
      description: failed
        ? `${results.length - failed} of ${results.length} lines were added.`
        : `${formatMoney(suggestedTotal)} across ${suggestedLines.length} editable lines.`,
    });
  };

  const saveAdjustedTotal = async () => {
    const target = centsFromInput(totalDraft);
    if (target === null || target < 0 || expenses.length === 0) return;
    const amounts = reallocateBudgetAmounts(
      expenses.map((item) => item.estimatedCents),
      target,
    );
    const results = await Promise.allSettled(
      expenses.map((item, index) =>
        update.mutateAsync({
          eventId: event.id,
          id: item.id,
          patch: { estimatedCents: amounts[index] ?? 0 },
        }),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    await refetch();
    if (failed === 0) {
      setAdjustingTotal(false);
      toast({
        title: "Planned budget updated",
        description: `${formatMoney(target)} was reallocated across ${expenses.length} expense lines.`,
      });
    } else {
      toast({
        title: "Budget only partially updated",
        description: `${results.length - failed} of ${results.length} lines were saved. Review the refreshed amounts and try again.`,
      });
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Budget"
        description={`${expenses.length} expense lines, ${revenue.length} revenue lines`}
        actions={
          <>
            <EventSpreadsheetImportDialog event={event} />
            {expenses.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => void addSuggestedBudget()} disabled={add.isPending}>
                <Sparkles className="mr-1.5 size-3.5 text-primary-text" />
                Suggest {formatMoney(suggestedTotal, { compact: true })} for {headcount} guests
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTotalDraft(centsToInput(plannedSpend));
                  setAdjustingTotal(true);
                }}
              >
                <Pencil className="mr-1.5 size-3.5" />
                Adjust total
              </Button>
            )}
          </>
        }
      />

      {adjustingTotal ? (
        <form
          className="flex flex-wrap items-end gap-3 border-b border-hairline bg-primary-wash px-5 py-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void saveAdjustedTotal();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="planned-budget-total" className="text-xs font-semibold text-foreground">
              Planned expense budget
            </label>
            <div className="relative w-48">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="planned-budget-total"
                value={totalDraft}
                onChange={(inputEvent) => setTotalDraft(inputEvent.target.value)}
                inputMode="decimal"
                className="pl-7 text-right font-semibold"
                autoFocus
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={centsFromInput(totalDraft) === null || update.isPending}>
            Save new total
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdjustingTotal(false)}>
            Cancel
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            The new total is reallocated across the current expense lines. You can still edit any line individually below.
          </p>
        </form>
      ) : null}

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
        className="grid gap-3 border-b border-hairline px-5 py-4 sm:grid-cols-2 lg:grid-cols-5"
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

export function TicketsPanel({ event }: { event: Event }) {
  const { data: tickets, isLoading } = useTickets(event.id);
  const add = useAddTicketType();
  const update = useUpdateTicketType();
  const remove = useRemoveTicketType();
  const { data: orders, isLoading: ordersLoading } = useTicketOrders(event.id);
  const refund = useRefundTicketOrder();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [ticketFmv, setTicketFmv] = useState("");
  const [ticketBenefits, setTicketBenefits] = useState("");
  const [ticketFmvZeroConfirmed, setTicketFmvZeroConfirmed] = useState(false);
  const [allocation, setAllocation] = useState("");

  const revenue = sumCents((tickets ?? []).map((ticket) => ticket.priceCents * ticket.quantitySold));
  const sold = (tickets ?? []).reduce((total, ticket) => total + ticket.quantitySold, 0);
  // Capped tiers only: an unlimited tier has no share of a fixed allocation to fill.
  const allocated = (tickets ?? []).reduce((total, ticket) => total + ticket.quantityTotal, 0);
  const capacityFilled = event.capacity ? Math.round((sold / event.capacity) * 100) : null;

  /** The page a guest buys from. Only exists once the event has been shared. */
  const guestLink = event.shareToken ? `${window.location.origin}/e/${event.shareToken}/tickets` : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Tickets sold" value={String(sold)} icon={Ticket} />
        <StatTile label="Revenue collected" value={formatMoney(revenue)} tone="success" />
        <StatTile
          label="Capacity filled"
          value={capacityFilled === null ? "—" : `${capacityFilled}%`}
          sublabel={
            event.capacity
              ? `${sold} of ${event.capacity}`
              : allocated > 0
                ? `${allocated} allocated across tiers`
                : "No capacity set"
          }
        />
      </div>

      {guestLink ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Guest ticket link</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{guestLink}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(guestLink);
              toast({ title: "Link copied" });
            }}
          >
            <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
            Copy
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={guestLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
              Open
            </a>
          </Button>
        </Panel>
      ) : (
        <p className="rounded-lg border border-hairline bg-surface-sunken px-4 py-3 text-sm text-muted-foreground">
          Publish the event to get a guest ticket link.
        </p>
      )}

    <Panel>
      <PanelHeader
        title="Tickets"
        description={tickets?.length ? `${sold} sold · ${formatMoney(revenue)} booked` : "No ticket types yet"}
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const draft = ticketDraftFromForm({ name, price, quantity: allocation, fairMarketValue: ticketFmv, zeroValueConfirmed: ticketFmvZeroConfirmed, benefitsDescription: ticketBenefits });
          if (!draft) return;
          const samePrice = (tickets ?? []).find((ticket) => ticket.priceCents === draft.priceCents && ticket.isActive);
          if (samePrice && !window.confirm(`You already have “${samePrice.name}” at ${formatMoney(draft.priceCents)}. Add another ticket option at the same price?`)) return;
          add.mutate(
            { eventId: event.id, draft },
            {
              onSuccess: () => {
                setName("");
                setPrice("");
                setTicketFmv("");
                setTicketBenefits("");
                setTicketFmvZeroConfirmed(false);
                setAllocation("");
              },
              onError: (mutationError) => toast({ title: "Couldn't add ticket type", description: mutationError.message }),
            },
          );
        }}
      >
        <label className="space-y-1.5 text-xs font-medium text-foreground"><span>Ticket option name</span><Input value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} placeholder="General admission" aria-label="Ticket option name" /></label>
        <label className="space-y-1.5 text-xs font-medium text-foreground"><span>Price per ticket</span><Input value={price} onChange={(inputEvent) => setPrice(inputEvent.target.value)} placeholder="150.00" inputMode="decimal" aria-label="Ticket price" className="text-right" /></label>
        <label className="space-y-1.5 text-xs font-medium text-foreground"><span>Value of benefits</span><Input value={ticketFmv} onChange={(inputEvent) => setTicketFmv(inputEvent.target.value)} placeholder="Meal, entertainment, etc." inputMode="decimal" aria-label="Fair market value per ticket" className="text-right" /></label>
        <label className="space-y-1.5 text-xs font-medium text-foreground"><span>Total tickets available</span><Input value={allocation} onChange={(inputEvent) => setAllocation(inputEvent.target.value)} placeholder="0 = unlimited" inputMode="numeric" aria-label="Total tickets available, zero for unlimited" className="text-right" /></label>
        <label className="space-y-1.5 text-xs font-medium text-foreground"><span>Benefits description</span><Input value={ticketBenefits} onChange={(inputEvent) => setTicketBenefits(inputEvent.target.value)} placeholder="Dinner and program" aria-label="Ticket benefits description" /></label>
        {(centsFromInput(price) ?? 0) > 0 && centsFromInput(ticketFmv) === 0 ? <label className="flex items-center gap-2 text-xs text-warning-text sm:col-span-2 lg:col-span-5"><input type="checkbox" checked={ticketFmvZeroConfirmed} onChange={(event) => setTicketFmvZeroConfirmed(event.target.checked)} />I confirm this paid ticket provides no goods or services.</label> : null}
        <Button type="submit" size="sm" className="justify-self-start sm:col-span-2 lg:col-span-5" disabled={!name.trim() || centsFromInput(price) === null || ((centsFromInput(price) ?? 0) > 0 && centsFromInput(ticketFmv) === null) || ((centsFromInput(price) ?? 0) > 0 && centsFromInput(ticketFmv) === 0 && !ticketFmvZeroConfirmed) || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Add each ticket option once. “Total tickets available” controls inventory for that option; use 0 only when it should be unlimited. Guests choose their household quantity later.</p>
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
                {ticket.priceCents > 0 ? <p className="text-xs text-muted-foreground">FMV {ticket.fairMarketValueCents == null ? "missing" : formatMoney(ticket.fairMarketValueCents)}{ticket.benefitsDescription ? ` · ${ticket.benefitsDescription}` : ""}</p> : null}
                {ticket.priceCents > 0 ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>FMV</span><MoneyCell value={ticket.fairMarketValueCents ?? null} label={`FMV for ${ticket.name}`} onCommit={(next) => { if (next === 0 && !window.confirm("Confirm this paid ticket provides no goods or services and should have a $0 fair market value.")) return; update.mutate({ eventId: event.id, id: ticket.id, patch: { fairMarketValueCents: next, fmvZeroConfirmed: next === 0 } }); }} /><Input defaultValue={ticket.benefitsDescription ?? ""} placeholder="Benefits description" className="h-8 max-w-xs" onBlur={(inputEvent) => { const next = inputEvent.target.value.trim() || null; if (next !== ticket.benefitsDescription) update.mutate({ eventId: event.id, id: ticket.id, patch: { benefitsDescription: next } }); }} />{ticket.fairMarketValueCents === 0 ? <Pill tone={ticket.fmvZeroConfirmed ? "success" : "warning"}>{ticket.fmvZeroConfirmed ? "Confirmed: no goods/services" : "Confirmation required"}</Pill> : null}</div> : null}
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
    <TicketInvitationBuilder event={event} />
    <Panel>
      <PanelHeader
        title="Ticket orders"
        description={orders?.length ? `${orders.length} orders with buyer and payment status` : "Paid and free orders will appear here"}
      />
      {ordersLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (orders ?? []).length === 0 ? (
        <EmptyState icon={Coins} title="No ticket orders yet" description="Share the guest ticket link to start accepting registrations." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(orders ?? []).map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{order.buyerName}</p>
                <p className="truncate text-xs text-muted-foreground">{order.buyerEmail}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.guests.map((guest) => guest.fullName).join(", ")}
                </p>
              </div>
              <div className="text-right">
                <p data-numeric className="text-sm font-semibold text-foreground">{formatMoney(order.amountCents)}</p>
                <Pill tone={order.status === "paid" ? "success" : order.status === "refunded" ? "warning" : undefined}>
                  {order.status}
                </Pill>
              </div>
              {order.status === "paid" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refund.isPending}
                  onClick={() => { if (!window.confirm(`Refund ${formatMoney(order.amountCents)} to ${order.buyerName}? Their registrations will be cancelled and a corrected receipt will be issued.`)) return; refund.mutate(
                    { eventId: event.id, orderId: order.id },
                    {
                      onSuccess: () => toast({ title: "Ticket order refunded" }),
                      onError: (error) => toast({ title: "Couldn't refund order", description: error.message }),
                    },
                  ); }}
                >
                  Refund
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
    </div>
  );
}

/**
 * Auction lots.
 *
 * `only` narrows the panel to one auction type, which is how the silent and live tabs
 * each get their own board. Left off, the panel shows every lot and lets the author pick
 * the type per lot.
 */
export function AuctionPanel({ event, only }: { event: Event; only?: AuctionKind }) {
  const { data: allLots, isLoading } = useAuctionItems(event.id);
  const add = useAddAuctionItem();
  const update = useUpdateAuctionItem();
  const remove = useRemoveAuctionItem();
  const shareAuction = useShareAuction();
  const updateSettings = useUpdateAuctionSettings();
  const publish = usePublishAuctionItem();
  const uploadImage = useUploadAuctionImage();
  const closeAuction = useCloseAuctionItem();
  const secondChance = useOfferAuctionSecondChance();
  const { data: auctionOrders } = useAuctionOrders(event.id);
  const { data: auctionBidders } = useAuctionBidders(event.id);
  const { data: auctionBidHistory } = useAuctionBids(event.id);
  const refundAuction = useRefundAuctionOrder();
  const extendAuctionItem = useExtendAuctionItem();
  const extendAuctionItems = useExtendAuctionItems();
  const { data: donors } = useAuctionDonors(event.id);
  const addDonor = useAddAuctionDonor();
  const updateDonor = useUpdateAuctionDonor();
  const sendDonorThankYou = useSendAuctionDonorThankYou();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AuctionKind>(only ?? "silent");
  const [opening, setOpening] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [fairMarketValue, setFairMarketValue] = useState("");
  const [increment, setIncrement] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [auctionToken, setAuctionToken] = useState(event.auctionPublicToken ?? null);
  const [auctionSettings, setAuctionSettings] = useState(() => normalizeAuctionPageSettings(event.auctionPage));
  const [donorBusiness, setDonorBusiness] = useState("");
  const [donorContact, setDonorContact] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [bulkExtendScope, setBulkExtendScope] = useState("");
  const [bulkExtendMinutes, setBulkExtendMinutes] = useState("2");
  const [notifyOnExtend, setNotifyOnExtend] = useState(true);

  const lots = only ? allLots?.filter((lot) => lot.auctionType === only) : allLots;
  const bids = sumCents((lots ?? []).map((lot) => lot.currentBidCents));
  useEffect(() => setAuctionSettings(normalizeAuctionPageSettings(event.auctionPage)), [event.auctionPage]);
  const settings = auctionSettings;
  const auctionUrl = auctionToken ? `${window.location.origin}/auction/${auctionToken}` : null;
  const bulkCategories = [...new Set((lots ?? []).map((lot) => lot.category).filter((value): value is string => Boolean(value)))].sort();
  const bulkWaves = [...new Set((lots ?? []).map((lot) => lot.closingWave).filter((value): value is string => Boolean(value)))].sort();

  const saveSetting = (patch: Partial<typeof settings>) => {
    const next = { ...auctionSettings, ...patch };
    updateSettings.mutate(
      { eventId: event.id, settings: next },
      {
        onSuccess: setAuctionSettings,
        onError: (error) => toast({ title: "Couldn't update auction settings", description: error.message }),
      },
    );
  };

  return (
    <div className="space-y-6">
    <Panel>
      <PanelHeader
        title={only === "live" ? "Live auction lots" : only === "silent" ? "Silent auction lots" : "Auction lots"}
        description={
          lots?.length
            ? `${lots.length} lots · ${formatMoney(bids)} in current bids`
            : only === "live"
              ? "Live lots run after dinner"
              : only === "silent"
                ? "Silent lots open at reception"
                : "Silent lots open at reception; live lots run after dinner"
        }
      />

      <div className="space-y-4 border-b border-hairline bg-surface-sunken/40 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Public auction page</p>
            <p className="truncate text-xs text-muted-foreground">{auctionUrl ?? "Create a private, shareable auction link for donors and bidders."}</p>
          </div>
          {auctionUrl ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(auctionUrl); toast({ title: "Auction link copied" }); }}><Copy className="mr-1.5 size-3.5" />Copy</Button>
              <Button asChild variant="outline" size="sm"><a href={auctionUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 size-3.5" />Open</a></Button>
            </>
          ) : (
            <Button size="sm" disabled={shareAuction.isPending} onClick={() => shareAuction.mutate(event.id, {
              onSuccess: (result) => setAuctionToken(result.auctionPublicToken),
              onError: (error) => toast({ title: "Couldn't create auction link", description: error.message }),
            })}>Create auction link</Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={settings.registrationOpen ? "default" : "outline"} onClick={() => saveSetting({ registrationOpen: !settings.registrationOpen })}>Bidder registration {settings.registrationOpen ? "open" : "closed"}</Button>
          <Button type="button" size="sm" variant={settings.catalogPublished ? "default" : "outline"} onClick={() => saveSetting({ catalogPublished: !settings.catalogPublished })}>Catalog {settings.catalogPublished ? "published" : "hidden"}</Button>
          <Button type="button" size="sm" variant={settings.allowRemoteBidders ? "default" : "outline"} onClick={() => saveSetting({ allowRemoteBidders: !settings.allowRemoteBidders })}>Remote bidding {settings.allowRemoteBidders ? "on" : "off"}</Button>
          <Button type="button" size="sm" variant={settings.automaticBiddingEnabled ? "default" : "outline"} onClick={() => saveSetting({ automaticBiddingEnabled: !settings.automaticBiddingEnabled })}>Automatic bidding {settings.automaticBiddingEnabled ? "on" : "off"}</Button>
          <Button type="button" size="sm" variant={settings.secondChanceEnabled ? "default" : "outline"} onClick={() => saveSetting({ secondChanceEnabled: !settings.secondChanceEnabled })}>Second chance {settings.secondChanceEnabled ? "on" : "off"}</Button>
          <Button type="button" size="sm" variant={settings.staggeredClosingEnabled ? "default" : "outline"} onClick={() => saveSetting({ staggeredClosingEnabled: !settings.staggeredClosingEnabled })}>Staggered closing {settings.staggeredClosingEnabled ? "on" : "off"}</Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Auction close<Input type="datetime-local" value={toDateTimeLocalInput(settings.closesAt)} onChange={(inputEvent) => saveSetting({ closesAt: fromDateTimeLocalInput(inputEvent.target.value) })} className="w-52" /></label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Auto-extend minutes<Input type="number" min={0} max={60} value={settings.autoExtendMinutes} onChange={(inputEvent) => saveSetting({ autoExtendMinutes: Math.max(0, Math.min(60, Number(inputEvent.target.value) || 0)) })} className="w-20" /></label>
          <Button type="button" size="sm" variant={settings.automaticClosingAlertsEnabled ? "default" : "outline"} onClick={() => saveSetting({ automaticClosingAlertsEnabled: !settings.automaticClosingAlertsEnabled })}>Closing alerts {settings.automaticClosingAlertsEnabled ? "on" : "off"}</Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Alert minutes<Input key={settings.closingAlertMinutes.join(",")} defaultValue={settings.closingAlertMinutes.join(", ")} onBlur={(inputEvent) => saveSetting({ closingAlertMinutes: [...new Set(inputEvent.target.value.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter((value) => Number.isInteger(value) && value >= 1 && value <= 120))] })} placeholder="15, 5" className="w-28" /></label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Blast cooldown<Input type="number" min={1} max={60} value={settings.broadcastCooldownMinutes} onChange={(inputEvent) => saveSetting({ broadcastCooldownMinutes: Math.max(1, Math.min(60, Number(inputEvent.target.value) || 3)) })} className="w-20" />min</label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Bid history<select value={settings.bidHistoryPrivacy} onChange={(event) => saveSetting({ bidHistoryPrivacy: event.target.value as "paddle" | "initials" })} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="paddle">Paddle number</option><option value="initials">Initials</option></select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-background p-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bulk extend</span><select value={bulkExtendScope} onChange={(event) => setBulkExtendScope(event.target.value)} className="h-9 min-w-48 rounded-md border border-input bg-background px-2 text-sm"><option value="">Choose category or wave</option>{bulkCategories.map((value) => <option key={`category-${value}`} value={`category:${value}`}>Category: {value}</option>)}{bulkWaves.map((value) => <option key={`wave-${value}`} value={`wave:${value}`}>Closing wave: {value}</option>)}</select><Input className="w-24" type="number" min={1} max={120} value={bulkExtendMinutes} onChange={(event) => setBulkExtendMinutes(event.target.value)} aria-label="Bulk extension minutes" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={notifyOnExtend} onChange={(event) => setNotifyOnExtend(event.target.checked)} />Notify bidders and watchers</label><Button size="sm" variant="outline" disabled={!bulkExtendScope || extendAuctionItems.isPending} onClick={() => { const [kindName, value] = bulkExtendScope.split(":", 2); const itemIds = (lots ?? []).filter((lot) => lot.status === "open" && (kindName === "category" ? lot.category === value : lot.closingWave === value)).map((lot) => lot.id); extendAuctionItems.mutate({ eventId: event.id, itemIds, minutes: Math.max(1, Math.min(120, Number(bulkExtendMinutes) || 2)), notify: notifyOnExtend }, { onSuccess: (result) => toast({ title: `${result.extended} item${result.extended === 1 ? "" : "s"} extended`, description: notifyOnExtend ? "Bidders and watchers were notified." : "No notifications were sent." }), onError: (error) => toast({ title: "Couldn't extend items", description: error.message }) }); }}>{notifyOnExtend ? "Extend and notify" : "Extend quietly"}</Button></div>
      </div>

      <form
        className="grid gap-3 border-b border-hairline px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          const nextLot = (allLots ?? []).reduce((max, lot) => Math.max(max, lot.lotNumber ?? 0), 0) + 1;
          add.mutate(
            {
              eventId: event.id,
              draft: {
                title: trimmed,
                description: description.trim() || null,
                imageUrl: imageUrl || null,
                category: category.trim() || null,
                auctionType: kind,
                startingBidCents: centsFromInput(opening),
                fairMarketValueCents: centsFromInput(fairMarketValue),
                bidIncrementCents: centsFromInput(increment),
                closesAt: fromDateTimeLocalInput(closesAt),
                lotNumber: nextLot,
              },
            },
            {
              onSuccess: () => {
                setTitle("");
                setOpening("");
                setDescription("");
                setCategory("");
                setFairMarketValue("");
                setIncrement("");
                setClosesAt("");
                setImageUrl("");
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
          className="min-w-[10rem]"
        />
        <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" aria-label="Auction category" />
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" aria-label="Auction description" className="lg:col-span-2" />
        {only ? null : (
          <Select value={kind} onValueChange={(value) => setKind(value as AuctionKind)}>
            <SelectTrigger className="w-[110px]" aria-label="Auction type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="silent">Silent</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Input
          value={opening}
          onChange={(inputEvent) => setOpening(inputEvent.target.value)}
          placeholder="Opening bid"
          inputMode="decimal"
          aria-label="Opening bid"
          className="text-right"
        />
        <Input value={fairMarketValue} onChange={(event) => setFairMarketValue(event.target.value)} placeholder="Fair market value" inputMode="decimal" aria-label="Fair market value" className="text-right" />
        <Input value={increment} onChange={(event) => setIncrement(event.target.value)} placeholder="Bid increment" inputMode="decimal" aria-label="Bid increment" className="text-right" />
        <Input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} aria-label="Closing time" />
        <label className="flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
          {uploadImage.isPending ? "Uploading photo…" : imageUrl ? "Photo uploaded" : "Upload item photo"}
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            uploadImage.mutate(file, {
              onSuccess: setImageUrl,
              onError: (error) => toast({ title: "Couldn't upload photo", description: error.message }),
            });
          }} />
        </label>
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending || uploadImage.isPending} className="lg:col-span-4">
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
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-medium text-primary">Review catalog details</summary>
                  <div className="mt-3 grid gap-2 rounded-lg border border-hairline bg-surface-sunken p-3 sm:grid-cols-2">
                    <Input defaultValue={lot.category ?? ""} placeholder="Category" aria-label={`Category for ${lot.title}`} onBlur={(inputEvent) => {
                      const next = inputEvent.target.value.trim() || null;
                      if (next !== (lot.category ?? null)) update.mutate({ eventId: event.id, id: lot.id, patch: { category: next } });
                    }} />
                    <Input defaultValue={lot.description ?? ""} placeholder="Description" aria-label={`Description for ${lot.title}`} onBlur={(inputEvent) => {
                      const next = inputEvent.target.value.trim() || null;
                      if (next !== lot.description) update.mutate({ eventId: event.id, id: lot.id, patch: { description: next } });
                    }} />
                    <label className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5"><span>Starting bid</span><MoneyCell value={lot.startingBidCents} label={`Starting bid for ${lot.title}`} onCommit={(next) => update.mutate({ eventId: event.id, id: lot.id, patch: { startingBidCents: next } })} /></label>
                    <label className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5"><span>Fair market value</span><MoneyCell value={lot.fairMarketValueCents} label={`Fair market value for ${lot.title}`} onCommit={(next) => update.mutate({ eventId: event.id, id: lot.id, patch: { fairMarketValueCents: next } })} /></label>
                    <label className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5"><span>Bid increment</span><MoneyCell value={lot.bidIncrementCents ?? null} label={`Bid increment for ${lot.title}`} onCommit={(next) => update.mutate({ eventId: event.id, id: lot.id, patch: { bidIncrementCents: next } })} /></label>
                    <label className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5"><span>Buy now</span><MoneyCell value={lot.buyNowCents ?? null} label={`Buy now price for ${lot.title}`} onCommit={(next) => update.mutate({ eventId: event.id, id: lot.id, patch: { buyNowCents: next } })} /></label>
                    <label className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5"><span>Reserve</span><MoneyCell value={lot.reserveCents ?? null} label={`Reserve for ${lot.title}`} onCommit={(next) => update.mutate({ eventId: event.id, id: lot.id, patch: { reserveCents: next } })} /></label>
                    <Input type="number" min={1} defaultValue={lot.quantityAvailable ?? 1} aria-label={`Quantity available for ${lot.title}`} onBlur={(inputEvent) => update.mutate({ eventId: event.id, id: lot.id, patch: { quantityAvailable: Math.max(1, Number(inputEvent.target.value) || 1) } })} />
                    <select defaultValue={lot.incrementRule ?? "tiered"} onChange={(inputEvent) => update.mutate({ eventId: event.id, id: lot.id, patch: { incrementRule: inputEvent.target.value as "tiered" | "fixed" } })} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="tiered">Tiered bid increment</option><option value="fixed">Fixed bid increment</option></select>
                    <select defaultValue={lot.itemType ?? lot.auctionType} onChange={(inputEvent) => update.mutate({ eventId: event.id, id: lot.id, patch: { itemType: inputEvent.target.value as "silent" | "live" | "buy_now" | "fixed_price" | "fund_a_need" } })} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="silent">Silent auction</option><option value="live">Live auction</option><option value="buy_now">Buy it now</option><option value="fixed_price">Fixed-price signup</option><option value="fund_a_need">Fund-a-Need</option></select>
                    <Input defaultValue={lot.closingWave ?? ""} placeholder="Closing wave, e.g. Travel 8:00 PM" aria-label={`Closing wave for ${lot.title}`} onBlur={(inputEvent) => { const next = inputEvent.target.value.trim() || null; if (next !== lot.closingWave) update.mutate({ eventId: event.id, id: lot.id, patch: { closingWave: next } }); }} />
                    <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2"><input type="checkbox" defaultChecked={lot.showFairMarketValue !== false} onChange={(inputEvent) => update.mutate({ eventId: event.id, id: lot.id, patch: { showFairMarketValue: inputEvent.target.checked } })} />Show estimated value to bidders</label>
                    <Input type="datetime-local" defaultValue={toDateTimeLocalInput(lot.closesAt)} aria-label={`Closing time for ${lot.title}`} onBlur={(inputEvent) => {
                      const next = fromDateTimeLocalInput(inputEvent.target.value);
                      if (next !== lot.closesAt) update.mutate({ eventId: event.id, id: lot.id, patch: { closesAt: next } });
                    }} />
                  </div>
                </details>
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

              <Button
                type="button"
                size="sm"
                variant={lot.isPublished ? "outline" : "default"}
                disabled={publish.isPending}
                onClick={() => publish.mutate(
                  { eventId: event.id, itemId: lot.id, published: !lot.isPublished },
                  {
                    onSuccess: () => toast({ title: lot.isPublished ? "Item hidden from catalog" : "Item published" }),
                    onError: (error) => toast({ title: "Item is not ready", description: error.message }),
                  },
                )}
              >
                {lot.isPublished ? "Unpublish" : "Publish"}
              </Button>
              {lot.status === "open" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={closeAuction.isPending}
                  onClick={() => closeAuction.mutate(
                    { eventId: event.id, itemId: lot.id },
                    {
                      onSuccess: (result) => toast({
                        title: result.status === "winner-notified" ? "Winner notified" : "Item closed with no bids",
                        description: result.paymentUrl ? "A secure payment link was emailed to the winner." : undefined,
                      }),
                      onError: (error) => toast({ title: "Couldn't close item", description: error.message }),
                    },
                  )}
                >
                  Close item
                </Button>
              ) : null}
              {lot.status === "open" ? [1, 2, 5].map((minutes) => (
                <Button key={minutes} type="button" size="sm" variant="outline" disabled={extendAuctionItem.isPending} onClick={() => extendAuctionItem.mutate({ eventId: event.id, itemId: lot.id, minutes, notify: notifyOnExtend }, { onSuccess: () => toast({ title: `${lot.title} extended ${minutes} minute${minutes === 1 ? "" : "s"}`, description: notifyOnExtend ? "Bidders and watchers were notified." : "No notifications were sent." }), onError: (error) => toast({ title: "Couldn't extend item", description: error.message }) })}>+{minutes} min</Button>
              )) : null}
              {lot.status === "won" && settings.secondChanceEnabled ? (
                <Button type="button" size="sm" variant="outline" disabled={secondChance.isPending} onClick={() => secondChance.mutate(
                  { eventId: event.id, itemId: lot.id },
                  {
                    onSuccess: () => toast({ title: "Second-chance offer sent", description: "The runner-up received a secure payment link." }),
                    onError: (error) => toast({ title: "Couldn't send second-chance offer", description: error.message }),
                  },
                )}>Offer to runner-up</Button>
              ) : null}

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
    <Panel>
      <PanelHeader title="Auction donors" description="Track who donated each item and share their private intake link." />
      <form
        className="grid gap-3 border-b border-hairline px-5 py-4 sm:grid-cols-4"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (!donorBusiness.trim()) return;
          addDonor.mutate({
            eventId: event.id,
            draft: {
              businessName: donorBusiness.trim(),
              contactName: donorContact.trim() || null,
              email: donorEmail.trim() || null,
              solicitationStatus: "contacted",
            },
          }, {
            onSuccess: () => { setDonorBusiness(""); setDonorContact(""); setDonorEmail(""); },
            onError: (error) => toast({ title: "Couldn't add donor", description: error.message }),
          });
        }}
      >
        <Input value={donorBusiness} onChange={(event) => setDonorBusiness(event.target.value)} placeholder="Business or donor" required />
        <Input value={donorContact} onChange={(event) => setDonorContact(event.target.value)} placeholder="Contact name" />
        <Input value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} placeholder="Email" type="email" />
        <Button type="submit" disabled={!donorBusiness.trim() || addDonor.isPending}><Plus className="mr-1.5 size-4" />Add donor</Button>
      </form>
      {(donors ?? []).length === 0 ? (
        <EmptyState icon={Handshake} title="No donors yet" description="Add a donor to create a private donation intake link." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(donors ?? []).map((donor) => {
            const donorLink = `${window.location.origin}/donate/${donor.publicToken}`;
            return (
              <li key={donor.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{donor.businessName}</p>
                  <p className="truncate text-xs text-muted-foreground">{donor.contactName || donor.email || "Contact not added"}</p>
                  <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary">Donor contact, history, and notes</summary><div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <Input defaultValue={donor.businessName} placeholder="Business or donor" className="h-8" onBlur={(inputEvent) => { const next = inputEvent.target.value.trim(); if (next && next !== donor.businessName) updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { businessName: next } }); }} />
                    <Input defaultValue={donor.contactName ?? ""} placeholder="Contact name" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { contactName: inputEvent.target.value.trim() || null } })} />
                    <Input defaultValue={donor.email ?? ""} placeholder="Email" type="email" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { email: inputEvent.target.value.trim() || null } })} />
                    <Input defaultValue={donor.phone ?? ""} placeholder="Phone" type="tel" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { phone: inputEvent.target.value.trim() || null } })} />
                    <Input defaultValue={donor.solicitedBy ?? ""} placeholder="Solicited by" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { solicitedBy: inputEvent.target.value.trim() || null } })} />
                    <Input defaultValue={donor.previousDonations ?? ""} placeholder="Previous donations" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { previousDonations: inputEvent.target.value.trim() || null } })} />
                    <Input defaultValue={donor.notes ?? ""} placeholder="Internal notes" className="h-8" onBlur={(inputEvent) => updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { notes: inputEvent.target.value.trim() || null } })} />
                  </div></details>
                </div>
                <select value={donor.solicitationStatus} onChange={(inputEvent) => updateDonor.mutate({
                  eventId: event.id,
                  donorId: donor.id,
                  patch: { solicitationStatus: inputEvent.target.value as "prospect" | "contacted" | "committed" | "received" | "declined" },
                })} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label={`Solicitation status for ${donor.businessName}`}>
                  <option value="prospect">Prospect</option><option value="contacted">Contacted</option><option value="committed">Committed</option><option value="received">Received</option><option value="declined">Declined</option>
                </select>
                <Input defaultValue={donor.recognitionPreference ?? ""} placeholder="Recognition preference" className="h-8 w-44" onBlur={(inputEvent) => {
                  const next = inputEvent.target.value.trim() || null;
                  if (next !== donor.recognitionPreference) updateDonor.mutate({ eventId: event.id, donorId: donor.id, patch: { recognitionPreference: next } });
                }} />
                <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(donorLink); toast({ title: "Donor link copied" }); }}><Copy className="mr-1.5 size-3.5" />Copy intake link</Button>
                <Button variant="outline" size="sm" disabled={donor.thankYouStatus === "sent" || sendDonorThankYou.isPending} onClick={() => sendDonorThankYou.mutate(
                  { eventId: event.id, donorId: donor.id },
                  { onSuccess: () => toast({ title: "Donor thank-you sent" }), onError: (error) => toast({ title: "Couldn't send thank-you", description: error.message }) },
                )}>{donor.thankYouStatus === "sent" ? "Thanked" : "Send thank-you"}</Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
    <Panel>
      <PanelHeader
        title="Auction report"
        description="Final prices, market value, bidder activity, no-bid items, and fees."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => {
            const headers = ["Lot", "Item", "Status", "Fair market value", "Current or final bid", "Bid count", "Distinct bidders", "Winner", "Payment", "Fulfillment", "Beebizy fee"];
            const rows = (allLots ?? []).map((lot) => {
              const itemBids = (auctionBidHistory ?? []).filter((bidRow) => bidRow.itemId === lot.id);
              const order = (auctionOrders ?? []).find((orderRow) => orderRow.itemId === lot.id);
              return [
                lot.lotNumber ?? "", lot.title, lot.status, lot.fairMarketValueCents ?? "", lot.currentBidCents ?? "",
                itemBids.length, new Set(itemBids.map((bidRow) => bidRow.bidderId)).size, lot.winnerName ?? "",
                order?.status ?? "no order", order?.fulfillmentStatus ?? lot.fulfillmentStatus ?? "pending",
                order?.status === "paid" ? order.applicationFeeCents : 0,
              ];
            });
            const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-auction-report.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}>Export CSV</Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 border-b border-hairline p-5 lg:grid-cols-3">
        <StatTile label="Registered bidders" value={String(auctionBidders?.length ?? 0)} />
        <StatTile label="At the gala" value={String((auctionBidders ?? []).filter((bidder) => bidder.participantType === "gala").length)} />
        <StatTile label="Remote bidders" value={String((auctionBidders ?? []).filter((bidder) => bidder.participantType === "remote").length)} />
        <StatTile label="Bids placed" value={String(auctionBidHistory?.length ?? 0)} />
        <StatTile label="Items with no bids" value={String((allLots ?? []).filter((lot) => !(auctionBidHistory ?? []).some((bidRow) => bidRow.itemId === lot.id)).length)} />
        <StatTile label="Current proceeds" value={formatMoney(sumCents((allLots ?? []).map((lot) => lot.currentBidCents)))} tone="success" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Item</th><th className="px-3 py-3 text-right">FMV</th><th className="px-3 py-3 text-right">Bid</th><th className="px-3 py-3 text-right">Bids</th><th className="px-3 py-3 text-right">Bidders</th><th className="px-5 py-3">Result</th></tr></thead>
          <tbody className="divide-y divide-hairline">{(allLots ?? []).map((lot) => {
            const itemBids = (auctionBidHistory ?? []).filter((bidRow) => bidRow.itemId === lot.id);
            return <tr key={lot.id}><td className="px-5 py-3 font-medium">{lot.title}</td><td className="px-3 py-3 text-right">{lot.fairMarketValueCents == null ? "-" : formatMoney(lot.fairMarketValueCents)}</td><td className="px-3 py-3 text-right">{lot.currentBidCents == null ? "-" : formatMoney(lot.currentBidCents)}</td><td className="px-3 py-3 text-right">{itemBids.length}</td><td className="px-3 py-3 text-right">{new Set(itemBids.map((bidRow) => bidRow.bidderId)).size}</td><td className="px-5 py-3">{lot.winnerName || (itemBids.length ? lot.status : "No bids")}</td></tr>;
          })}</tbody>
        </table>
      </div>
      {(auctionBidHistory ?? []).length > 0 ? (
        <div className="border-t border-hairline p-5"><p className="mb-2 text-sm font-semibold">Recent bid history</p><ul className="space-y-1 text-xs text-muted-foreground">{(auctionBidHistory ?? []).slice(0, 20).map((bidRow) => <li key={bidRow.id}>{bidRow.bidderName} bid {formatMoney(bidRow.amountCents)} on {(allLots ?? []).find((lot) => lot.id === bidRow.itemId)?.title ?? "an item"}</li>)}</ul></div>
      ) : null}
    </Panel>
    <Panel>
      <PanelHeader title="Auction payments and fulfillment" description="Winning bids, Beebizy fees, payment status, and handoff in one report." />
      {(auctionOrders ?? []).length === 0 ? (
        <EmptyState icon={Coins} title="No winner payments yet" description="Close an item with a winning bid to send its secure payment link." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(auctionOrders ?? []).map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{order.itemTitle}</p>
                <p className="truncate text-xs text-muted-foreground">{order.bidderName} · {order.bidderEmail}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p data-numeric className="text-sm font-semibold text-foreground">{formatMoney(order.amountCents)}</p>
                <p>Beebizy 2%: {formatMoney(order.applicationFeeCents)}</p>
              </div>
              <Pill tone={order.status === "paid" ? "success" : order.status === "refunded" ? "warning" : undefined}>{order.status}</Pill>
              <select
                value={order.fulfillmentStatus}
                onChange={(inputEvent) => update.mutate({
                  eventId: event.id,
                  id: order.itemId,
                  patch: {
                    fulfillmentStatus: inputEvent.target.value as "pending" | "ready" | "picked-up" | "delivered",
                    fulfilledAt: ["picked-up", "delivered"].includes(inputEvent.target.value) ? new Date().toISOString() : null,
                  },
                }, { onError: (error) => toast({ title: "Couldn't update fulfillment", description: error.message }) })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label={`Fulfillment status for ${order.itemTitle}`}
              >
                <option value="pending">Pending</option><option value="ready">Ready</option><option value="picked-up">Picked up</option><option value="delivered">Delivered</option>
              </select>
              {order.status === "paid" ? (
                <Button size="sm" variant="outline" disabled={refundAuction.isPending} onClick={() => { if (!window.confirm(`Refund ${formatMoney(order.amountCents)} to ${order.bidderName}? A corrected receipt will be issued.`)) return; refundAuction.mutate(
                  { eventId: event.id, orderId: order.id },
                  { onSuccess: () => toast({ title: "Auction payment refunded" }), onError: (error) => toast({ title: "Couldn't refund", description: error.message }) },
                ); }}>Refund</Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
    </div>
  );
}

export function RafflePanel({ event }: { event: Event }) {
  const { data: raffles, isLoading } = useRaffleItems(event.id);
  const add = useAddRaffleItem();
  const remove = useRemoveRaffleItem();
  const sell = useSellRaffleTickets();
  const draw = useDrawRaffle();
  const updateRaffle = useUpdateRaffleItem();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [raffleFmv, setRaffleFmv] = useState("");
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

  const ticketsSold = (raffles ?? []).reduce((sum, item) => sum + item.soldTickets, 0);
  const ticketRevenue = sumCents((raffles ?? []).map((item) => item.ticketPriceCents * item.soldTickets));
  const ticketsAvailable = (raffles ?? []).reduce((sum, item) => sum + item.totalTickets, 0);
  const winnersDrawn = (raffles ?? []).filter((item) => item.drawnAt != null).length;

  return (
    <div className="space-y-6">
      {(raffles?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Tickets sold" value={String(ticketsSold)} icon={Ticket} />
          <StatTile label="Ticket revenue" value={formatMoney(ticketRevenue)} tone="success" />
          <StatTile
            label="Total tickets available"
            value={String(ticketsAvailable)}
            sublabel={ticketsAvailable > 0 ? `${ticketsAvailable - ticketsSold} unsold` : undefined}
          />
          <StatTile
            label="Winners drawn"
            value={String(winnersDrawn)}
            tone={winnersDrawn > 0 ? "warning" : "neutral"}
            sublabel={`of ${raffles?.length ?? 0} ${(raffles?.length ?? 0) === 1 ? "prize" : "prizes"}`}
          />
        </div>
      ) : null}

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
                fairMarketValueCents: centsFromInput(raffleFmv),
                totalTickets: Number.isFinite(parsedTotal) ? parsedTotal : 0,
              },
            },
            {
              onSuccess: () => {
                setName("");
                setPrice("");
                setTotal("");
                setRaffleFmv("");
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
        <Input value={raffleFmv} onChange={(event) => setRaffleFmv(event.target.value)} placeholder="Prize FMV" inputMode="decimal" aria-label="Raffle prize fair market value" className="w-28 text-right" />
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
                {raffle.fairMarketValueCents != null ? <span data-numeric className="text-xs text-muted-foreground">Prize value {formatMoney(raffle.fairMarketValueCents)}</span> : null}
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
                              toast({ title: "Winner drawn", description: `${drawn.winnerName} wins ${drawn.name}.${drawn.w2gReviewRequired ? " W-2G review and secure taxpayer-ID collection are required." : ""}` }),
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
              {raffle.w2gReviewRequired ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-tint p-3 text-xs text-warning-text"><strong>W-2G review required.</strong><span>Collect the winner's taxpayer ID through the school's approved secure process. Never type the full ID into Beebizy.</span>{raffle.taxpayerIdCollectionStatus !== "collected" ? <Button size="sm" variant="outline" disabled={updateRaffle.isPending} onClick={() => { if (!window.confirm("Confirm that the winner's taxpayer ID was collected through the school's approved secure process. Beebizy will record your account and the time, but will not store the ID.")) return; updateRaffle.mutate({ eventId: event.id, id: raffle.id, patch: { taxpayerIdCollectionStatus: "collected" } }, { onSuccess: () => toast({ title: "Secure taxpayer-ID collection recorded" }) }); }}>Confirm secure collection</Button> : <Pill tone="success">Secure collection recorded{raffle.taxpayerIdCollectedAt ? ` ${new Date(raffle.taxpayerIdCollectedAt).toLocaleString()}` : ""}</Pill>}</div> : null}

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
    </div>
  );
}

export function SponsorsPanel({ event }: { event: Event }) {
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
export function RoiPanel({ event }: { event: Event }) {
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

/**
 * The four money readings for an event, above the budget table.
 *
 * Budget revenue is reported separately rather than summed with tickets and fundraising:
 * a gala books its sponsorship both as a sponsorship record and as a revenue line, so
 * adding them would double-count.
 */
export function BudgetTotals({ event }: { event: Event }) {
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
    const budgetRevenue = sumCents(revenueLines.map((item) => item.actualCents));
    return { spend, ticketRevenue, fundraising, budgetRevenue };
  }, [budget, tickets, sponsorships, auction, raffles]);

  return (
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
  );
}

/**
 * Budget utilisation and the two ROI readings.
 *
 * Projected uses the estimates, actual uses what was really spent and taken, and they are
 * shown side by side rather than blended: before the event only the projection exists,
 * after it only the actual matters, and averaging them would describe neither.
 *
 * ROI is null rather than zero when there is no spend to divide by — a return on nothing
 * is undefined, not break-even.
 */
export function BudgetRoiSummary({ event }: { event: Event }) {
  const { data: budget, isLoading } = useBudget(event.id);

  const lines = budget ?? [];
  const expenses = lines.filter((line) => line.type === "expense");
  const revenues = lines.filter((line) => line.type === "revenue");

  const estimatedSpend = sumCents(expenses.map((line) => line.estimatedCents));
  const actualSpend = sumCents(expenses.map((line) => line.actualCents));
  const estimatedRevenue = sumCents(revenues.map((line) => line.estimatedCents));
  const actualRevenue = sumCents(revenues.map((line) => line.actualCents));

  const utilisation = estimatedSpend > 0 ? Math.round((actualSpend / estimatedSpend) * 100) : null;
  const projectedRoi =
    estimatedSpend > 0 ? Math.round(((estimatedRevenue - estimatedSpend) / estimatedSpend) * 100) : null;
  const actualRoi = actualSpend > 0 ? Math.round(((actualRevenue - actualSpend) / actualSpend) * 100) : null;

  /**
   * Actual ROI divides recorded revenue by recorded spend, so it is only meaningful once
   * most costs are in. Half the invoices entered against all the income reads as a
   * spectacular return that will collapse as the rest arrive — so the number is labelled
   * partial and kept in neutral ink until the expense lines are complete.
   */
  const linesWithActual = expenses.filter((line) => line.actualCents != null).length;
  const roiIsPartial = expenses.length > 0 && linesWithActual < expenses.length;

  return (
    <Panel>
      <PanelHeader
        title="Summary & ROI"
        description={
          lines.length === 0
            ? "Add budget lines to see utilisation and return"
            : actualSpend > 0
              ? "Actual figures, from what has been recorded against each line"
              : "Based on estimated figures — enter actual amounts post-event"
        }
      />
      {isLoading ? (
        <LoadingRows rows={2} className="p-4" />
      ) : (
        <div className="space-y-4 p-5">
          <Meter
            value={actualSpend}
            max={estimatedSpend > 0 ? estimatedSpend : 1}
            tone={utilisation !== null && utilisation > 100 ? "danger" : "brand"}
            label="Budget utilisation"
            caption={
              utilisation === null
                ? "No budget set"
                : `${utilisation}% · ${formatMoney(actualSpend)} of ${formatMoney(estimatedSpend)}`
            }
          />

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimated</dt>
              <dd data-numeric className="mt-0.5 font-semibold text-foreground">{formatMoney(estimatedSpend)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actual</dt>
              <dd data-numeric className="mt-0.5 font-semibold text-foreground">{formatMoney(actualSpend)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projected ROI</dt>
              <dd data-numeric className="mt-0.5 font-semibold text-foreground">
                {projectedRoi === null ? "—" : `${projectedRoi}%`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actual ROI</dt>
              <dd
                data-numeric
                className={cn(
                  "mt-0.5 font-semibold",
                  actualRoi === null || roiIsPartial
                    ? "text-muted-foreground"
                    : actualRoi >= 0
                      ? "text-success-text"
                      : "text-danger-text",
                )}
              >
                {actualRoi === null ? "Add actual amounts to calculate" : `${actualRoi}%`}
              </dd>
              {actualRoi !== null && roiIsPartial ? (
                <dd className="mt-0.5 text-xs text-warning-text">
                  Partial — {linesWithActual} of {expenses.length} expense lines have actuals
                </dd>
              ) : null}
            </div>
          </dl>
        </div>
      )}
    </Panel>
  );
}
