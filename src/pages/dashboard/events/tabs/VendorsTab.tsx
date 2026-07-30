import { useState } from "react";
import {
  useListEventVendors,
  useListVendors,
  useAddEventVendor,
  useUpdateEventVendor,
  useRemoveEventVendor,
  getListEventVendorsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, Phone, Mail, Store } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  pending: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  cancelled: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
};

function AddVendorPanel({ eventId, attached }: { eventId: string; attached: string[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const { data: allVendors = [] } = useListVendors();
  const addVendor = useAddEventVendor();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const available = allVendors.filter((v) => !attached.includes(v.id));

  const save = () => {
    if (!selectedId) return;
    addVendor.mutate(
      { id: eventId, data: { vendorId: selectedId, fee: fee || undefined, notes: notes || undefined, status: "pending" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEventVendorsQueryKey(eventId) });
          setOpen(false); setSelectedId(null); setFee(""); setNotes("");
        },
        onError: () => toast({ title: "Failed to add vendor", variant: "destructive" }),
      }
    );
  };

  if (!open) return (
    <Button variant="outline" size="sm" className="gap-1.5 w-full mt-2" onClick={() => setOpen(true)}>
      <Plus className="w-3.5 h-3.5" /> Add vendor to event
    </Button>
  );

  return (
    <div className="bg-muted/30 border border-dashed border-border rounded-xl p-4 space-y-3 mt-2">
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Select vendor *</label>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">All marketplace vendors are already attached to this event.</p>
        ) : (
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Choose a vendor...</option>
            {available.map((v) => (
              <option key={v.id} value={v.id}>{v.category} — {v.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Agreed Fee</label>
          <input
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="e.g. $2,500"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <input
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes..."
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!selectedId || addVendor.isPending} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Attach
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function VendorsTab({ eventId }: Props) {
  const { data: eventVendors = [], isLoading, isError, error } = useListEventVendors(eventId);
  const updateVendor = useUpdateEventVendor();
  const removeVendor = useRemoveEventVendor();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleStatusChange = (vendorId: string, status: string) => {
    updateVendor.mutate(
      { id: eventId, vendorId, data: { status: status as "pending" | "confirmed" | "cancelled" } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEventVendorsQueryKey(eventId) }),
        onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
      }
    );
  };

  const handleRemove = (vendorId: string) => {
    removeVendor.mutate(
      { id: eventId, vendorId },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEventVendorsQueryKey(eventId) }),
        onError: () => toast({ title: "Failed to remove vendor", variant: "destructive" }),
      }
    );
  };

  if (isError) return <QueryError error={error} label="Failed to load vendors." />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const attachedIds = eventVendors.map((ev) => ev.vendorId);

  const grouped = eventVendors.reduce<Record<string, typeof eventVendors>>((acc, ev) => {
    const cat = ev.vendor?.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-base">Vendors</h3>
        <span className="text-xs text-muted-foreground">{eventVendors.length} attached</span>
      </div>

      {eventVendors.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
          <Store className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No vendors attached yet.</p>
          <p className="text-xs mt-1">Attach vendors from the marketplace to this event.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, evs]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</p>
              <div className="space-y-2">
                {evs.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{ev.vendor?.name}</span>
                        {ev.vendor?.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {ev.vendor.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {ev.vendor?.contactEmail && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" /> {ev.vendor.contactEmail}
                          </span>
                        )}
                        {ev.vendor?.contactPhone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" /> {ev.vendor.contactPhone}
                          </span>
                        )}
                        {ev.fee && (
                          <span className="text-xs font-medium text-foreground">Fee: {ev.fee}</span>
                        )}
                      </div>
                      {ev.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{ev.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={ev.status}
                        onChange={(e) => handleStatusChange(ev.vendorId, e.target.value)}
                        className={`h-7 px-2 rounded-full text-xs font-semibold border focus:outline-none ${STATUS_STYLES[ev.status] ?? ""}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemove(ev.vendorId)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddVendorPanel eventId={eventId} attached={attachedIds} />
    </div>
  );
}
