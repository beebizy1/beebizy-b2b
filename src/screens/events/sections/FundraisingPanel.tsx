/**
 * Fundraising: the auction and the sponsors, and what each brought in.
 *
 * The tax-deduction block is the reason this tab is more than a list. When a lot is won,
 * the deductible portion is `winningBid - fairMarketValue`, floored at zero — a bid at or
 * below fair market value buys goods rather than donating, and there is nothing to
 * deduct. It only renders once a lot is actually won and has a bid, because a receipt
 * for an open lot would be a claim nobody can make yet.
 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
  Gavel,
  HandCoins,
  Link as LinkIcon,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Trophy,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { EmptyState, Panel, Pill, StatTile, type Tone } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, formatMoney, sumCents } from "@/data/money";
import { taxDeductibleCents } from "@/data/fundraising";
import {
  useAddAuctionItem,
  useAddSponsorship,
  useAuctionItems,
  useEventRegistrations,
  useRemoveAuctionItem,
  useRemoveSponsorship,
  useSponsorships,
  useUpdateAuctionItem,
  useUpdateSponsorship,
} from "@/data/hooks";
import {
  AUCTION_ITEM_STATUSES,
  BOOKING_STATUSES,
  SPONSORSHIP_TIERS,
  type AuctionItem,
  type AuctionItemStatus,
  type BookingStatus,
  type Event,
  type Sponsorship,
  type SponsorshipTier,
} from "@/data/entities";

const PAYMENT_METHODS = ["Check", "Credit Card", "Cash", "Venmo", "Zelle", "Wire Transfer", "PayPal", "Other"];

const TIER_TONE: Record<SponsorshipTier, Tone> = {
  gold: "warning",
  silver: "neutral",
  bronze: "brand",
  custom: "info",
};

const AUCTION_TONE: Record<AuctionItemStatus, Tone> = {
  open: "success",
  closed: "neutral",
  won: "warning",
};

const BOOKING_TONE: Record<BookingStatus, Tone> = {
  confirmed: "success",
  pending: "warning",
  cancelled: "danger",
};

/* ------------------------------------------------------------- auction dialog */

interface AuctionFields {
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
  status: AuctionItemStatus;
}

const BLANK_AUCTION: AuctionFields = {
  title: "",
  description: "",
  imageUrl: "",
  startingBid: "",
  currentBid: "",
  fairMarketValue: "",
  winnerName: "",
  donorName: "",
  paymentMethod: "",
  paymentLink: "",
  paymentReceived: false,
  status: "open",
};

function fieldsFrom(item: AuctionItem): AuctionFields {
  return {
    title: item.title,
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
    startingBid: item.startingBidCents == null ? "" : String(item.startingBidCents / 100),
    currentBid: item.currentBidCents == null ? "" : String(item.currentBidCents / 100),
    fairMarketValue: item.fairMarketValueCents == null ? "" : String(item.fairMarketValueCents / 100),
    winnerName: item.winnerName ?? "",
    donorName: item.donorName ?? "",
    paymentMethod: item.paymentMethod ?? "",
    paymentLink: item.paymentLink ?? "",
    paymentReceived: item.paymentReceivedAt != null,
    status: item.status,
  };
}

function AuctionItemDialog({
  eventId,
  item,
  open,
  onClose,
}: {
  eventId: string;
  item: AuctionItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const add = useAddAuctionItem();
  const update = useUpdateAuctionItem();
  const [form, setForm] = useState<AuctionFields>(BLANK_AUCTION);

  // Reseed whenever the dialog opens on a different lot.
  useEffect(() => {
    if (open) setForm(item ? fieldsFrom(item) : BLANK_AUCTION);
  }, [open, item]);

  const set = <K extends keyof AuctionFields>(key: K, value: AuctionFields[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pending = add.isPending || update.isPending;

  const save = () => {
    const title = form.title.trim();
    if (!title) return;

    const draft = {
      title,
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      startingBidCents: centsFromInput(form.startingBid),
      currentBidCents: centsFromInput(form.currentBid),
      fairMarketValueCents: centsFromInput(form.fairMarketValue),
      winnerName: form.winnerName.trim() || null,
      donorName: form.donorName.trim() || null,
      paymentMethod: form.paymentMethod || null,
      paymentLink: form.paymentLink.trim() || null,
      // Keep the original timestamp when it was already received, so editing a lot
      // doesn't silently restamp when the money actually arrived.
      paymentReceivedAt: form.paymentReceived
        ? (item?.paymentReceivedAt ?? new Date().toISOString())
        : null,
      status: form.status,
    };

    const handlers = {
      onSuccess: () => {
        toast({ title: item ? "Auction item updated" : "Auction item added" });
        onClose();
      },
      onError: (error: Error) => toast({ title: "Couldn't save the item", description: error.message }),
    };

    if (item) update.mutate({ eventId, id: item.id, patch: draft }, handlers);
    else add.mutate({ eventId, draft }, handlers);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Auction Item" : "Add Auction Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="lot-title">Title</Label>
            <Input
              id="lot-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Weekend at the Cascade cabin"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lot-description">Description</Label>
            <Textarea
              id="lot-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Two nights, sleeps six, dates by arrangement."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lot-image">Item photo URL</Label>
            <Input
              id="lot-image"
              type="url"
              value={form.imageUrl}
              onChange={(e) => set("imageUrl", e.target.value)}
              placeholder="https://…"
            />
            {form.imageUrl ? (
              <img
                src={form.imageUrl}
                alt=""
                className="mt-2 h-28 w-full rounded-lg border border-hairline object-cover"
              />
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lot-start">Starting bid</Label>
              <Input
                id="lot-start"
                value={form.startingBid}
                onChange={(e) => set("startingBid", e.target.value)}
                inputMode="decimal"
                placeholder="500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-current">Winning bid</Label>
              <Input
                id="lot-current"
                value={form.currentBid}
                onChange={(e) => set("currentBid", e.target.value)}
                inputMode="decimal"
                placeholder="1,200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-fmv">Fair market value</Label>
              <Input
                id="lot-fmv"
                value={form.fairMarketValue}
                onChange={(e) => set("fairMarketValue", e.target.value)}
                inputMode="decimal"
                placeholder="800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lot-donor">Donated by</Label>
              <Input
                id="lot-donor"
                value={form.donorName}
                onChange={(e) => set("donorName", e.target.value)}
                placeholder="Cascade Capital"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-winner">Winner</Label>
              <Input
                id="lot-winner"
                value={form.winnerName}
                onChange={(e) => set("winnerName", e.target.value)}
                placeholder="Priya Raghunathan"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lot-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as AuctionItemStatus)}>
                <SelectTrigger id="lot-status" className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUCTION_ITEM_STATUSES.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-method">How payment will be received</Label>
              <Select value={form.paymentMethod || "none"} onValueChange={(v) => set("paymentMethod", v === "none" ? "" : v)}>
                <SelectTrigger id="lot-method">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {PAYMENT_METHODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lot-link">Payment link</Label>
            <Input
              id="lot-link"
              type="url"
              value={form.paymentLink}
              onChange={(e) => set("paymentLink", e.target.value)}
              placeholder="https://…"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={form.paymentReceived}
              onCheckedChange={(checked) => set("paymentReceived", checked === true)}
            />
            Mark payment as received
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!form.title.trim() || pending}>
            {item ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- sponsor dialog */

interface SponsorFields {
  companyName: string;
  tier: SponsorshipTier;
  amount: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  status: BookingStatus;
}

const BLANK_SPONSOR: SponsorFields = {
  companyName: "",
  tier: "custom",
  amount: "",
  contactName: "",
  contactEmail: "",
  notes: "",
  status: "pending",
};

function SponsorshipDialog({
  eventId,
  sponsor,
  open,
  onClose,
}: {
  eventId: string;
  sponsor: Sponsorship | null;
  open: boolean;
  onClose: () => void;
}) {
  const add = useAddSponsorship();
  const update = useUpdateSponsorship();
  const [form, setForm] = useState<SponsorFields>(BLANK_SPONSOR);

  useEffect(() => {
    if (!open) return;
    setForm(
      sponsor
        ? {
            companyName: sponsor.companyName,
            tier: sponsor.tier,
            amount: sponsor.amountCents == null ? "" : String(sponsor.amountCents / 100),
            contactName: sponsor.contactName ?? "",
            contactEmail: sponsor.contactEmail ?? "",
            notes: sponsor.notes ?? "",
            status: sponsor.status,
          }
        : BLANK_SPONSOR,
    );
  }, [open, sponsor]);

  const set = <K extends keyof SponsorFields>(key: K, value: SponsorFields[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pending = add.isPending || update.isPending;

  const save = () => {
    const companyName = form.companyName.trim();
    if (!companyName) return;

    const draft = {
      companyName,
      tier: form.tier,
      amountCents: centsFromInput(form.amount),
      contactName: form.contactName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };

    const handlers = {
      onSuccess: () => {
        toast({ title: sponsor ? "Sponsorship updated" : "Sponsorship added" });
        onClose();
      },
      onError: (error: Error) => toast({ title: "Couldn't save the sponsorship", description: error.message }),
    };

    if (sponsor) update.mutate({ eventId, id: sponsor.id, patch: draft }, handlers);
    else add.mutate({ eventId, draft }, handlers);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sponsor ? "Edit Sponsorship" : "Add Sponsor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="sponsor-company">Company name</Label>
            <Input
              id="sponsor-company"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Apex Technologies"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sponsor-tier">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => set("tier", v as SponsorshipTier)}>
                <SelectTrigger id="sponsor-tier" className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPONSORSHIP_TIERS.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sponsor-amount">Amount</Label>
              <Input
                id="sponsor-amount"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                inputMode="decimal"
                placeholder="10,000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sponsor-contact">Contact name</Label>
              <Input
                id="sponsor-contact"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sponsor-email">Contact email</Label>
              <Input
                id="sponsor-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sponsor-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as BookingStatus)}>
              <SelectTrigger id="sponsor-status" className="capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKING_STATUSES.map((option) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sponsor-notes">Notes</Label>
            <Textarea
              id="sponsor-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Logo on stage backdrop, table of ten."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!form.companyName.trim() || pending}>
            {sponsor ? "Save changes" : "Add sponsor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- message blast */

/**
 * Broadcast to everyone registered for the event.
 *
 * The reference design sends SMS and filters recipients by phone number. This workspace
 * stores one `contact` per attendee and no phone field, so the blast goes to whatever
 * contact is on file and says so. Nothing is delivered — no messaging provider is
 * connected — and the dialog states that rather than implying a send.
 */
function MessageBlastDialog({
  eventId,
  item,
  open,
  onClose,
}: {
  eventId: string;
  item: AuctionItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: registrations, isLoading } = useEventRegistrations(eventId);
  const [message, setMessage] = useState("");

  const recipients = (registrations ?? []).filter((r) => r.status !== "cancelled" && r.guest?.contact);

  useEffect(() => {
    if (!open) return;
    setMessage(
      item
        ? `Auction update: "${item.title}" — current bid ${
            item.currentBidCents == null ? "is open" : formatMoney(item.currentBidCents)
          }.${item.paymentLink ? ` Pay now: ${item.paymentLink}` : " Place your bid at the event!"}`
        : "",
    );
  }, [open, item]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4" aria-hidden="true" />
            Message Attendees
          </DialogTitle>
          <DialogDescription>
            Draft a broadcast to everyone registered for this event who has a contact on file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="blast-message">Message</Label>
            <Textarea
              id="blast-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Type your message…"
              className="resize-none"
            />
            <p className="text-right text-xs text-muted-foreground">
              <span data-numeric>{message.length}</span> characters
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-hairline">
            <div className="flex items-center justify-between border-b border-hairline bg-surface-sunken px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Recipients with a contact on file</span>
              <Pill tone={recipients.length > 0 ? "success" : "neutral"}>
                {recipients.length} of {registrations?.length ?? 0}
              </Pill>
            </div>
            {isLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : recipients.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Nobody registered for this event has a contact on file yet.
              </p>
            ) : (
              <ul className="max-h-36 divide-y divide-hairline overflow-y-auto">
                {recipients.map((registration) => (
                  <li key={registration.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{registration.guest?.name}</span>
                    <span className="text-xs text-muted-foreground">{registration.guest?.contact}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning-text">
            No messaging provider is connected, so nothing is sent. Connect one to enable delivery.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled title="Connect a messaging provider to enable delivery">
            <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />
            Send to {recipients.length} {recipients.length === 1 ? "attendee" : "attendees"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------------- cards */

function AuctionCard({
  eventId,
  item,
  onEdit,
  onMessage,
  onDelete,
}: {
  eventId: string;
  item: AuctionItem;
  onEdit: () => void;
  onMessage: () => void;
  onDelete: () => void;
}) {
  const { date: formatDate } = usePreferences();
  const deductible = taxDeductibleCents(item);
  const isPaid = item.paymentReceivedAt != null;
  const showReceipt = item.status === "won" && (item.currentBidCents ?? 0) > 0;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs",
        isPaid ? "border-success/40" : "border-card-border",
      )}
      data-event-id={eventId}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="h-36 w-full object-cover" />
      ) : null}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold leading-tight text-foreground">{item.title}</span>
              <Pill tone={AUCTION_TONE[item.status]}>{item.status}</Pill>
              {isPaid ? (
                <Pill tone="success">
                  <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                  Paid
                </Pill>
              ) : null}
            </div>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={onMessage} aria-label={`Message attendees about ${item.title}`}>
              <MessageSquare className="size-3.5" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label={`Edit ${item.title}`}>
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label={`Remove ${item.title}`}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-hairline pt-2 text-xs">
          <div>
            <span className="text-muted-foreground">Start: </span>
            <span data-numeric className="font-semibold text-foreground">
              {item.startingBidCents == null ? "—" : formatMoney(item.startingBidCents)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="size-3 text-success" aria-hidden="true" />
            <span className="text-muted-foreground">Winning bid: </span>
            <span data-numeric className="font-bold text-success-text">
              {item.currentBidCents == null ? "—" : formatMoney(item.currentBidCents)}
            </span>
          </div>
          {item.fairMarketValueCents != null ? (
            <div>
              <span className="text-muted-foreground">FMV: </span>
              <span data-numeric className="font-semibold text-foreground">
                {formatMoney(item.fairMarketValueCents)}
              </span>
            </div>
          ) : null}
          {item.winnerName ? (
            <div className="flex items-center gap-1">
              <Trophy className="size-3 text-primary-text" aria-hidden="true" />
              <span className="font-semibold text-primary-text">{item.winnerName}</span>
            </div>
          ) : null}
        </div>

        {item.donorName || item.paymentMethod || item.paymentLink ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-2 text-xs text-muted-foreground">
            {item.donorName ? (
              <span className="flex items-center gap-1">
                <User className="size-3" aria-hidden="true" />
                Donated by <span className="font-semibold text-foreground">{item.donorName}</span>
              </span>
            ) : null}
            {item.paymentMethod ? (
              <span className="flex items-center gap-1">
                <CreditCard className="size-3" aria-hidden="true" />
                {item.paymentMethod}
              </span>
            ) : null}
            {item.paymentLink ? (
              <a
                href={item.paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-semibold text-primary-text hover:underline"
              >
                <LinkIcon className="size-3" aria-hidden="true" />
                Pay now
              </a>
            ) : null}
          </div>
        ) : null}

        {showReceipt ? (
          <div
            className={cn(
              "space-y-2 rounded-lg border p-3 text-xs",
              isPaid ? "border-success/30 bg-success-tint" : "border-hairline bg-surface-sunken",
            )}
          >
            <p className={cn("flex items-center gap-1.5 font-semibold", isPaid ? "text-success-text" : "text-foreground")}>
              <Receipt className="size-3.5" aria-hidden="true" />
              Donation Receipt
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Amount paid</span>
              <span data-numeric className="font-bold text-foreground">
                {formatMoney(item.currentBidCents)}
              </span>

              <span className="text-muted-foreground">Fair market value</span>
              <span data-numeric className="font-semibold text-foreground">
                {item.fairMarketValueCents == null ? (
                  <span className="italic text-muted-foreground">not set</span>
                ) : (
                  formatMoney(item.fairMarketValueCents)
                )}
              </span>

              <span className="text-muted-foreground">Tax-deductible amount</span>
              <span
                data-numeric
                className={cn("font-bold", deductible && deductible > 0 ? "text-success-text" : "text-muted-foreground")}
              >
                {deductible == null ? "—" : formatMoney(deductible)}
              </span>

              <span className="text-muted-foreground">Payment status</span>
              <span className={cn("font-semibold", isPaid ? "text-success-text" : "text-warning-text")}>
                {isPaid ? `Received ${formatDate(item.paymentReceivedAt, "dayMonthYear")}` : "Pending"}
              </span>
            </div>
            {deductible != null && deductible > 0 ? (
              <p className="italic leading-relaxed text-muted-foreground">
                The winning bid of {formatMoney(item.currentBidCents)} exceeds the fair market value of{" "}
                {formatMoney(item.fairMarketValueCents)} by {formatMoney(deductible)}, which may be tax-deductible as a
                charitable contribution. Consult a tax advisor.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- panel */

export default function FundraisingPanel({ event }: { event: Event }) {
  const { data: auctionItems, isLoading: auctionLoading } = useAuctionItems(event.id);
  const { data: sponsorships, isLoading: sponsorsLoading } = useSponsorships(event.id);
  const removeAuction = useRemoveAuctionItem();
  const removeSponsor = useRemoveSponsorship();

  const [auctionDialog, setAuctionDialog] = useState<{ open: boolean; item: AuctionItem | null }>({
    open: false,
    item: null,
  });
  const [sponsorDialog, setSponsorDialog] = useState<{ open: boolean; sponsor: Sponsorship | null }>({
    open: false,
    sponsor: null,
  });
  const [blast, setBlast] = useState<{ open: boolean; item: AuctionItem | null }>({ open: false, item: null });
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "auction" | "sponsor"; id: string; label: string } | null
  >(null);

  const lots = auctionItems ?? [];
  const sponsors = sponsorships ?? [];

  const auctionRaised = sumCents(lots.map((lot) => lot.currentBidCents));
  const confirmedSponsors = sponsors.filter((s) => s.status === "confirmed");
  const sponsorTotal = sumCents(confirmedSponsors.map((s) => s.amountCents));
  const openLots = lots.filter((lot) => lot.status === "open").length;
  const paidLots = lots.filter((lot) => lot.paymentReceivedAt != null).length;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Auction raised"
          value={formatMoney(auctionRaised)}
          icon={Gavel}
          sublabel={`${openLots} ${openLots === 1 ? "item" : "items"} still open`}
        />
        <StatTile
          label="Payments received"
          value={String(paidLots)}
          icon={CheckCircle2}
          tone={paidLots > 0 ? "success" : "neutral"}
          sublabel={`of ${lots.length} auction ${lots.length === 1 ? "item" : "items"}`}
        />
        <StatTile
          label="Confirmed sponsors"
          value={formatMoney(sponsorTotal)}
          icon={HandCoins}
          sublabel={`${confirmedSponsors.length} of ${sponsors.length} confirmed`}
        />
        <StatTile
          label="Total fundraising"
          value={formatMoney(auctionRaised + sponsorTotal)}
          icon={TrendingUp}
          tone="success"
          sublabel="Auction plus confirmed sponsors"
        />
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Gavel className="size-4 text-primary-text" aria-hidden="true" />
              Auction Items
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Items available for bidding at the event</p>
          </div>
          <div className="flex gap-2">
            {lots.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setBlast({ open: true, item: null })}>
                <MessageSquare className="mr-1.5 size-3.5" aria-hidden="true" />
                Message Attendees
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setAuctionDialog({ open: true, item: null })}>
              <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
              Add Item
            </Button>
          </div>
        </div>

        {auctionLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : lots.length === 0 ? (
          <Panel className="border-dashed">
            <EmptyState
              icon={Gavel}
              title="No auction items yet"
              description="Add items donors can bid on during the event."
              action={
                <Button size="sm" onClick={() => setAuctionDialog({ open: true, item: null })}>
                  Add Item
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lots.map((lot) => (
              <AuctionCard
                key={lot.id}
                eventId={event.id}
                item={lot}
                onEdit={() => setAuctionDialog({ open: true, item: lot })}
                onMessage={() => setBlast({ open: true, item: lot })}
                onDelete={() => setConfirmDelete({ kind: "auction", id: lot.id, label: lot.title })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <HandCoins className="size-4 text-primary-text" aria-hidden="true" />
              Sponsorships
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Companies and organizations sponsoring this event
            </p>
          </div>
          <Button size="sm" onClick={() => setSponsorDialog({ open: true, sponsor: null })}>
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Add Sponsor
          </Button>
        </div>

        {sponsorsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : sponsors.length === 0 ? (
          <Panel className="border-dashed">
            <EmptyState
              icon={HandCoins}
              title="No sponsors yet"
              description="Add companies or organizations sponsoring this event."
              action={
                <Button size="sm" onClick={() => setSponsorDialog({ open: true, sponsor: null })}>
                  Add Sponsor
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="space-y-5">
            {SPONSORSHIP_TIERS.map((tier) => {
              const tierSponsors = sponsors.filter((s) => s.tier === tier);
              if (tierSponsors.length === 0) return null;
              return (
                <div key={tier}>
                  <Pill tone={TIER_TONE[tier]} className="mb-2">
                    <DollarSign className="mr-1 size-3" aria-hidden="true" />
                    {tier} tier
                  </Pill>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tierSponsors.map((sponsor) => (
                      <div key={sponsor.id} className="rounded-xl border border-card-border bg-card p-4 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{sponsor.companyName}</span>
                              <Pill tone={BOOKING_TONE[sponsor.status]}>{sponsor.status}</Pill>
                            </div>
                            {sponsor.amountCents != null ? (
                              <p data-numeric className="mt-0.5 text-lg font-black text-primary-text">
                                {formatMoney(sponsor.amountCents)}
                              </p>
                            ) : null}
                            {sponsor.contactName || sponsor.contactEmail ? (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="size-3" aria-hidden="true" />
                                {[sponsor.contactName, sponsor.contactEmail].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                            {sponsor.notes ? (
                              <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{sponsor.notes}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setSponsorDialog({ open: true, sponsor })}
                              aria-label={`Edit ${sponsor.companyName}`}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:text-destructive"
                              onClick={() =>
                                setConfirmDelete({ kind: "sponsor", id: sponsor.id, label: sponsor.companyName })
                              }
                              aria-label={`Remove ${sponsor.companyName}`}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
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
      </section>

      <AuctionItemDialog
        eventId={event.id}
        item={auctionDialog.item}
        open={auctionDialog.open}
        onClose={() => setAuctionDialog({ open: false, item: null })}
      />
      <SponsorshipDialog
        eventId={event.id}
        sponsor={sponsorDialog.sponsor}
        open={sponsorDialog.open}
        onClose={() => setSponsorDialog({ open: false, sponsor: null })}
      />
      <MessageBlastDialog
        eventId={event.id}
        item={blast.item}
        open={blast.open}
        onClose={() => setBlast({ open: false, item: null })}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(next) => (next ? undefined : setConfirmDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDelete) return;
                const handlers = {
                  onSuccess: () =>
                    toast({ title: confirmDelete.kind === "auction" ? "Auction item removed" : "Sponsorship removed" }),
                  onError: (error: Error) => toast({ title: "Couldn't remove it", description: error.message }),
                };
                if (confirmDelete.kind === "auction") {
                  removeAuction.mutate({ eventId: event.id, id: confirmDelete.id }, handlers);
                } else {
                  removeSponsor.mutate({ eventId: event.id, id: confirmDelete.id }, handlers);
                }
                setConfirmDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
