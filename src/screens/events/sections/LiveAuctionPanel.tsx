/**
 * Running the live auction from the stage.
 *
 * Unlike the silent board — a grid you browse — a live auction is sequential, so this is
 * a presenter view: one active lot, the queue behind it, and the two things you do
 * between lots (sell it, or pass it).
 *
 * The ask is held in local state while a lot is being called, and only written when the
 * lot is sold or explicitly saved. Persisting every click of "+" would put a write on
 * the wire for each shout in the room.
 */

import { useMemo, useState } from "react";
import { Gavel, Pencil, Plus, SkipForward, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, Panel, Pill, StatTile } from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, formatMoney, sumCents } from "@/data/money";
import { bidIncrementCents } from "@/data/fundraising";
import { useAddAuctionItem, useAuctionItems, useUpdateAuctionItem } from "@/data/hooks";
import type { AuctionItem, Event } from "@/data/entities";

/** Lot order is the running order; unnumbered lots go last, oldest first. */
function byLotNumber(a: AuctionItem, b: AuctionItem): number {
  if (a.lotNumber != null && b.lotNumber != null) return a.lotNumber - b.lotNumber;
  if (a.lotNumber != null) return -1;
  if (b.lotNumber != null) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

export default function LiveAuctionPanel({ event }: { event: Event }) {
  const { money } = usePreferences();
  const { data: allLots, isLoading, isError, error, refetch } = useAuctionItems(event.id);
  const add = useAddAuctionItem();
  const update = useUpdateAuctionItem();

  const [ask, setAsk] = useState<Record<string, number>>({});
  const [sold, setSold] = useState<{ item: AuctionItem; winner: string; amount: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newOpening, setNewOpening] = useState("");

  const lots = useMemo(
    () => (allLots ?? []).filter((lot) => lot.auctionType === "live").sort(byLotNumber),
    [allLots],
  );

  const open = lots.filter((lot) => lot.status === "open");
  const settled = lots.filter((lot) => lot.status !== "open");
  const active = open[0] ?? null;
  const upNext = open.slice(1);

  const raised = sumCents(lots.filter((lot) => lot.status === "won").map((lot) => lot.currentBidCents));
  const soldCount = lots.filter((lot) => lot.status === "won").length;

  const currentAsk = active ? (ask[active.id] ?? active.currentBidCents ?? active.startingBidCents ?? 0) : 0;
  const step = bidIncrementCents(currentAsk);

  const bump = (delta: number) => {
    if (!active) return;
    setAsk((current) => ({ ...current, [active.id]: Math.max(0, currentAsk + delta) }));
  };

  const settle = (lot: AuctionItem, status: "won" | "closed", patch: Record<string, unknown> = {}) =>
    update.mutate(
      { eventId: event.id, id: lot.id, patch: { status, ...patch } },
      {
        onSuccess: () => toast({ title: status === "won" ? "Lot sold" : "Lot passed" }),
        onError: (mutationError) => toast({ title: "Couldn't update the lot", description: mutationError.message }),
      },
    );

  if (isError) return <ErrorNotice error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Gavel className="size-4 text-primary-text" aria-hidden="true" />
            Live Auction
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Run lots in order — open a lot, call bids, mark it sold.
          </p>
        </div>
      </div>

      {lots.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Total raised" value={formatMoney(raised)} tone="success" />
          <StatTile label="Lots remaining" value={String(open.length)} />
          <StatTile label="Sold" value={String(soldCount)} tone="warning" />
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : lots.length === 0 ? (
        <Panel className="border-dashed">
          <EmptyState
            icon={Gavel}
            title="No live lots yet"
            description="Add the lots you'll call from the stage, in the order you'll call them."
          />
        </Panel>
      ) : active ? (
        <div className="space-y-3 rounded-2xl border-2 border-success/40 bg-success-tint p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider text-success-text">Active Lot</span>
              {active.lotNumber != null ? <Pill tone="success">Lot #{active.lotNumber}</Pill> : null}
            </div>
          </div>

          <div>
            <p className="text-xl font-bold text-foreground">{active.title}</p>
            {active.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current ask</p>
              <p data-numeric className="text-4xl font-black text-success-text">
                {money(currentAsk)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => bump(-step)} disabled={currentAsk <= 0}>
                −{money(step)}
              </Button>
              <Button variant="outline" onClick={() => bump(step)}>
                +{money(step)}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-success/30 pt-3">
            <Button
              onClick={() =>
                setSold({ item: active, winner: active.winnerName ?? "", amount: String(currentAsk / 100) })
              }
            >
              <Trophy className="mr-1.5 size-4" aria-hidden="true" />
              Mark sold
            </Button>
            <Button variant="outline" onClick={() => settle(active, "closed")}>
              <SkipForward className="mr-1.5 size-4" aria-hidden="true" />
              Pass
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                update.mutate(
                  { eventId: event.id, id: active.id, patch: { currentBidCents: currentAsk } },
                  {
                    onSuccess: () => toast({ title: "Ask saved" }),
                    onError: (mutationError) =>
                      toast({ title: "Couldn't save", description: mutationError.message }),
                  },
                )
              }
            >
              <Pencil className="mr-1.5 size-4" aria-hidden="true" />
              Save ask
            </Button>
          </div>
        </div>
      ) : (
        <Panel>
          <EmptyState icon={Trophy} title="Every live lot has been called" description="Nothing left in the queue." />
        </Panel>
      )}

      {upNext.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up Next</p>
          <ul className="divide-y divide-hairline rounded-xl border border-card-border bg-card">
            {upNext.map((lot) => (
              <li key={lot.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {lot.lotNumber != null ? `Lot #${lot.lotNumber} · ` : ""}
                    {lot.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Opens at {lot.startingBidCents == null ? "no reserve" : formatMoney(lot.startingBidCents)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {settled.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Called</p>
          <ul className="divide-y divide-hairline rounded-xl border border-card-border bg-card">
            {settled.map((lot) => (
              <li key={lot.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{lot.title}</p>
                  {lot.winnerName ? <p className="text-xs text-muted-foreground">Won by {lot.winnerName}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span data-numeric className="font-semibold text-foreground">
                    {lot.status === "won" ? formatMoney(lot.currentBidCents) : "—"}
                  </span>
                  <Pill tone={lot.status === "won" ? "success" : "neutral"}>{lot.status}</Pill>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Panel>
        <form
          className="flex flex-wrap items-center gap-2 p-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const title = newTitle.trim();
            if (!title) return;
            const nextLot = (allLots ?? []).reduce((max, lot) => Math.max(max, lot.lotNumber ?? 0), 0) + 1;
            add.mutate(
              {
                eventId: event.id,
                draft: {
                  title,
                  auctionType: "live",
                  startingBidCents: centsFromInput(newOpening),
                  lotNumber: nextLot,
                },
              },
              {
                onSuccess: () => {
                  setNewTitle("");
                  setNewOpening("");
                },
                onError: (mutationError) =>
                  toast({ title: "Couldn't add lot", description: mutationError.message }),
              },
            );
          }}
        >
          <Input
            value={newTitle}
            onChange={(inputEvent) => setNewTitle(inputEvent.target.value)}
            placeholder="Lot title…"
            aria-label="Lot title"
            className="min-w-[10rem] flex-1"
          />
          <Input
            value={newOpening}
            onChange={(inputEvent) => setNewOpening(inputEvent.target.value)}
            placeholder="Opening bid"
            inputMode="decimal"
            aria-label="Opening bid"
            className="w-32 text-right"
          />
          <Button type="submit" size="sm" disabled={!newTitle.trim() || add.isPending}>
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Add Lot
          </Button>
        </form>
      </Panel>

      <Dialog open={sold !== null} onOpenChange={(next) => (next ? undefined : setSold(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as sold — {sold?.item.title}</DialogTitle>
            <DialogDescription>Record who won it and for how much.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="sold-winner">Winner name</Label>
              <Input
                id="sold-winner"
                value={sold?.winner ?? ""}
                onChange={(inputEvent) =>
                  setSold((current) => (current ? { ...current, winner: inputEvent.target.value } : current))
                }
                placeholder="Priya Raghunathan"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sold-amount">Winning bid</Label>
              <Input
                id="sold-amount"
                value={sold?.amount ?? ""}
                onChange={(inputEvent) =>
                  setSold((current) => (current ? { ...current, amount: inputEvent.target.value } : current))
                }
                inputMode="decimal"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSold(null)}>
              Cancel
            </Button>
            <Button
              disabled={!sold?.winner.trim() || centsFromInput(sold?.amount ?? "") == null}
              onClick={() => {
                if (!sold) return;
                settle(sold.item, "won", {
                  winnerName: sold.winner.trim(),
                  currentBidCents: centsFromInput(sold.amount),
                });
                setSold(null);
              }}
            >
              <Trophy className="mr-1.5 size-4" aria-hidden="true" />
              Mark sold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
