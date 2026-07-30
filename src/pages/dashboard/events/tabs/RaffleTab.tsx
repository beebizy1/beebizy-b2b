import { useState } from "react";
import {
  useListRaffleItems,
  useCreateRaffleItem,
  useUpdateRaffleItem,
  useDeleteRaffleItem,
  useListRaffleTickets,
  useCreateRaffleTicket,
  useDrawRaffleWinner,
  getListRaffleItemsQueryKey,
  getListRaffleTicketsQueryKey,
  type RaffleItem,
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
import {
  Plus, Pencil, Trash2, Ticket, Trophy, ChevronDown, ChevronUp, Sparkles, Users,
} from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

function fmt(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

type ItemForm = { name: string; description: string; ticketPrice: string; totalTickets: string };
const BLANK: ItemForm = { name: "", description: "", ticketPrice: "5", totalTickets: "" };

function TicketPanel({ eventId, item }: { eventId: string; item: RaffleItem }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [form, setForm] = useState({ buyerName: "", buyerEmail: "", quantity: "1" });
  const { data: tickets = [], isLoading } = useListRaffleTickets(eventId, item.id, {
    query: { enabled: open, queryKey: getListRaffleTicketsQueryKey(eventId, item.id) },
  });
  const create = useCreateRaffleTicket();
  const drawWinner = useDrawRaffleWinner();

  function handleSell() {
    if (!form.buyerName.trim() || !form.buyerEmail.trim()) return;
    create.mutate({ id: eventId, itemId: item.id, data: { buyerName: form.buyerName, buyerEmail: form.buyerEmail, quantity: parseInt(form.quantity) || 1 } }, {
      onSuccess: () => {
        toast({ title: "Tickets sold" });
        setSellOpen(false);
        setForm({ buyerName: "", buyerEmail: "", quantity: "1" });
        queryClient.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListRaffleTicketsQueryKey(eventId, item.id) });
      },
      onError: (e: Error) => toast({ title: e.message || "Failed", variant: "destructive" }),
    });
  }

  function handleDraw() {
    drawWinner.mutate({ id: eventId, itemId: item.id }, {
      onSuccess: () => {
        toast({ title: "Winner drawn!" });
        queryClient.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(eventId) });
      },
      onError: (e: Error) => toast({ title: e.message || "No tickets sold yet", variant: "destructive" }),
    });
  }

  return (
    <>
      <div className="flex gap-2 mt-3 flex-wrap">
        {item.status === "open" && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSellOpen(true)}>
            <Ticket className="w-3.5 h-3.5" /> Sell Tickets
          </Button>
        )}
        {item.status === "open" && item.soldTickets > 0 && (
          <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleDraw} disabled={drawWinner.isPending}>
            <Sparkles className="w-3.5 h-3.5" /> {drawWinner.isPending ? "Drawing..." : "Draw Winner"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setOpen(!open)}>
          <Users className="w-3.5 h-3.5" /> {item.soldTickets} tickets
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {open && (
        <div className="mt-3 border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-3"><Skeleton className="h-8 w-full" /></div>
          ) : tickets.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No tickets sold yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Buyer</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-2">{t.buyerName}</td>
                    <td className="p-2 text-muted-foreground">{t.buyerEmail}</td>
                    <td className="p-2 text-right font-medium">{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sell Raffle Tickets — {item.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-sm font-medium">Buyer name *</label>
              <Input placeholder="Jane Smith" value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Buyer email *</label>
              <Input type="email" placeholder="jane@example.com" value={form.buyerEmail} onChange={e => setForm(f => ({ ...f, buyerEmail: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Quantity</label>
              <Input type="number" min="1" placeholder="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-foreground">{fmt(parseFloat(item.ticketPrice) * (parseInt(form.quantity) || 1))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellOpen(false)}>Cancel</Button>
            <Button onClick={handleSell} disabled={create.isPending || !form.buyerName.trim() || !form.buyerEmail.trim()}>
              {create.isPending ? "Saving..." : "Sell Tickets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RaffleTab({ eventId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [itemDialog, setItemDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<ItemForm>(BLANK);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: items = [], isLoading, isError, error } = useListRaffleItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListRaffleItemsQueryKey(eventId) },
  });

  const createItem = useCreateRaffleItem();
  const updateItem = useUpdateRaffleItem();
  const deleteItem = useDeleteRaffleItem();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(eventId) });

  function openAdd() { setForm(BLANK); setItemDialog({ open: true }); }
  function openEdit(it: RaffleItem) {
    setForm({ name: it.name, description: it.description ?? "", ticketPrice: it.ticketPrice, totalTickets: String(it.totalTickets) });
    setItemDialog({ open: true, editId: it.id });
  }

  function handleSave() {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = { name: form.name.trim(), description: form.description.trim() || undefined, ticketPrice: form.ticketPrice || "5", totalTickets: parseInt(form.totalTickets || "0") };
    if (itemDialog.editId) {
      updateItem.mutate({ id: eventId, itemId: itemDialog.editId, data: payload }, {
        onSuccess: () => { toast({ title: "Updated" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    } else {
      createItem.mutate({ id: eventId, data: payload }, {
        onSuccess: () => { toast({ title: "Raffle item added" }); setItemDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      });
    }
  }

  const totalRevenue = items.reduce((s, i) => s + parseFloat(i.ticketPrice) * i.soldTickets, 0);
  const totalSold = items.reduce((s, i) => s + i.soldTickets, 0);
  const drawn = items.filter(i => i.status === "drawn").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Raffle
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Manage prizes and raffle ticket sales.</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Prize
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{fmt(totalRevenue)}</div>
            <div className="text-xs text-muted-foreground mt-1">Ticket revenue</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{totalSold}</div>
            <div className="text-xs text-muted-foreground mt-1">Tickets sold</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-500">{drawn}</div>
            <div className="text-xs text-muted-foreground mt-1">Winners drawn</div>
          </div>
        </div>
      )}

      {isError ? (
        <QueryError error={error} label="Failed to load raffle." />
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-muted/20 space-y-3">
          <Trophy className="w-8 h-8 mx-auto opacity-30 text-amber-500" />
          <p className="text-sm text-muted-foreground font-medium">No raffle prizes yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add first prize
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(it => (
            <div key={it.id} className="bg-card border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{it.name}</span>
                    {it.status === "drawn" ? (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Winner drawn</Badge>
                    ) : it.status === "closed" ? (
                      <Badge variant="secondary">Closed</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Open</Badge>
                    )}
                    <span className="text-sm font-bold text-primary ml-auto">{fmt(it.ticketPrice)} / ticket</span>
                  </div>
                  {it.description && <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>}
                  {it.totalTickets > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {it.soldTickets} of {it.totalTickets} tickets sold
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(it)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: it.id, name: it.name })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {it.status === "drawn" && it.winnerName && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-amber-900">Winner: {it.winnerName}</div>
                    {it.winnerEmail && <div className="text-xs text-amber-700">{it.winnerEmail}</div>}
                  </div>
                </div>
              )}

              <TicketPanel eventId={eventId} item={it} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{itemDialog.editId ? "Edit Prize" : "Add Raffle Prize"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1"><label className="text-sm font-medium">Prize name *</label>
              <Input placeholder="e.g. Weekend Getaway" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Description</label>
              <Textarea placeholder="What's included..." value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-sm font-medium">Ticket price ($)</label>
                <Input type="number" min="0" step="0.01" placeholder="5" value={form.ticketPrice}
                  onChange={e => setForm(f => ({ ...f, ticketPrice: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Total tickets available</label>
                <Input type="number" min="0" placeholder="Unlimited" value={form.totalTickets}
                  onChange={e => setForm(f => ({ ...f, totalTickets: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {createItem.isPending || updateItem.isPending ? "Saving..." : itemDialog.editId ? "Save Changes" : "Add Prize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove raffle prize?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.name}</span> and all its ticket records.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteItem.isPending}
              onClick={() => deleteItem.mutate({ id: eventId, itemId: deleteTarget!.id }, {
                onSuccess: () => { toast({ title: "Removed" }); setDeleteTarget(null); invalidate(); },
              })}>
              {deleteItem.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
