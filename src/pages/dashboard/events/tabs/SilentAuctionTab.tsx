import { useState } from "react";
import {
  useListAuctionItems,
  useCreateAuctionItem,
  useUpdateAuctionItem,
  useDeleteAuctionItem,
  getListAuctionItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Gavel, DollarSign, Trophy, Lock } from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

function fmt(v: string | null | undefined) {
  if (!v || v === "0") return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

type AuctionItem = {
  id: string; eventId: string; title: string; description: string | null;
  imageUrl: string | null; startingBid: string | null; currentBid: string | null;
  winnerName: string | null; donorName: string | null; fairMarketValue: string | null;
  status: string; auctionType: string; lotNumber: number | null; createdAt: string;
};

type ItemForm = { title: string; description: string; donorName: string; startingBid: string; fairMarketValue: string };
type BidForm = { amount: string; bidderName: string };
const BLANK_ITEM: ItemForm = { title: "", description: "", donorName: "", startingBid: "", fairMarketValue: "" };
const BLANK_BID: BidForm = { amount: "", bidderName: "" };

const STATUS: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  won: "bg-amber-100 text-amber-700",
};

export function SilentAuctionTab({ eventId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [itemDialog, setItemDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<ItemForm>(BLANK_ITEM);
  const [bidDialog, setBidDialog] = useState<{ open: boolean; item?: AuctionItem }>({ open: false });
  const [bidForm, setBidForm] = useState<BidForm>(BLANK_BID);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const { data: all = [], isLoading, isError, error } = useListAuctionItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListAuctionItemsQueryKey(eventId) },
  });
  const items = all.filter(i => i.auctionType === "silent") as AuctionItem[];

  const create = useCreateAuctionItem();
  const update = useUpdateAuctionItem();
  const del = useDeleteAuctionItem();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(eventId) });

  function openAdd() { setForm(BLANK_ITEM); setItemDialog({ open: true }); }
  function openEdit(it: AuctionItem) {
    setForm({ title: it.title, description: it.description ?? "", donorName: it.donorName ?? "", startingBid: it.startingBid ?? "", fairMarketValue: it.fairMarketValue ?? "" });
    setItemDialog({ open: true, editId: it.id });
  }

  function handleSave() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { title: form.title.trim(), description: form.description || undefined, donorName: form.donorName || undefined, startingBid: form.startingBid || undefined, fairMarketValue: form.fairMarketValue || undefined, auctionType: "silent" as const };
    if (itemDialog.editId) {
      update.mutate({ id: eventId, itemId: itemDialog.editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    } else {
      create.mutate({ id: eventId, data: { ...payload } }, {
        onSuccess: () => { toast({ title: "Item added" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    }
  }

  function openBid(it: AuctionItem) {
    setBidForm({ amount: it.currentBid ?? it.startingBid ?? "", bidderName: it.winnerName ?? "" });
    setBidDialog({ open: true, item: it });
  }

  function handleRecordBid() {
    if (!bidDialog.item) return;
    update.mutate({ id: eventId, itemId: bidDialog.item.id, data: { currentBid: bidForm.amount, winnerName: bidForm.bidderName || undefined } }, {
      onSuccess: () => { toast({ title: "Bid recorded" }); setBidDialog({ open: false }); invalidate(); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  function handleCloseBidding(it: AuctionItem) {
    const newStatus = it.currentBid ? "won" : "closed";
    update.mutate({ id: eventId, itemId: it.id, data: { status: newStatus } }, {
      onSuccess: () => { toast({ title: newStatus === "won" ? "Bidding closed — winner recorded" : "Bidding closed" }); invalidate(); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  function handleReopen(it: AuctionItem) {
    update.mutate({ id: eventId, itemId: it.id, data: { status: "open" } }, {
      onSuccess: () => { toast({ title: "Reopened" }); invalidate(); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  const totalRaised = items.filter(i => i.status === "won").reduce((s, i) => s + (parseFloat(i.currentBid ?? "0") || 0), 0);
  const openCount = items.filter(i => i.status === "open").length;
  const wonCount = items.filter(i => i.status === "won").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Gavel className="w-4 h-4 text-primary" /> Silent Auction
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Manage items and record bids during the event.</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">${totalRaised.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Total raised</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{openCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Open for bids</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{wonCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Sold</div>
          </div>
        </div>
      )}

      {isError ? (
        <QueryError error={error} label="Failed to load silent auction." />
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-muted/20 space-y-3">
          <Gavel className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground font-medium">No silent auction items yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add first item
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.id} className={`bg-card border rounded-xl p-4 ${it.status !== "open" ? "opacity-75" : ""}`}>
              <div className="flex items-start gap-4">
                {it.imageUrl && (
                  <img src={it.imageUrl} alt={it.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{it.title}</span>
                    <Badge className={`${STATUS[it.status] ?? "bg-muted text-muted-foreground"} capitalize text-xs`}>
                      {it.status === "won" ? "Sold" : it.status}
                    </Badge>
                    {it.donorName && <span className="text-xs text-muted-foreground">Donor: {it.donorName}</span>}
                  </div>
                  {it.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{it.description}</p>}
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <div className="text-xs text-muted-foreground">
                      Start: <span className="font-medium text-foreground">{fmt(it.startingBid)}</span>
                    </div>
                    <div className="text-sm font-bold text-primary flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />
                      Current bid: {it.currentBid ? `$${parseFloat(it.currentBid).toLocaleString()}` : "—"}
                    </div>
                    {it.winnerName && (
                      <div className="text-xs flex items-center gap-1 text-amber-700">
                        <Trophy className="w-3 h-3" /> {it.winnerName}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(it)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: it.id, title: it.title })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {it.status === "open" && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openBid(it)}>
                    <Gavel className="w-3.5 h-3.5" /> Record Bid
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground" onClick={() => handleCloseBidding(it)}>
                    <Lock className="w-3.5 h-3.5" /> Close Bidding
                  </Button>
                </div>
              )}
              {(it.status === "won" || it.status === "closed") && (
                <Button size="sm" variant="ghost" className="mt-2 text-xs text-muted-foreground" onClick={() => handleReopen(it)}>
                  Reopen bidding
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{itemDialog.editId ? "Edit Item" : "Add Silent Auction Item"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1"><label className="text-sm font-medium">Item name *</label>
              <Input placeholder="e.g. Signed Jersey" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Description</label>
              <Textarea placeholder="What is this item?" value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-sm font-medium">Donor / Provided by</label>
                <Input placeholder="Company name" value={form.donorName} onChange={e => setForm(f => ({ ...f, donorName: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Fair market value ($)</label>
                <Input type="number" min="0" placeholder="0" value={form.fairMarketValue}
                  onChange={e => setForm(f => ({ ...f, fairMarketValue: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">Starting bid ($)</label>
              <Input type="number" min="0" placeholder="0" value={form.startingBid}
                onChange={e => setForm(f => ({ ...f, startingBid: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Saving..." : itemDialog.editId ? "Save" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record bid dialog */}
      <Dialog open={bidDialog.open} onOpenChange={open => setBidDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Bid — {bidDialog.item?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1"><label className="text-sm font-medium">Bid amount ($) *</label>
              <Input type="number" min="0" placeholder="0" value={bidForm.amount}
                onChange={e => setBidForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Bidder name</label>
              <Input placeholder="Jane Smith" value={bidForm.bidderName}
                onChange={e => setBidForm(f => ({ ...f, bidderName: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleRecordBid} disabled={update.isPending || !bidForm.amount}>
              {update.isPending ? "Saving..." : "Record Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove item?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.title}</span>.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={del.isPending}
              onClick={() => del.mutate({ id: eventId, itemId: deleteTarget!.id }, {
                onSuccess: () => { toast({ title: "Removed" }); setDeleteTarget(null); invalidate(); },
              })}>
              {del.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
