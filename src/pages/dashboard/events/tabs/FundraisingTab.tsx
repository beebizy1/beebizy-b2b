import { useState } from "react";
import {
  useListAuctionItems, useCreateAuctionItem, useUpdateAuctionItem, useDeleteAuctionItem,
  useListSponsorships, useCreateSponsorship, useUpdateSponsorship, useDeleteSponsorship,
  useListEventRegistrations,
  getListAuctionItemsQueryKey, getListSponsorshipsQueryKey, getListEventRegistrationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { uploadFileToStorage } from "@/lib/storage-upload";
import {
  Plus, Gavel, HandCoins, Trophy, Mail, Pencil, Trash2, TrendingUp, DollarSign,
  Link as LinkIcon, User, CreditCard, MessageSquare, CheckCircle2, Receipt, Phone,
  ImagePlus, X,
} from "lucide-react";
import { QueryError } from "@/components/QueryError";

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIERS = ["gold", "silver", "bronze", "custom"] as const;
type Tier = typeof TIERS[number];

const TIER_STYLES: Record<Tier, string> = {
  gold:   "bg-amber-100 text-amber-800 border-amber-300",
  silver: "bg-slate-100 text-slate-700 border-slate-300",
  bronze: "bg-orange-100 text-orange-800 border-orange-300",
  custom: "bg-purple-100 text-purple-700 border-purple-300",
};

const STATUS_STYLES: Record<string, string> = {
  open:      "bg-emerald-100 text-emerald-700",
  closed:    "bg-slate-100 text-slate-600",
  won:       "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  pending:   "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_METHODS = ["Check", "Credit Card", "Cash", "Venmo", "Zelle", "Wire Transfer", "PayPal", "Other"] as const;

function fmt(val: string | null | undefined) {
  if (!val || val === "0") return "—";
  return `$${parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtNum(val: string | null | undefined) {
  return val ? parseFloat(val) : 0;
}

// ── Auction Item Dialog ─────────────────────────────────────────────────────────

type AuctionFormData = {
  title: string;
  description: string;
  imageUrl: string;
  startingBid: string;
  currentBid: string;
  fairMarketValue: string;
  winnerName: string;
  donorName: string;
  paymentMethod: string;
  paymentLink: string;
  paymentReceived: boolean;
  status: "open" | "closed" | "won";
};

const BLANK_AUCTION: AuctionFormData = {
  title: "", description: "", imageUrl: "", startingBid: "", currentBid: "",
  fairMarketValue: "", winnerName: "", donorName: "",
  paymentMethod: "", paymentLink: "", paymentReceived: false, status: "open",
};

function AuctionItemDialog({
  eventId, item, open, onClose,
}: {
  eventId: string;
  item?: { id: string } & AuctionFormData;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateAuctionItem();
  const update = useUpdateAuctionItem();
  const [form, setForm] = useState<AuctionFormData>(item ?? BLANK_AUCTION);
  const set = (k: keyof AuctionFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setProgress(0);
    try {
      const url = await uploadFileToStorage(["auction-items", eventId], file, { onProgress: setProgress });
      set("imageUrl", url);
      toast({ title: "Photo uploaded" });
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    const payload = {
      title: form.title,
      description: form.description || undefined,
      imageUrl: form.imageUrl || undefined,
      startingBid: form.startingBid || undefined,
      currentBid: form.currentBid || undefined,
      fairMarketValue: form.fairMarketValue || undefined,
      winnerName: form.winnerName || undefined,
      donorName: form.donorName || undefined,
      paymentMethod: form.paymentMethod || undefined,
      paymentLink: form.paymentLink || undefined,
      paymentReceivedAt: form.paymentReceived ? new Date().toISOString() : undefined,
      status: form.status,
    };
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(eventId) });
        toast({ title: item ? "Auction item updated" : "Auction item added" });
        onClose();
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" as const }),
    };
    if (item) update.mutate({ id: eventId, itemId: item.id, data: payload }, opts);
    else create.mutate({ id: eventId, data: payload }, opts);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Auction Item" : "Add Auction Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Photo upload */}
          <div className="space-y-1.5">
            <Label>Item Photo</Label>
            {form.imageUrl ? (
              <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                <img src={form.imageUrl} alt="Auction item" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => set("imageUrl", "")}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center gap-2 w-full h-32 rounded-lg border-2 border-dashed border-border cursor-pointer hover:bg-muted/30 transition-colors ${isUploading ? "opacity-60 pointer-events-none" : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await uploadFile(file);
                    e.target.value = "";
                  }}
                  disabled={isUploading}
                />
                <ImagePlus className="w-6 h-6 text-muted-foreground" />
                {isUploading ? (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
                    <div className="mt-1 w-24 h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Click to upload a photo</p>
                )}
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. VIP Weekend Package" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What's included..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Starting Bid ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.startingBid} onChange={(e) => set("startingBid", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Winning Bid ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.currentBid} onChange={(e) => set("currentBid", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Fair Market Value ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.fairMarketValue} onChange={(e) => set("fairMarketValue", e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Tax preview */}
          {form.currentBid && parseFloat(form.currentBid) > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs">
              <div className="font-semibold text-emerald-800 mb-1">Estimated Tax Deduction</div>
              <div className="text-emerald-700">
                {(() => {
                  const bid = parseFloat(form.currentBid || "0");
                  const fmv = parseFloat(form.fairMarketValue || "0");
                  const deductible = Math.max(0, bid - fmv);
                  return deductible > 0
                    ? `$${deductible.toLocaleString()} deductible (winning bid $${bid.toLocaleString()} − FMV $${fmv.toLocaleString()})`
                    : `No deduction — winning bid does not exceed fair market value`;
                })()}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="won">Won</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Winner Name</Label>
              <Input value={form.winnerName} onChange={(e) => set("winnerName", e.target.value)} placeholder="Leave blank if open" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Donor Name</Label>
            <Input value={form.donorName} onChange={(e) => set("donorName", e.target.value)} placeholder="Who donated this item?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>How Payment Will Be Received</Label>
              <select
                value={form.paymentMethod}
                onChange={(e) => set("paymentMethod", e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select method…</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Link</Label>
              <Input type="url" value={form.paymentLink} onChange={(e) => set("paymentLink", e.target.value)} placeholder="https://pay.example.com/..." />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={form.paymentReceived}
              onChange={(e) => set("paymentReceived", e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <div className="text-sm font-semibold">Mark payment as received</div>
              <div className="text-xs text-muted-foreground">Records today as the payment date</div>
            </div>
            {form.paymentReceived && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.title.trim()}>
            {isPending ? "Saving..." : item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SMS Blast Dialog ────────────────────────────────────────────────────────────

function SmsBlastDialog({
  eventId, item, open, onClose,
}: {
  eventId: string;
  item: { title: string; currentBid?: string | null; paymentLink?: string | null } | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: registrations = [], isLoading } = useListEventRegistrations(eventId, {
    query: { enabled: open, queryKey: getListEventRegistrationsQueryKey(eventId) },
  });

  const withContact = registrations.filter((r) => r.attendee.contact);
  const defaultMsg = item
    ? `Auction Update: "${item.title}" — current bid is ${item.currentBid ? `$${parseFloat(item.currentBid).toLocaleString()}` : "open"}. ${item.paymentLink ? `Pay now: ${item.paymentLink}` : "Place your bid at the event!"} Reply STOP to opt out.`
    : "";
  const [message, setMessage] = useState(defaultMsg);

  const handleSend = () => {
    toast({
      title: `Blast sent to ${withContact.length} attendee${withContact.length !== 1 ? "s" : ""}`,
      description: "Text messages are queued. Connect Twilio to enable live delivery.",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Text Blast to Attendees
          </DialogTitle>
          <DialogDescription>
            Send a text message to all registered attendees who have contact info on file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Type your message..."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length} / 160 chars</p>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 border-b text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>Recipients with contact info</span>
              <Badge variant={withContact.length > 0 ? "default" : "secondary"} className="text-xs">
                {withContact.length} of {registrations.length}
              </Badge>
            </div>
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : withContact.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <Phone className="w-6 h-6 mx-auto mb-1 opacity-30" />
                No attendees have contact info on file yet.
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto divide-y divide-border">
                {withContact.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium">{r.attendee.name}</span>
                    <span className="text-muted-foreground text-xs">{r.attendee.contact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Connect Twilio in your integrations to enable live text delivery. This preview shows how the blast will work.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || withContact.length === 0}
            className="gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Send to {withContact.length} {withContact.length === 1 ? "attendee" : "attendees"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sponsorship Dialog ──────────────────────────────────────────────────────────

type SponsorFormData = {
  companyName: string;
  tier: Tier;
  amount: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  status: "pending" | "confirmed" | "cancelled";
};

function SponsorshipDialog({
  eventId, item, open, onClose,
}: {
  eventId: string;
  item?: { id: string } & SponsorFormData;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateSponsorship();
  const update = useUpdateSponsorship();
  const [form, setForm] = useState<SponsorFormData>(
    item ?? { companyName: "", tier: "custom", amount: "", contactName: "", contactEmail: "", notes: "", status: "pending" }
  );
  const set = (k: keyof SponsorFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload = {
      companyName: form.companyName,
      tier: form.tier,
      amount: form.amount || undefined,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      notes: form.notes || undefined,
      status: form.status,
    };
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSponsorshipsQueryKey(eventId) });
        toast({ title: item ? "Sponsorship updated" : "Sponsorship added" });
        onClose();
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" as const }),
    };
    if (item) update.mutate({ id: eventId, sponsorshipId: item.id, data: payload }, opts);
    else create.mutate({ id: eventId, data: payload }, opts);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Sponsorship" : "Add Sponsor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Apex Technologies" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tier</Label>
              <select value={form.tier} onChange={(e) => set("tier", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" min="0" step="100" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Name</Label>
              <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="jane@company.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Deliverables, perks, special requests..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.companyName.trim()}>
            {isPending ? "Saving..." : item ? "Save Changes" : "Add Sponsor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────────

export function FundraisingTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: auctionItems = [], isLoading: auctionLoading, isError: auctionIsError, error: auctionError } = useListAuctionItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListAuctionItemsQueryKey(eventId) },
  });
  const { data: sponsorships = [], isLoading: sponsorsLoading, isError: sponsorsIsError, error: sponsorsError } = useListSponsorships(eventId, {
    query: { enabled: !!eventId, queryKey: getListSponsorshipsQueryKey(eventId) },
  });

  const deleteAuction = useDeleteAuctionItem();
  const deleteSponsor = useDeleteSponsorship();

  const [auctionDialog, setAuctionDialog] = useState<{ open: boolean; item?: typeof auctionItems[0] }>({ open: false });
  const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; item?: { id: string } & SponsorFormData }>({ open: false });
  const [smsBlast, setSmsBlast] = useState<{ open: boolean; item: typeof auctionItems[0] | null }>({ open: false, item: null });

  const totalRaised = auctionItems.reduce((sum, i) => sum + fmtNum(i.currentBid), 0);
  const totalSponsorship = sponsorships.filter((s) => s.status === "confirmed").reduce((sum, s) => sum + fmtNum(s.amount), 0);
  const openItems = auctionItems.filter((i) => i.status === "open").length;
  const paidItems = auctionItems.filter((i) => i.paymentReceivedAt).length;

  const handleDeleteAuction = (id: string, title: string) => {
    if (!confirm(`Remove "${title}"?`)) return;
    deleteAuction.mutate({ id: eventId, itemId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(eventId) });
        toast({ title: "Auction item removed" });
      },
    });
  };

  const handleDeleteSponsor = (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return;
    deleteSponsor.mutate({ id: eventId, sponsorshipId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSponsorshipsQueryKey(eventId) });
        toast({ title: "Sponsorship removed" });
      },
    });
  };

  return (
    <div className="space-y-10">
      {(auctionIsError || sponsorsIsError) && (
        <QueryError error={auctionIsError ? auctionError : sponsorsError} label="Failed to load fundraising data." />
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">
            <Gavel className="w-3.5 h-3.5" /> Auction Raised
          </div>
          <div className="text-3xl font-black">{fmt(totalRaised.toString())}</div>
          <div className="text-xs text-muted-foreground mt-1">{openItems} item{openItems !== 1 ? "s" : ""} still open</div>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Payments Received
          </div>
          <div className="text-3xl font-black">{paidItems}</div>
          <div className="text-xs text-muted-foreground mt-1">of {auctionItems.length} auction item{auctionItems.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">
            <HandCoins className="w-3.5 h-3.5" /> Confirmed Sponsors
          </div>
          <div className="text-3xl font-black">{fmt(totalSponsorship.toString())}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {sponsorships.filter((s) => s.status === "confirmed").length} of {sponsorships.length} confirmed
          </div>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Total Fundraising
          </div>
          <div className="text-3xl font-black">{fmt((totalRaised + totalSponsorship).toString())}</div>
          <div className="text-xs text-muted-foreground mt-1">auction + confirmed sponsors</div>
        </div>
      </div>

      {/* Auction Items */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Gavel className="w-4 h-4 text-primary" /> Auction Items
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">Items available for bidding at the event</p>
          </div>
          <div className="flex gap-2">
            {auctionItems.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSmsBlast({ open: true, item: null })}>
                <MessageSquare className="w-3.5 h-3.5" /> Text Attendees
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setAuctionDialog({ open: true })}>
              <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
          </div>
        </div>

        {auctionLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : auctionItems.length === 0 ? (
          <div className="border border-dashed rounded-xl p-10 text-center text-muted-foreground">
            <Gavel className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No auction items yet</p>
            <p className="text-xs mt-1">Add items donors can bid on during the event.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {auctionItems.map((item) => {
              const bid = fmtNum(item.currentBid);
              const fmv = fmtNum(item.fairMarketValue);
              const deductible = Math.max(0, bid - fmv);
              const isPaid = !!item.paymentReceivedAt;
              const isWon = item.status === "won";

              return (
                <div key={item.id} className={`bg-card border rounded-xl overflow-hidden flex flex-col gap-0 ${isPaid ? "border-emerald-200" : ""}`}>
                  {/* Photo banner */}
                  {item.imageUrl && (
                    <div className="w-full h-36 overflow-hidden">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {/* Header row */}
                  <div className={`flex flex-col gap-3 p-4`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm leading-tight">{item.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_STYLES[item.status] ?? ""}`}>
                          {item.status}
                        </span>
                        {isPaid && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        )}
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="w-7 h-7" title="Send text blast"
                        onClick={() => setSmsBlast({ open: true, item })}>
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setAuctionDialog({ open: true, item })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDeleteAuction(item.id, item.title)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Bid row */}
                  <div className="flex flex-wrap items-center gap-4 text-xs pt-1 border-t border-border">
                    <div><span className="text-muted-foreground">Start: </span><span className="font-semibold">{fmt(item.startingBid)}</span></div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      <span className="text-muted-foreground">Winning Bid: </span>
                      <span className="font-bold text-emerald-600">{fmt(item.currentBid)}</span>
                    </div>
                    {item.fairMarketValue && (
                      <div><span className="text-muted-foreground">FMV: </span><span className="font-semibold">{fmt(item.fairMarketValue)}</span></div>
                    )}
                    {item.winnerName && (
                      <div className="flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-amber-500" />
                        <span className="font-semibold text-amber-600">{item.winnerName}</span>
                      </div>
                    )}
                  </div>

                  {/* Donor / payment row */}
                  {(item.donorName || item.paymentMethod || item.paymentLink) && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
                      {item.donorName && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>Donated by <span className="font-semibold text-foreground">{item.donorName}</span></span>
                        </div>
                      )}
                      {item.paymentMethod && (
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          <span>{item.paymentMethod}</span>
                        </div>
                      )}
                      {item.paymentLink && (
                        <a href={item.paymentLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline font-semibold">
                          <LinkIcon className="w-3 h-3" /> Pay now
                        </a>
                      )}
                    </div>
                  )}

                  {/* Tax deduction + payment confirmation — shown when won */}
                  {isWon && bid > 0 && (
                    <div className={`rounded-lg border p-3 text-xs space-y-2 ${isPaid ? "bg-emerald-50 border-emerald-200" : "bg-muted/30 border-border"}`}>
                      <div className={`font-semibold flex items-center gap-1.5 ${isPaid ? "text-emerald-800" : "text-foreground"}`}>
                        <Receipt className="w-3.5 h-3.5" />
                        Donation Receipt
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-muted-foreground">Amount Paid</span>
                        <span className="font-bold">{fmt(item.currentBid)}</span>

                        <span className="text-muted-foreground">Fair Market Value</span>
                        <span className="font-semibold">{item.fairMarketValue ? fmt(item.fairMarketValue) : <span className="italic text-muted-foreground">not set</span>}</span>

                        <span className="text-muted-foreground">Tax-Deductible Amount</span>
                        <span className={`font-bold ${deductible > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {item.fairMarketValue ? `$${deductible.toLocaleString()}` : "—"}
                        </span>

                        <span className="text-muted-foreground">Payment Status</span>
                        <span className={`font-semibold ${isPaid ? "text-emerald-700" : "text-amber-600"}`}>
                          {isPaid
                            ? `Received ${format(new Date(item.paymentReceivedAt!), "MMM d, yyyy")}`
                            : "Pending"}
                        </span>
                      </div>
                      {item.fairMarketValue && deductible > 0 && (
                        <p className="text-muted-foreground italic leading-relaxed">
                          The winning bid of {fmt(item.currentBid)} exceeds the fair market value of {fmt(item.fairMarketValue)} by ${deductible.toLocaleString()}, which may be tax-deductible as a charitable contribution. Consult a tax advisor.
                        </p>
                      )}
                    </div>
                  )}
                  </div>{/* end p-4 content wrapper */}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sponsorships */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-primary" /> Sponsorships
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">Companies and organizations sponsoring this event</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setSponsorDialog({ open: true })}>
            <Plus className="w-3.5 h-3.5" /> Add Sponsor
          </Button>
        </div>

        {sponsorsLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : sponsorships.length === 0 ? (
          <div className="border border-dashed rounded-xl p-10 text-center text-muted-foreground">
            <HandCoins className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No sponsors yet</p>
            <p className="text-xs mt-1">Add companies or organizations sponsoring this event.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(["gold", "silver", "bronze", "custom"] as Tier[]).map((tier) => {
              const tierSponsors = sponsorships.filter((s) => s.tier === tier);
              if (tierSponsors.length === 0) return null;
              return (
                <div key={tier}>
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border mb-2 ${TIER_STYLES[tier]}`}>
                    <DollarSign className="w-3 h-3" />
                    {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {tierSponsors.map((s) => (
                      <div key={s.id} className="bg-card border rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{s.companyName}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_STYLES[s.status] ?? ""}`}>
                                {s.status}
                              </span>
                            </div>
                            {s.amount && <div className="text-lg font-black text-primary mt-0.5">{fmt(s.amount)}</div>}
                            {(s.contactName || s.contactEmail) && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                <Mail className="w-3 h-3" />
                                <span>{[s.contactName, s.contactEmail].filter(Boolean).join(" · ")}</span>
                              </div>
                            )}
                            {s.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{s.notes}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="w-7 h-7"
                              onClick={() => setSponsorDialog({ open: true, item: { id: s.id, companyName: s.companyName, tier: s.tier as Tier, amount: s.amount ?? "", contactName: s.contactName ?? "", contactEmail: s.contactEmail ?? "", notes: s.notes ?? "", status: s.status as "pending" | "confirmed" | "cancelled" } })}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDeleteSponsor(s.id, s.companyName)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AuctionItemDialog
        eventId={eventId}
        item={auctionDialog.item ? {
          id: auctionDialog.item.id,
          title: auctionDialog.item.title,
          description: auctionDialog.item.description ?? "",
          imageUrl: auctionDialog.item.imageUrl ?? "",
          startingBid: auctionDialog.item.startingBid ?? "",
          currentBid: auctionDialog.item.currentBid ?? "",
          fairMarketValue: auctionDialog.item.fairMarketValue ?? "",
          winnerName: auctionDialog.item.winnerName ?? "",
          donorName: auctionDialog.item.donorName ?? "",
          paymentMethod: auctionDialog.item.paymentMethod ?? "",
          paymentLink: auctionDialog.item.paymentLink ?? "",
          paymentReceived: !!auctionDialog.item.paymentReceivedAt,
          status: auctionDialog.item.status as "open" | "closed" | "won",
        } : undefined}
        open={auctionDialog.open}
        onClose={() => setAuctionDialog({ open: false })}
      />
      <SponsorshipDialog
        eventId={eventId}
        item={sponsorDialog.item}
        open={sponsorDialog.open}
        onClose={() => setSponsorDialog({ open: false })}
      />
      <SmsBlastDialog
        eventId={eventId}
        item={smsBlast.item}
        open={smsBlast.open}
        onClose={() => setSmsBlast({ open: false, item: null })}
      />
    </div>
  );
}
