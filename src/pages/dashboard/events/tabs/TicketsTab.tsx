import { useState } from "react";
import {
  useListTicketTypes,
  useCreateTicketType,
  useUpdateTicketType,
  useDeleteTicketType,
  getListTicketTypesQueryKey,
  useGetEvent,
  useShareEvent,
  getGetEventQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Ticket, TrendingUp, Link2, Copy, Check, ExternalLink } from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

type TicketForm = {
  name: string;
  description: string;
  price: string;
  quantityTotal: string;
  quantitySold: string;
  isActive: boolean;
};

const EMPTY_FORM: TicketForm = {
  name: "",
  description: "",
  price: "",
  quantityTotal: "",
  quantitySold: "0",
  isActive: true,
};

function fmt(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function TicketsTab({ eventId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<TicketForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: event } = useGetEvent(eventId, { query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) } });
  const shareEvent = useShareEvent();

  const { data: tickets, isLoading, isError, error } = useListTicketTypes(eventId, {
    query: { enabled: !!eventId, queryKey: getListTicketTypesQueryKey(eventId) },
  });

  const shareToken = (event as { shareToken?: string | null } | undefined)?.shareToken;
  const buyUrl = shareToken
    ? `${window.location.origin}${import.meta.env.BASE_URL}buy/${shareToken}`.replace(/([^:])\/\//g, "$1/")
    : null;

  function handleGenerateLink() {
    shareEvent.mutate({ id: eventId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        toast({ title: "Ticket link created" });
      },
      onError: () => toast({ title: "Failed to generate link", variant: "destructive" }),
    });
  }

  function handleCopy() {
    if (!buyUrl) return;
    navigator.clipboard.writeText(buyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const createTicket = useCreateTicketType();
  const updateTicket = useUpdateTicketType();
  const deleteTicket = useDeleteTicketType();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTicketTypesQueryKey(eventId) });

  function openAdd() { setForm(EMPTY_FORM); setDialog({ open: true }); }
  function openEdit(t: NonNullable<typeof tickets>[number]) {
    setForm({
      name: t.name,
      description: t.description ?? "",
      price: t.price ?? "",
      quantityTotal: String(t.quantityTotal),
      quantitySold: String(t.quantitySold),
      isActive: t.isActive,
    });
    setDialog({ open: true, editId: t.id });
  }

  function handleSave() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: form.price || "0",
      quantityTotal: parseInt(form.quantityTotal || "0", 10),
      quantitySold: parseInt(form.quantitySold || "0", 10),
      isActive: form.isActive,
    };
    if (dialog.editId) {
      updateTicket.mutate({ id: eventId, typeId: dialog.editId, data: payload }, {
        onSuccess: () => { toast({ title: "Ticket type updated" }); setDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      });
    } else {
      createTicket.mutate({ id: eventId, data: payload }, {
        onSuccess: () => { toast({ title: "Ticket type added" }); setDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed to add", variant: "destructive" }),
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTicket.mutate({ id: eventId, typeId: deleteTarget.id }, {
      onSuccess: () => { toast({ title: "Ticket type removed" }); setDeleteTarget(null); invalidate(); },
      onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
    });
  }

  const totalRevenue = (tickets ?? []).reduce((s, t) => s + parseFloat(t.price) * t.quantitySold, 0);
  const totalSold = (tickets ?? []).reduce((s, t) => s + t.quantitySold, 0);
  const totalAvailable = (tickets ?? []).reduce((s, t) => s + t.quantityTotal, 0);
  const isPending = createTicket.isPending || updateTicket.isPending;

  return (
    <div className="space-y-6">
      {/* Ticket link section */}
      <div className="bg-muted/30 border rounded-xl px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Guest Ticket Link</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this link with your guests so they can browse tickets and register for this event.
        </p>
        {buyUrl ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-background border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground truncate">
              {buyUrl}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" asChild>
              <a href={buyUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Preview
              </a>
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleGenerateLink} disabled={shareEvent.isPending}>
            <Link2 className="w-3.5 h-3.5" />
            {shareEvent.isPending ? "Generating..." : "Generate Ticket Link"}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Ticket className="w-4 h-4 text-primary" /> Ticket Types
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Set up pricing tiers for this event.</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Ticket Type
        </Button>
      </div>

      {(tickets ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-4 text-center space-y-1">
            <div className="text-2xl font-bold text-emerald-600">{fmt(totalRevenue)}</div>
            <div className="text-xs text-muted-foreground">Revenue collected</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center space-y-1">
            <div className="text-2xl font-bold">{totalSold}</div>
            <div className="text-xs text-muted-foreground">Tickets sold</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center space-y-1">
            <div className="text-2xl font-bold">{totalAvailable > 0 ? `${Math.round((totalSold / totalAvailable) * 100)}%` : "—"}</div>
            <div className="text-xs text-muted-foreground">Capacity filled</div>
          </div>
        </div>
      )}

      {isError ? (
        <QueryError error={error} label="Failed to load ticket types." />
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : (tickets ?? []).length === 0 ? (
        <div className="text-center py-16 bg-muted/20 border border-dashed rounded-xl space-y-3">
          <Ticket className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm font-medium text-muted-foreground">No ticket types yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add first ticket type
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(tickets ?? []).map(t => {
            const sold = t.quantitySold;
            const total = t.quantityTotal;
            const fillPct = total > 0 ? Math.min(Math.round((sold / total) * 100), 100) : 0;
            const revenue = parseFloat(t.price) * sold;
            return (
              <div key={t.id} className={`bg-card border rounded-xl p-4 space-y-3 ${!t.isActive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{t.name}</span>
                      {!t.isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactive</span>
                      )}
                      <span className="text-sm font-bold text-primary ml-auto">{fmt(parseFloat(t.price))}</span>
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: t.id, name: t.name })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> {sold} sold of {total} available
                    </span>
                    <span className="font-semibold text-foreground">{fmt(revenue)} revenue</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${fillPct}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground text-right">{fillPct}% sold</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialog.open} onOpenChange={open => setDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.editId ? "Edit Ticket Type" : "Add Ticket Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input placeholder="e.g. General Admission" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea placeholder="What's included with this ticket..." value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Price ($)</label>
                <Input placeholder="0.00" type="number" min="0" step="0.01" value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity available</label>
                <Input placeholder="e.g. 500" type="number" min="0" value={form.quantityTotal}
                  onChange={e => setForm(f => ({ ...f, quantityTotal: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tickets sold</label>
              <Input placeholder="0" type="number" min="0" value={form.quantitySold}
                onChange={e => setForm(f => ({ ...f, quantitySold: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">Visible and available for sale</div>
              </div>
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : dialog.editId ? "Save Changes" : "Add Ticket Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove ticket type?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.name}</span>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteTicket.isPending}>
              {deleteTicket.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
