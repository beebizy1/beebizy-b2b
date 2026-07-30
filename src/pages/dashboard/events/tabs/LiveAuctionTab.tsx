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
import { Plus, Pencil, Trash2, Gavel, Trophy, ChevronUp, ChevronDown, Play, CheckCircle2, SkipForward } from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "0" || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US")}`;
}

type AuctionItem = {
  id: string; eventId: string; title: string; description: string | null;
  imageUrl: string | null; startingBid: string | null; currentBid: string | null;
  winnerName: string | null; donorName: string | null; status: string;
  auctionType: string; lotNumber: number | null; createdAt: string;
};

type ItemForm = { title: string; description: string; donorName: string; startingBid: string; lotNumber: string };
type SoldForm = { winnerName: string; finalBid: string };
const BLANK: ItemForm = { title: "", description: "", donorName: "", startingBid: "", lotNumber: "" };

const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  won: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
  passed: "bg-red-100 text-red-700",
};

export function LiveAuctionTab({ eventId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [itemDialog, setItemDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<ItemForm>(BLANK);
  const [soldDialog, setSoldDialog] = useState<{ open: boolean; item?: AuctionItem }>({ open: false });
  const [soldForm, setSoldForm] = useState<SoldForm>({ winnerName: "", finalBid: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [liveCurrentBid, setLiveCurrentBid] = useState<Record<string, string>>({});

  const { data: all = [], isLoading, isError, error } = useListAuctionItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListAuctionItemsQueryKey(eventId) },
  });

  const items = (all.filter(i => i.auctionType === "live") as unknown as AuctionItem[])
    .sort((a, b) => (a.lotNumber ?? 999) - (b.lotNumber ?? 999) || a.id.localeCompare(b.id));

  const activeItem = items.find(i => i.status === "active");
  const pending = items.filter(i => i.status === "open");
  const done = items.filter(i => i.status === "won" || i.status === "passed" || i.status === "closed");

  const create = useCreateAuctionItem();
  const update = useUpdateAuctionItem();
  const del = useDeleteAuctionItem();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(eventId) });

  function openAdd() { setForm(BLANK); setItemDialog({ open: true }); }
  function openEdit(it: AuctionItem) {
    setForm({ title: it.title, description: it.description ?? "", donorName: it.donorName ?? "", startingBid: it.startingBid ?? "", lotNumber: it.lotNumber != null ? String(it.lotNumber) : "" });
    setItemDialog({ open: true, editId: it.id });
  }

  function handleSave() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { title: form.title.trim(), description: form.description || undefined, donorName: form.donorName || undefined, startingBid: form.startingBid || undefined, lotNumber: form.lotNumber ? parseInt(form.lotNumber) : undefined, auctionType: "live" as const };
    if (itemDialog.editId) {
      update.mutate({ id: eventId, itemId: itemDialog.editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    } else {
      create.mutate({ id: eventId, data: { ...payload, status: "open" as const } }, {
        onSuccess: () => { toast({ title: "Lot added" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    }
  }

  function goLive(it: AuctionItem) {
    if (activeItem && activeItem.id !== it.id) {
      toast({ title: "Close or sell the active item first", variant: "destructive" }); return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update.mutate({ id: eventId, itemId: it.id, data: { status: "active" as any, currentBid: it.startingBid ?? undefined } }, {
      onSuccess: () => { invalidate(); setLiveCurrentBid(p => ({ ...p, [it.id]: it.startingBid ?? "" })); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  function updateBid(itemId: string, amount: string) {
    update.mutate({ id: eventId, itemId, data: { currentBid: amount } }, {
      onSuccess: () => invalidate(),
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  function openSold(it: AuctionItem) {
    setSoldForm({ winnerName: "", finalBid: it.currentBid ?? it.startingBid ?? "" });
    setSoldDialog({ open: true, item: it });
  }

  function handleSold() {
    if (!soldDialog.item) return;
    update.mutate({ id: eventId, itemId: soldDialog.item.id, data: { status: "won", winnerName: soldForm.winnerName || undefined, currentBid: soldForm.finalBid || undefined } }, {
      onSuccess: () => { toast({ title: "Item sold!" }); setSoldDialog({ open: false }); invalidate(); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  function handlePass(it: AuctionItem) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update.mutate({ id: eventId, itemId: it.id, data: { status: "passed" as any } }, {
      onSuccess: () => { toast({ title: "Item passed" }); invalidate(); },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    });
  }

  const totalRaised = items.filter(i => i.status === "won").reduce((s, i) => s + (parseFloat(i.currentBid ?? "0") || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Gavel className="w-4 h-4 text-primary" /> Live Auction
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Run lots sequentially — open a lot, call bids, mark sold.</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Lot
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">${totalRaised.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Total raised</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{items.length - done.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Lots remaining</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{done.filter(i => i.status === "won").length}</div>
            <div className="text-xs text-muted-foreground mt-1">Sold</div>
          </div>
        </div>
      )}

      {isError ? (
        <QueryError error={error} label="Failed to load live auction." />
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-muted/20 space-y-3">
          <Gavel className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm text-muted-foreground font-medium">No lots added yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add first lot
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active lot — hero card */}
          {activeItem && (() => {
            const liveBid = liveCurrentBid[activeItem.id] ?? activeItem.currentBid ?? activeItem.startingBid ?? "";
            const bidNum = parseFloat(liveBid) || 0;
            const step = bidNum >= 10000 ? 500 : bidNum >= 1000 ? 100 : bidNum >= 100 ? 25 : 10;
            return (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Active Lot</span>
                    {activeItem.lotNumber != null && (
                      <span className="text-xs text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">Lot #{activeItem.lotNumber}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="w-7 h-7 p-0" onClick={() => openEdit(activeItem)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xl font-bold">{activeItem.title}</h4>
                  {activeItem.description && <p className="text-sm text-muted-foreground mt-0.5">{activeItem.description}</p>}
                  {activeItem.donorName && <p className="text-xs text-muted-foreground mt-1">Donated by {activeItem.donorName}</p>}
                </div>

                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Bid</div>
                    <div className="text-5xl font-black text-emerald-700">{liveBid ? `$${parseFloat(liveBid).toLocaleString()}` : "—"}</div>
                    {activeItem.startingBid && (
                      <div className="text-xs text-muted-foreground mt-1">Starting: {fmt(activeItem.startingBid)}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 justify-center">
                    <Button size="sm" variant="outline" className="w-10 h-10 rounded-full p-0 text-lg"
                      onClick={() => {
                        const next = String(Math.max(0, bidNum - step));
                        setLiveCurrentBid(p => ({ ...p, [activeItem.id]: next }));
                      }}>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      value={liveBid}
                      className="w-36 text-center text-lg font-bold"
                      onChange={e => setLiveCurrentBid(p => ({ ...p, [activeItem.id]: e.target.value }))}
                      onBlur={() => { if (liveBid) updateBid(activeItem.id, liveBid); }}
                    />
                    <Button size="sm" variant="outline" className="w-10 h-10 rounded-full p-0"
                      onClick={() => {
                        const next = String(bidNum + step);
                        setLiveCurrentBid(p => ({ ...p, [activeItem.id]: next }));
                      }}>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-center text-muted-foreground">Increment: ${step.toLocaleString()} · Tab out or blur to save</div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white gap-2 text-base py-5" onClick={() => openSold(activeItem)}>
                    <CheckCircle2 className="w-5 h-5" /> Sold!
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => handlePass(activeItem)}>
                    <SkipForward className="w-4 h-4" /> Pass
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Pending lots */}
          {pending.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Up Next</div>
              <div className="space-y-2">
                {pending.map(it => (
                  <div key={it.id} className="bg-card border rounded-xl px-4 py-3 flex items-center gap-4">
                    {it.lotNumber != null && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {it.lotNumber}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{it.title}</div>
                      {it.startingBid && <div className="text-xs text-muted-foreground">Start: {fmt(it.startingBid)}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="w-7 h-7 p-0" onClick={() => openEdit(it)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="w-7 h-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: it.id, title: it.title })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" className="gap-1.5 ml-2" onClick={() => goLive(it)}>
                        <Play className="w-3.5 h-3.5" /> Go Live
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed lots */}
          {done.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Completed</div>
              <div className="space-y-2">
                {done.map(it => (
                  <div key={it.id} className="bg-card border rounded-xl px-4 py-3 flex items-center gap-4 opacity-70">
                    {it.lotNumber != null && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {it.lotNumber}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{it.title}</span>
                        <Badge className={`${STATUS_COLOR[it.status] ?? ""} capitalize text-xs`}>
                          {it.status === "won" ? "Sold" : it.status}
                        </Badge>
                      </div>
                      {it.status === "won" && (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <Trophy className="w-3 h-3 text-amber-500" />
                          {it.winnerName || "Anonymous"} · {fmt(it.currentBid)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{itemDialog.editId ? "Edit Lot" : "Add Live Auction Lot"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-1"><label className="text-sm font-medium">Lot #</label>
                <Input type="number" min="1" placeholder="1" value={form.lotNumber}
                  onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))} /></div>
              <div className="space-y-1 col-span-2"><label className="text-sm font-medium">Item name *</label>
                <Input placeholder="e.g. Vineyard Tour" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">Description</label>
              <Textarea placeholder="What's included?" value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-sm font-medium">Donor</label>
                <Input placeholder="Donor name" value={form.donorName} onChange={e => setForm(f => ({ ...f, donorName: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Opening bid ($)</label>
                <Input type="number" min="0" placeholder="0" value={form.startingBid}
                  onChange={e => setForm(f => ({ ...f, startingBid: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Saving..." : itemDialog.editId ? "Save" : "Add Lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sold dialog */}
      <Dialog open={soldDialog.open} onOpenChange={open => setSoldDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark as Sold — {soldDialog.item?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1"><label className="text-sm font-medium">Final bid ($)</label>
              <Input type="number" min="0" value={soldForm.finalBid}
                onChange={e => setSoldForm(f => ({ ...f, finalBid: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Winner name</label>
              <Input placeholder="Jane Smith" value={soldForm.winnerName}
                onChange={e => setSoldForm(f => ({ ...f, winnerName: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoldDialog({ open: false })}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSold} disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Confirm Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove lot?</DialogTitle></DialogHeader>
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
