/**
 * Requests for proposal, and the quotes that came back.
 *
 * An RFP is a question put to a market, so the budget is a range and the replies are the
 * point. Each RFP renders with its responses inline — the adapter attaches them to the
 * list read, so opening one costs no extra fetch.
 */

import { useState } from "react";
import { BedDouble, Check, Copy, FileText, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { formatInZone } from "@/lib/datetime";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, formatMoney } from "@/data/money";
import {
  useAddRfp,
  useAddRfpResponse,
  useInviteVendorToRfp,
  useRemoveRfp,
  useRemoveRfpResponse,
  useRfps,
  useSetRfpResponseStatus,
  useUpdateRfp,
  useVendors,
} from "@/data/hooks";
import {
  RFP_EVENT_TYPES,
  RFP_RESPONSE_STATUSES,
  RFP_TARGET_TYPES,
  VENDOR_CATEGORIES,
  type Event,
  type RfpResponseStatus,
  type RfpSpaceRequirement,
  type RfpStatus,
  type RfpWithResponses,
} from "@/data/entities";

type SpaceDraft = Omit<RfpSpaceRequirement, "date" | "capacity"> & { date: string; capacity: string };

function isoDay(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null;
}

function nextDay(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function hotelSpaces(firstDay: string, attendeeCount: string): SpaceDraft[] {
  const secondDay = nextDay(firstDay);
  return [
    { id: crypto.randomUUID(), purpose: "Registration", date: firstDay, startTime: "15:00", endTime: "18:00", capacity: attendeeCount, notes: "Welcome desk and arrival space" },
    { id: crypto.randomUUID(), purpose: "Breakfast", date: secondDay, startTime: "07:30", endTime: "09:00", capacity: attendeeCount, notes: null },
    { id: crypto.randomUUID(), purpose: "Meeting", date: secondDay, startTime: "09:00", endTime: "12:00", capacity: attendeeCount, notes: null },
    { id: crypto.randomUUID(), purpose: "Lunch", date: secondDay, startTime: "12:00", endTime: "13:30", capacity: attendeeCount, notes: null },
  ];
}

const REQUIRED_HOTEL_SPACE_NAMES = ["registration", "breakfast", "meeting", "lunch"] as const;

function ensureHotelSpaces(current: SpaceDraft[], firstDay: string, attendeeCount: string): SpaceDraft[] {
  const existing = new Set(current.map((space) => space.purpose.trim().toLowerCase()));
  return [...current, ...hotelSpaces(firstDay, attendeeCount).filter((space) => !existing.has(space.purpose.toLowerCase()))];
}

const RFP_TONE: Record<RfpStatus, "neutral" | "info" | "success"> = {
  draft: "neutral",
  sent: "info",
  closed: "success",
};

/** A quote's status is the whole point of the row, so the control shows it in colour. */
const RESPONSE_TONE: Record<RfpResponseStatus, string> = {
  pending: "text-muted-foreground",
  received: "text-info-text",
  accepted: "text-success-text font-semibold",
  declined: "text-danger-text",
};

function budgetRange(rfp: RfpWithResponses): string | null {
  if (rfp.budgetMinCents == null && rfp.budgetMaxCents == null) return null;
  if (rfp.budgetMinCents != null && rfp.budgetMaxCents != null) {
    return `${formatMoney(rfp.budgetMinCents)} – ${formatMoney(rfp.budgetMaxCents)}`;
  }
  return formatMoney(rfp.budgetMinCents ?? rfp.budgetMaxCents);
}

function ResponseRow({
  eventId,
  rfpId,
  response,
}: {
  eventId: string;
  rfpId: string;
  response: RfpWithResponses["responses"][number];
}) {
  const setStatus = useSetRfpResponseStatus();
  const remove = useRemoveRfpResponse();

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{response.vendorName}</p>
        <p className="truncate text-sm text-muted-foreground">
          {response.contactName ?? response.contactEmail ?? "No contact on file"}
          {response.notes ? ` · ${response.notes}` : ""}
        </p>
      </div>

      <span data-numeric className="shrink-0 text-sm font-medium text-foreground">
        {response.quotedAmountCents == null ? "No quote yet" : formatMoney(response.quotedAmountCents)}
      </span>

      <Select
        value={response.status}
        onValueChange={(value) =>
          setStatus.mutate(
            { eventId, rfpId, responseId: response.id, status: value as RfpResponseStatus },
            { onError: (error) => toast({ title: "Couldn't update reply", description: error.message }) },
          )
        }
      >
        <SelectTrigger
          className={cn("w-[130px] capitalize", RESPONSE_TONE[response.status])}
          aria-label={`Status for ${response.vendorName}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RFP_RESPONSE_STATUSES.map((option) => (
            <SelectItem key={option} value={option} className="capitalize">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${response.vendorName}`}
        onClick={() =>
          remove.mutate(
            { eventId, rfpId, responseId: response.id },
            { onError: (error) => toast({ title: "Couldn't remove reply", description: error.message }) },
          )
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

function AddResponse({ eventId, rfpId }: { eventId: string; rfpId: string }) {
  const add = useAddRfpResponse();
  const [vendorName, setVendorName] = useState("");
  const [quote, setQuote] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const trimmed = vendorName.trim();
        if (!trimmed) return;
        add.mutate(
          {
            eventId,
            rfpId,
            draft: { vendorName: trimmed, quotedAmountCents: centsFromInput(quote), status: "received" },
          },
          {
            onSuccess: () => {
              setVendorName("");
              setQuote("");
            },
            onError: (error) => toast({ title: "Couldn't log the reply", description: error.message }),
          },
        );
      }}
    >
      <Input
        value={vendorName}
        onChange={(inputEvent) => setVendorName(inputEvent.target.value)}
        placeholder="Vendor who replied…"
        aria-label="Vendor name"
        className="min-w-[10rem] flex-1"
      />
      <Input
        value={quote}
        onChange={(inputEvent) => setQuote(inputEvent.target.value)}
        placeholder="Quote"
        inputMode="decimal"
        aria-label="Quoted amount"
        className="w-32 text-right"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!vendorName.trim() || add.isPending}>
        <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
        Log reply
      </Button>
    </form>
  );
}

function InviteVendor({ eventId, rfp }: { eventId: string; rfp: RfpWithResponses }) {
  const { data: vendors } = useVendors();
  const invite = useInviteVendorToRfp();
  const [vendorId, setVendorId] = useState("");
  const available = (vendors ?? []).filter((vendor) => vendor.contactEmail);

  return (
    <div className="space-y-3 border-b border-hairline px-5 py-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor={`rfp-vendor-${rfp.id}`}>Send to a venue or vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger id={`rfp-vendor-${rfp.id}`}><SelectValue placeholder="Choose from the vendor directory…" /></SelectTrigger>
            <SelectContent>
              {available.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.category}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" disabled={!vendorId || invite.isPending} onClick={() => invite.mutate(
          { eventId, rfpId: rfp.id, vendorId },
          {
            onSuccess: (invitation) => {
              setVendorId("");
              toast(invitation.deliveredAt
                ? { title: "Proposal email submitted", description: "The vendor can review the brief and respond without a Beebizy account. Inbox delivery is not guaranteed." }
                : { title: "Link saved, but email was not sent", description: "Copy the proposal link below or try sending again.", variant: "destructive" });
            },
            onError: (error) => toast({ title: "Couldn't send the RFP", description: error.message }),
          },
        )}><Mail className="mr-1.5 size-3.5" />Send RFP</Button>
      </div>
      {available.length === 0 ? <p className="text-xs text-muted-foreground">Add a vendor with a contact email in the vendor directory first.</p> : null}
      {rfp.invitations.length > 0 ? (
        <ul className="space-y-2">
          {rfp.invitations.map((invitation) => {
            const url = `${window.location.origin}/rfp/${invitation.publicToken}`;
            return (
              <li key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs">
                <span className="font-semibold text-foreground">{invitation.vendorName}</span>
                <span className="text-muted-foreground">{invitation.recipientEmail}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                  {invitation.deliveredAt ? <><Check className="size-3 text-success-text" />Emailed</> : invitation.deliveryError ? "Email failed" : "Queued"}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(url).then(() => toast({ title: "Proposal link copied" })).catch(() => toast({ title: "Couldn't copy the link", variant: "destructive" }))}>
                  <Copy className="mr-1 size-3" />Copy link
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function EditRfpForm({ eventId, rfp, onDone }: { eventId: string; rfp: RfpWithResponses; onDone: () => void }) {
  const update = useUpdateRfp();
  const [draft, setDraft] = useState(() => ({
    title: rfp.title,
    eventType: (RFP_EVENT_TYPES as readonly string[]).includes(rfp.eventType ?? "") ? rfp.eventType! : "Other",
    eventDate: rfp.eventDate?.slice(0, 10) ?? "",
    startTime: rfp.startTime ?? "",
    endTime: rfp.endTime ?? "",
    headcount: rfp.headcount?.toString() ?? "",
    city: rfp.city ?? "",
    location: rfp.location ?? "",
    description: rfp.description ?? "",
    requirements: rfp.requirements ?? "",
    deadline: rfp.deadline?.slice(0, 10) ?? "",
    budgetMin: rfp.budgetMinCents == null ? "" : String(rfp.budgetMinCents / 100),
    budgetMax: rfp.budgetMaxCents == null ? "" : String(rfp.budgetMaxCents / 100),
    roomBlockRequired: rfp.roomBlockRequired,
    roomsRequired: rfp.roomsRequired?.toString() ?? "",
    checkInDate: rfp.checkInDate?.slice(0, 10) ?? "",
    checkOutDate: rfp.checkOutDate?.slice(0, 10) ?? "",
    foodBeverageSpend: rfp.foodBeverageSpendCents == null ? "" : String(rfp.foodBeverageSpendCents / 100),
    ancillarySpend: rfp.ancillarySpendCents == null ? "" : String(rfp.ancillarySpendCents / 100),
    ancillarySpendNotes: rfp.ancillarySpendNotes ?? "",
    spaces: rfp.spaceRequirements.map((space) => ({ ...space, date: space.date?.slice(0, 10) ?? "", capacity: space.capacity?.toString() ?? "" })) as SpaceDraft[],
  }));
  const setField = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setSpace = (id: string, patch: Partial<SpaceDraft>) => setDraft((current) => ({
    ...current,
    spaces: current.spaces.map((space) => space.id === id ? { ...space, ...patch } : space),
  }));
  const hotelSpaceNames = new Set(draft.spaces.map((space) => space.purpose.trim().toLowerCase()));
  const completeCore = Boolean(draft.title.trim() && draft.eventDate && draft.startTime && draft.endTime && draft.headcount && draft.city.trim() && draft.location.trim());
  const completeHotel = !draft.roomBlockRequired || Boolean(
    draft.roomsRequired && draft.checkInDate && draft.checkOutDate > draft.checkInDate && draft.foodBeverageSpend.trim()
      && draft.ancillarySpend.trim() && REQUIRED_HOTEL_SPACE_NAMES.every((name) => hotelSpaceNames.has(name)),
  );

  return (
    <form className="space-y-4 border-b border-hairline bg-surface-sunken/45 p-5" onSubmit={(formEvent) => {
      formEvent.preventDefault();
      update.mutate({
        eventId,
        id: rfp.id,
        patch: {
          title: draft.title.trim(),
          targetType: draft.roomBlockRequired ? "venue" : rfp.targetType,
          vendorCategory: draft.roomBlockRequired ? "Venue" : rfp.vendorCategory,
          eventType: draft.eventType as RfpWithResponses["eventType"],
          eventDate: isoDay(draft.eventDate),
          startTime: draft.startTime,
          endTime: draft.endTime,
          headcount: Number.parseInt(draft.headcount, 10),
          city: draft.city.trim(),
          location: draft.location.trim(),
          description: draft.description.trim() || null,
          requirements: draft.requirements.trim() || null,
          deadline: draft.deadline ? `${draft.deadline}T23:59:00.000Z` : null,
          budgetMinCents: centsFromInput(draft.budgetMin),
          budgetMaxCents: centsFromInput(draft.budgetMax),
          roomBlockRequired: draft.roomBlockRequired,
          roomsRequired: draft.roomBlockRequired ? Number.parseInt(draft.roomsRequired, 10) : null,
          checkInDate: draft.roomBlockRequired ? isoDay(draft.checkInDate) : null,
          checkOutDate: draft.roomBlockRequired ? isoDay(draft.checkOutDate) : null,
          foodBeverageSpendCents: draft.roomBlockRequired ? centsFromInput(draft.foodBeverageSpend) : null,
          ancillarySpendCents: draft.roomBlockRequired ? centsFromInput(draft.ancillarySpend) : null,
          ancillarySpendNotes: draft.roomBlockRequired ? draft.ancillarySpendNotes.trim() || null : null,
          spaceRequirements: draft.spaces.filter((space) => space.purpose.trim()).map((space) => ({
            ...space, purpose: space.purpose.trim(), date: isoDay(space.date), capacity: space.capacity ? Number.parseInt(space.capacity, 10) : null, notes: space.notes?.trim() || null,
          })),
        },
      }, {
        onSuccess: () => { toast({ title: "RFP updated" }); onDone(); },
        onError: (error) => toast({ title: "Couldn't update RFP", description: error.message }),
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 lg:col-span-2"><Label htmlFor={`edit-rfp-title-${rfp.id}`}>Title</Label><Input id={`edit-rfp-title-${rfp.id}`} value={draft.title} onChange={(e) => setField("title", e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-type-${rfp.id}`}>Event type</Label><Select value={draft.eventType} onValueChange={(value) => setField("eventType", value)}><SelectTrigger id={`edit-rfp-type-${rfp.id}`}><SelectValue /></SelectTrigger><SelectContent>{RFP_EVENT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-date-${rfp.id}`}>Event date</Label><Input id={`edit-rfp-date-${rfp.id}`} type="date" value={draft.eventDate} onChange={(e) => {
          const next = e.target.value;
          setDraft((current) => ({
            ...current,
            eventDate: next,
            checkInDate: current.roomBlockRequired && (!current.checkInDate || current.checkInDate === current.eventDate) ? next : current.checkInDate,
            checkOutDate: current.roomBlockRequired && (!current.checkOutDate || current.checkOutDate === nextDay(current.eventDate)) ? nextDay(next) : current.checkOutDate,
            spaces: current.roomBlockRequired ? ensureHotelSpaces(current.spaces.map((space) => {
              const previousDefault = space.purpose.toLowerCase() === "registration" ? current.eventDate : nextDay(current.eventDate);
              const nextDefault = space.purpose.toLowerCase() === "registration" ? next : nextDay(next);
              return space.date === previousDefault ? { ...space, date: nextDefault } : space;
            }), next, current.headcount) : current.spaces,
          }));
        }} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-start-${rfp.id}`}>Start</Label><Input id={`edit-rfp-start-${rfp.id}`} type="time" value={draft.startTime} onChange={(e) => setField("startTime", e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-end-${rfp.id}`}>End</Label><Input id={`edit-rfp-end-${rfp.id}`} type="time" value={draft.endTime} onChange={(e) => setField("endTime", e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-headcount-${rfp.id}`}>People</Label><Input id={`edit-rfp-headcount-${rfp.id}`} type="number" min={1} value={draft.headcount} onChange={(e) => {
          const next = e.target.value;
          setDraft((current) => ({
            ...current,
            headcount: next,
            spaces: current.roomBlockRequired ? ensureHotelSpaces(current.spaces.map((space) =>
              !space.capacity || space.capacity === current.headcount ? { ...space, capacity: next } : space,
            ), current.eventDate, next) : current.spaces,
          }));
        }} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-city-${rfp.id}`}>City</Label><Input id={`edit-rfp-city-${rfp.id}`} value={draft.city} onChange={(e) => setField("city", e.target.value)} required /></div>
        <div className="space-y-1 lg:col-span-2"><Label htmlFor={`edit-rfp-location-${rfp.id}`}>Location</Label><Input id={`edit-rfp-location-${rfp.id}`} value={draft.location} onChange={(e) => setField("location", e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-deadline-${rfp.id}`}>Proposal deadline</Label><Input id={`edit-rfp-deadline-${rfp.id}`} type="date" value={draft.deadline} onChange={(e) => setField("deadline", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-budget-min-${rfp.id}`}>Budget from</Label><Input id={`edit-rfp-budget-min-${rfp.id}`} value={draft.budgetMin} onChange={(e) => setField("budgetMin", e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-budget-max-${rfp.id}`}>Budget to</Label><Input id={`edit-rfp-budget-max-${rfp.id}`} value={draft.budgetMax} onChange={(e) => setField("budgetMax", e.target.value)} inputMode="decimal" /></div>
      </div>
      <div className="flex items-center gap-2"><Checkbox id={`edit-rfp-hotel-${rfp.id}`} checked={draft.roomBlockRequired} onCheckedChange={(checked) => {
        const enabled = checked === true;
        setDraft((current) => ({
          ...current,
          roomBlockRequired: enabled,
          eventType: enabled && current.eventType === "Other" ? "Conference with room block" : current.eventType,
          checkInDate: enabled ? current.checkInDate || current.eventDate : current.checkInDate,
          checkOutDate: enabled ? current.checkOutDate || nextDay(current.eventDate) : current.checkOutDate,
          spaces: enabled ? ensureHotelSpaces(current.spaces, current.eventDate, current.headcount) : current.spaces,
        }));
      }} /><Label htmlFor={`edit-rfp-hotel-${rfp.id}`}>Hotel rooms are required</Label></div>
      {draft.roomBlockRequired ? <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1"><Label htmlFor={`edit-rfp-rooms-${rfp.id}`}>Rooms</Label><Input id={`edit-rfp-rooms-${rfp.id}`} type="number" min={1} value={draft.roomsRequired} onChange={(e) => setField("roomsRequired", e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor={`edit-rfp-in-${rfp.id}`}>Check-in</Label><Input id={`edit-rfp-in-${rfp.id}`} type="date" value={draft.checkInDate} onChange={(e) => setField("checkInDate", e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor={`edit-rfp-out-${rfp.id}`}>Check-out</Label><Input id={`edit-rfp-out-${rfp.id}`} type="date" min={nextDay(draft.checkInDate) || undefined} value={draft.checkOutDate} onChange={(e) => setField("checkOutDate", e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor={`edit-rfp-fb-${rfp.id}`}>Food & beverage</Label><Input id={`edit-rfp-fb-${rfp.id}`} value={draft.foodBeverageSpend} onChange={(e) => setField("foodBeverageSpend", e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor={`edit-rfp-other-${rfp.id}`}>Other spend</Label><Input id={`edit-rfp-other-${rfp.id}`} value={draft.ancillarySpend} onChange={(e) => setField("ancillarySpend", e.target.value)} required /></div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Function spaces</p><Button type="button" size="sm" variant="outline" onClick={() => setDraft((current) => ({ ...current, spaces: [...current.spaces, { id: crypto.randomUUID(), purpose: "", date: current.eventDate, startTime: null, endTime: null, capacity: current.headcount, notes: null }] }))}><Plus className="mr-1 size-3" />Add</Button></div>
          {draft.spaces.map((space, index) => <div key={space.id} className="grid gap-2 rounded-lg border border-hairline bg-background p-3 sm:grid-cols-6">
            <Input aria-label={`Space ${index + 1} purpose`} value={space.purpose} onChange={(e) => setSpace(space.id, { purpose: e.target.value })} required />
            <Input aria-label={`Space ${index + 1} date`} type="date" value={space.date} onChange={(e) => setSpace(space.id, { date: e.target.value })} required />
            <Input aria-label={`Space ${index + 1} start`} type="time" value={space.startTime ?? ""} onChange={(e) => setSpace(space.id, { startTime: e.target.value || null })} required />
            <Input aria-label={`Space ${index + 1} end`} type="time" value={space.endTime ?? ""} onChange={(e) => setSpace(space.id, { endTime: e.target.value || null })} required />
            <Input aria-label={`Space ${index + 1} people`} type="number" min={1} value={space.capacity} onChange={(e) => setSpace(space.id, { capacity: e.target.value })} required />
            <Button type="button" variant="ghost" onClick={() => setDraft((current) => ({ ...current, spaces: current.spaces.filter((item) => item.id !== space.id) }))}><Trash2 className="mr-1 size-3" />Remove</Button>
            <Input className="sm:col-span-6" aria-label={`Space ${index + 1} notes`} value={space.notes ?? ""} onChange={(e) => setSpace(space.id, { notes: e.target.value || null })} placeholder="Setup and notes" />
          </div>)}
        </div>
        <div className="space-y-1"><Label htmlFor={`edit-rfp-spend-notes-${rfp.id}`}>Ancillary spend details</Label><Textarea id={`edit-rfp-spend-notes-${rfp.id}`} value={draft.ancillarySpendNotes} onChange={(e) => setField("ancillarySpendNotes", e.target.value)} rows={2} /></div>
      </> : null}
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor={`edit-rfp-description-${rfp.id}`}>Description</Label><Textarea id={`edit-rfp-description-${rfp.id}`} value={draft.description} onChange={(e) => setField("description", e.target.value)} rows={3} /></div><div className="space-y-1"><Label htmlFor={`edit-rfp-requirements-${rfp.id}`}>Requirements</Label><Textarea id={`edit-rfp-requirements-${rfp.id}`} value={draft.requirements} onChange={(e) => setField("requirements", e.target.value)} rows={3} /></div></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button><Button type="submit" disabled={!completeCore || !completeHotel || update.isPending}>Save RFP</Button></div>
    </form>
  );
}

function RfpCard({ eventId, rfp }: { eventId: string; rfp: RfpWithResponses }) {
  const formatDate = (value: string, style: "dayMonthYear") => formatInZone(value, "UTC", style);
  const update = useUpdateRfp();
  const remove = useRemoveRfp();
  const range = budgetRange(rfp);
  const [editing, setEditing] = useState(false);

  return (
    <Panel>
      <PanelHeader
        title={rfp.title}
        description={[
          rfp.targetType === "venue" ? "Venue" : "Vendor",
          rfp.vendorCategory,
          rfp.eventType,
          range,
          rfp.headcount ? `${rfp.headcount} guests` : null,
          rfp.deadline ? `replies by ${formatDate(rfp.deadline, "dayMonthYear")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Pill tone={RFP_TONE[rfp.status]}>{rfp.status}</Pill>
            <Button size="sm" variant="outline" onClick={() => setEditing((current) => !current)}><Pencil className="mr-1.5 size-3.5" />{editing ? "Cancel edit" : "Edit RFP"}</Button>
            {(
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update.mutate(
                    { eventId, id: rfp.id, patch: { status: rfp.status === "closed" ? "draft" : "closed" } },
                    {
                      onSuccess: () => toast({ title: rfp.status === "closed" ? "RFP reopened" : "RFP closed" }),
                      onError: (error) => toast({ title: "Couldn't update RFP", description: error.message }),
                    },
                  )
                }
              >
                {rfp.status === "closed" ? "Reopen RFP" : "Close RFP"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${rfp.title}`}
              onClick={() =>
                remove.mutate(
                  { eventId, id: rfp.id },
                  {
                    onSuccess: () => toast({ title: "RFP deleted" }),
                    onError: (error) => toast({ title: "Couldn't delete RFP", description: error.message }),
                  },
                )
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        }
      />

      {editing ? <EditRfpForm eventId={eventId} rfp={rfp} onDone={() => setEditing(false)} /> : null}

      {rfp.description || rfp.requirements ? (
        <div className="space-y-1.5 border-b border-hairline px-5 py-3 text-sm">
          {rfp.description ? <p className="text-foreground">{rfp.description}</p> : null}
          {rfp.requirements ? <p className="text-muted-foreground">{rfp.requirements}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 border-b border-hairline px-5 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs font-semibold text-muted-foreground">Date</p><p>{rfp.eventDate ? formatDate(rfp.eventDate, "dayMonthYear") : "Not set"}</p></div>
        <div><p className="text-xs font-semibold text-muted-foreground">Time</p><p>{rfp.startTime ? `${rfp.startTime}${rfp.endTime ? ` - ${rfp.endTime}` : ""}` : "Not set"}</p></div>
        <div><p className="text-xs font-semibold text-muted-foreground">City</p><p>{rfp.city ?? "Not set"}</p></div>
        <div><p className="text-xs font-semibold text-muted-foreground">Location</p><p>{rfp.location ?? "Not set"}</p></div>
      </div>

      {rfp.roomBlockRequired ? (
        <div className="space-y-4 border-b border-hairline bg-surface-sunken/45 px-5 py-4">
          <div className="flex items-center gap-2">
            <BedDouble className="size-4 text-primary-text" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Hotel room block</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs font-semibold text-muted-foreground">Guest rooms</dt><dd>{rfp.roomsRequired ?? "Not set"}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Check-in</dt><dd>{rfp.checkInDate ? formatDate(rfp.checkInDate, "dayMonthYear") : "Not set"}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Check-out</dt><dd>{rfp.checkOutDate ? formatDate(rfp.checkOutDate, "dayMonthYear") : "Not set"}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Food & beverage spend</dt><dd>{rfp.foodBeverageSpendCents == null ? "Not set" : formatMoney(rfp.foodBeverageSpendCents)}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">Other property spend</dt><dd>{rfp.ancillarySpendCents == null ? "Not set" : formatMoney(rfp.ancillarySpendCents)}</dd></div>
          </dl>
          {rfp.ancillarySpendNotes ? <p className="text-sm text-muted-foreground">{rfp.ancillarySpendNotes}</p> : null}
        </div>
      ) : null}

      {rfp.spaceRequirements.length > 0 ? (
        <div className="border-b border-hairline px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Required function spaces</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {rfp.spaceRequirements.map((space) => (
              <li key={space.id} className="rounded-lg border border-hairline p-3 text-sm">
                <p className="font-semibold text-foreground">{space.purpose}</p>
                <p className="mt-1 text-muted-foreground">
                  {[space.date ? formatDate(space.date, "dayMonthYear") : null, space.startTime ? `${space.startTime}${space.endTime ? ` - ${space.endTime}` : ""}` : null, space.capacity ? `${space.capacity} people` : null].filter(Boolean).join(" · ")}
                </p>
                {space.notes ? <p className="mt-1 text-muted-foreground">{space.notes}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <InviteVendor eventId={eventId} rfp={rfp} />

      {rfp.responses.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No replies yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rfp.responses.map((response) => (
            <ResponseRow key={response.id} eventId={eventId} rfpId={rfp.id} response={response} />
          ))}
        </ul>
      )}

      <AddResponse eventId={eventId} rfpId={rfp.id} />
    </Panel>
  );
}

function NewRfp({ event }: { event: Event }) {
  const add = useAddRfp();
  const { timeZone } = usePreferences();
  const initialEventType = (RFP_EVENT_TYPES as readonly string[]).includes(event.category) ? event.category : "Other";
  const [title, setTitle] = useState("");
  const [targetType, setTargetType] = useState<(typeof RFP_TARGET_TYPES)[number]>("vendor");
  const [category, setCategory] = useState<string>("Catering");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState(initialEventType);
  const [eventDate, setEventDate] = useState(new Date(event.date).toLocaleDateString("en-CA", { timeZone }));
  const [startTime, setStartTime] = useState(new Date(event.date).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }));
  const [endTime, setEndTime] = useState(event.endDate ? new Date(event.endDate).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) : "");
  const [city, setCity] = useState(event.locationRecord?.city ?? "");
  const [location, setLocation] = useState(event.locationRecord?.name ?? event.location ?? "");
  const [headcount, setHeadcount] = useState(event.capacity?.toString() ?? "");
  const [deadline, setDeadline] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [roomBlockRequired, setRoomBlockRequired] = useState(false);
  const [roomsRequired, setRoomsRequired] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [spaces, setSpaces] = useState<SpaceDraft[]>([]);
  const [foodBeverageSpend, setFoodBeverageSpend] = useState("");
  const [ancillarySpend, setAncillarySpend] = useState("");
  const [ancillarySpendNotes, setAncillarySpendNotes] = useState("");
  const [requirements, setRequirements] = useState("");
  const checkOutIsAfterCheckIn = Boolean(checkInDate && checkOutDate && checkOutDate > checkInDate);
  const hotelSpaceNames = new Set(spaces.map((space) => space.purpose.trim().toLowerCase()));
  const hasRequiredHotelSpaces = REQUIRED_HOTEL_SPACE_NAMES.every((name) => hotelSpaceNames.has(name));
  const completeCoreDetails = Boolean(title.trim() && eventDate && startTime && endTime && headcount && city.trim() && location.trim());
  const completeHotelDetails = !roomBlockRequired || Boolean(
    roomsRequired && checkOutIsAfterCheckIn && foodBeverageSpend.trim() && ancillarySpend.trim() && hasRequiredHotelSpaces,
  );
  const updateSpace = (id: string, patch: Partial<SpaceDraft>) => {
    setSpaces((current) => current.map((space) => space.id === id ? { ...space, ...patch } : space));
  };

  return (
    <Panel>
      <PanelHeader title="New RFP" description="Put one brief out to a category and collect the quotes here" />
      <form
        className="space-y-4 p-5"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          add.mutate(
            {
              eventId: event.id,
              draft: {
                title: trimmed,
                targetType,
                vendorCategory: category,
                description: description.trim() || null,
                eventType,
                eventDate: eventDate ? `${eventDate}T12:00:00.000Z` : null,
                startTime: startTime || null,
                endTime: endTime || null,
                city: city.trim() || null,
                location: location.trim() || null,
                budgetMinCents: centsFromInput(budgetMin),
                budgetMaxCents: centsFromInput(budgetMax),
                headcount: headcount ? Number.parseInt(headcount, 10) : null,
                roomBlockRequired,
                roomsRequired: roomBlockRequired && roomsRequired ? Number.parseInt(roomsRequired, 10) : null,
                checkInDate: roomBlockRequired ? isoDay(checkInDate) : null,
                checkOutDate: roomBlockRequired ? isoDay(checkOutDate) : null,
                spaceRequirements: spaces.filter((space) => space.purpose.trim()).map((space) => ({
                  ...space,
                  purpose: space.purpose.trim(),
                  date: isoDay(space.date),
                  capacity: space.capacity ? Number.parseInt(space.capacity, 10) : null,
                  notes: space.notes?.trim() || null,
                })),
                foodBeverageSpendCents: centsFromInput(foodBeverageSpend),
                ancillarySpendCents: centsFromInput(ancillarySpend),
                ancillarySpendNotes: ancillarySpendNotes.trim() || null,
                deadline: deadline ? `${deadline}T23:59:00.000Z` : null,
                requirements: requirements.trim() || null,
              },
            },
            {
              onSuccess: () => {
                setTitle("");
                setDescription("");
                setBudgetMin("");
                setBudgetMax("");
                setRoomBlockRequired(false);
                setRoomsRequired("");
                setCheckInDate("");
                setCheckOutDate("");
                setSpaces([]);
                setFoodBeverageSpend("");
                setAncillarySpend("");
                setAncillarySpendNotes("");
                setRequirements("");
                toast({ title: "RFP created", description: "It starts as a draft." });
              },
              onError: (error) => toast({ title: "Couldn't create RFP", description: error.message }),
            },
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rfp-title">Title</Label>
            <Input
              id="rfp-title"
              value={title}
              onChange={(inputEvent) => setTitle(inputEvent.target.value)}
              placeholder="Plated dinner service for 300"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-target">Requesting proposals from</Label>
            <Select value={targetType} onValueChange={(value) => setTargetType(value as (typeof RFP_TARGET_TYPES)[number])}>
              <SelectTrigger id="rfp-target"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="venue">Venues</SelectItem><SelectItem value="vendor">Vendors</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="rfp-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-event-type">Event type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id="rfp-event-type"><SelectValue /></SelectTrigger>
              <SelectContent>{RFP_EVENT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-event-date">Event date</Label>
            <Input id="rfp-event-date" type="date" value={eventDate} required onChange={(inputEvent) => {
              const next = inputEvent.target.value;
              const previous = eventDate;
              setEventDate(next);
              if (roomBlockRequired) {
                setCheckInDate((current) => !current || current === previous ? next : current);
                setCheckOutDate((current) => !current || current === nextDay(previous) ? nextDay(next) : current);
                setSpaces((current) => ensureHotelSpaces(current.map((space) => {
                  const previousDefault = space.purpose.toLowerCase() === "registration" ? previous : nextDay(previous);
                  const nextDefault = space.purpose.toLowerCase() === "registration" ? next : nextDay(next);
                  return space.date === previousDefault ? { ...space, date: nextDefault } : space;
                }), next, headcount));
              }
            }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-start-time">Start time</Label>
            <Input id="rfp-start-time" type="time" value={startTime} onChange={(inputEvent) => setStartTime(inputEvent.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-end-time">End time</Label>
            <Input id="rfp-end-time" type="time" value={endTime} onChange={(inputEvent) => setEndTime(inputEvent.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-city">City</Label>
            <Input id="rfp-city" value={city} onChange={(inputEvent) => setCity(inputEvent.target.value)} placeholder="Santa Clara" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-location">Location or venue area</Label>
            <Input id="rfp-location" value={location} onChange={(inputEvent) => setLocation(inputEvent.target.value)} placeholder="Mission Gardens or downtown" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-deadline">Proposal deadline</Label>
            <Input id="rfp-deadline" type="date" value={deadline} onChange={(inputEvent) => setDeadline(inputEvent.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-headcount">Headcount</Label>
            <Input id="rfp-headcount" type="number" min={1} value={headcount} required onChange={(inputEvent) => {
              const next = inputEvent.target.value;
              const previous = headcount;
              setHeadcount(next);
              if (roomBlockRequired) {
                setSpaces((current) => ensureHotelSpaces(current.map((space) =>
                  !space.capacity || space.capacity === previous ? { ...space, capacity: next } : space,
                ), eventDate, next));
              }
            }} placeholder="300" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-budget-min">Budget from</Label>
            <Input
              id="rfp-budget-min"
              value={budgetMin}
              onChange={(inputEvent) => setBudgetMin(inputEvent.target.value)}
              placeholder="24,000"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-budget-max">Budget to</Label>
            <Input
              id="rfp-budget-max"
              value={budgetMax}
              onChange={(inputEvent) => setBudgetMax(inputEvent.target.value)}
              placeholder="32,000"
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-surface-sunken/45 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="rfp-room-block"
              checked={roomBlockRequired}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setRoomBlockRequired(enabled);
                if (enabled) {
                  setTargetType("venue");
                  setCategory("Venue");
                  setEventType("Conference with room block");
                  setCheckInDate((current) => current || eventDate);
                  setCheckOutDate((current) => current || nextDay(eventDate));
                  setSpaces((current) => ensureHotelSpaces(current, eventDate, headcount));
                }
              }}
            />
            <div>
              <Label htmlFor="rfp-room-block" className="cursor-pointer font-semibold">Hotel rooms are required</Label>
              <p className="mt-1 text-xs text-muted-foreground">Keep room count separate from guest headcount and tell the property how long space is needed.</p>
            </div>
          </div>

          {roomBlockRequired ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="rfp-rooms">Rooms required</Label><Input id="rfp-rooms" type="number" min={1} value={roomsRequired} onChange={(e) => setRoomsRequired(e.target.value)} placeholder="100" required /></div>
              <div className="space-y-1.5"><Label htmlFor="rfp-check-in">Check-in date</Label><Input id="rfp-check-in" type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="rfp-check-out">Check-out date</Label><Input id="rfp-check-out" type="date" min={nextDay(checkInDate) || undefined} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} required />{checkInDate && checkOutDate && !checkOutIsAfterCheckIn ? <p className="text-xs text-danger-text">Check-out must be after check-in.</p> : null}</div>
              <div className="space-y-1.5"><Label htmlFor="rfp-fb-spend">Expected food & beverage spend</Label><Input id="rfp-fb-spend" value={foodBeverageSpend} onChange={(e) => setFoodBeverageSpend(e.target.value)} inputMode="decimal" placeholder="35,000" required /></div>
              <div className="space-y-1.5"><Label htmlFor="rfp-ancillary-spend">Other property spend</Label><Input id="rfp-ancillary-spend" value={ancillarySpend} onChange={(e) => setAncillarySpend(e.target.value)} inputMode="decimal" placeholder="10,000 or 0" required /></div>
              <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="rfp-ancillary-notes">Ancillary spend details</Label><Textarea id="rfp-ancillary-notes" value={ancillarySpendNotes} onChange={(e) => setAncillarySpendNotes(e.target.value)} rows={2} placeholder="Parking, AV, Wi-Fi, spa, resort fees, upgrades or other spend expected on property…" /></div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-hairline p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-foreground">Function spaces and meal periods</p><p className="text-xs text-muted-foreground">Add registration, breakfast, meeting, lunch, dinner or any other space the venue must hold.</p></div>
            <Button type="button" size="sm" variant="outline" onClick={() => setSpaces((current) => [...current, { id: crypto.randomUUID(), purpose: "", date: eventDate, startTime: null, endTime: null, capacity: headcount, notes: null }])}><Plus className="mr-1.5 size-3.5" />Add space</Button>
          </div>
          {spaces.length === 0 ? <p className="rounded-lg bg-surface-sunken p-3 text-sm text-muted-foreground">No function spaces added yet.</p> : (
            <div className="space-y-3">
              {spaces.map((space, index) => (
                <div key={space.id} className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-1 lg:col-span-2"><Label htmlFor={`rfp-space-purpose-${space.id}`}>Space {index + 1}</Label><Input id={`rfp-space-purpose-${space.id}`} value={space.purpose} onChange={(e) => updateSpace(space.id, { purpose: e.target.value })} placeholder="Registration, breakfast, meeting…" required={roomBlockRequired} /></div>
                  <div className="space-y-1"><Label htmlFor={`rfp-space-date-${space.id}`}>Date</Label><Input id={`rfp-space-date-${space.id}`} type="date" value={space.date} onChange={(e) => updateSpace(space.id, { date: e.target.value })} required={roomBlockRequired} /></div>
                  <div className="space-y-1"><Label htmlFor={`rfp-space-start-${space.id}`}>Start</Label><Input id={`rfp-space-start-${space.id}`} type="time" value={space.startTime ?? ""} onChange={(e) => updateSpace(space.id, { startTime: e.target.value || null })} required={roomBlockRequired} /></div>
                  <div className="space-y-1"><Label htmlFor={`rfp-space-end-${space.id}`}>End</Label><Input id={`rfp-space-end-${space.id}`} type="time" value={space.endTime ?? ""} onChange={(e) => updateSpace(space.id, { endTime: e.target.value || null })} required={roomBlockRequired} /></div>
                  <div className="flex items-end gap-1"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`rfp-space-capacity-${space.id}`}>People</Label><Input id={`rfp-space-capacity-${space.id}`} type="number" min={1} value={space.capacity} onChange={(e) => updateSpace(space.id, { capacity: e.target.value })} required={roomBlockRequired} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${space.purpose || `space ${index + 1}`}`} onClick={() => setSpaces((current) => current.filter((item) => item.id !== space.id))}><Trash2 className="size-4" /></Button></div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-6"><Label htmlFor={`rfp-space-notes-${space.id}`}>Setup and notes</Label><Input id={`rfp-space-notes-${space.id}`} value={space.notes ?? ""} onChange={(e) => updateSpace(space.id, { notes: e.target.value || null })} placeholder="Classroom setup, AV, adjacent foyer, overnight hold…" /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rfp-description">Description</Label>
          <Textarea id="rfp-description" value={description} onChange={(inputEvent) => setDescription(inputEvent.target.value)} placeholder="Describe the event, the guest experience and the scope you need proposed." rows={4} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rfp-requirements">Requirements</Label>
          <Textarea
            id="rfp-requirements"
            value={requirements}
            onChange={(inputEvent) => setRequirements(inputEvent.target.value)}
            placeholder="Dietary tracking, two bars, load-in from 2pm…"
            rows={2}
          />
        </div>

        <div className="flex justify-end border-t border-hairline pt-4">
          <Button type="submit" disabled={!completeCoreDetails || !completeHotelDetails || add.isPending}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Create RFP
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export default function RfpPanel({ event }: { event: Event }) {
  const { data: rfps, isLoading, isError, error, refetch } = useRfps(event.id);

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : (rfps?.length ?? 0) === 0 ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title="No RFPs yet"
            description="Write one brief, send it to a category of vendors, and keep every quote against it."
          />
        </Panel>
      ) : (
        rfps?.map((rfp) => <RfpCard key={rfp.id} eventId={event.id} rfp={rfp} />)
      )}

      <NewRfp event={event} />
    </div>
  );
}
