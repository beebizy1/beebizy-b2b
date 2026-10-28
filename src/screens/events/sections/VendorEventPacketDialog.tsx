import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, FileText, LayoutGrid, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/primitives";
import { useEventHistory, useFloorplans, useRunOfShow, useSendVendorEventPacket } from "@/data/hooks";
import type { Event, EventVendor } from "@/data/entities";
import { defaultVendorPacketMessage, defaultVendorPacketSubject, isVendorPacketEmail, vendorPacketContentKey, type VendorEventPacketResult } from "@/data/vendorEventPackets";
import { usePreferences } from "@/app/preferences";
import { toast } from "@/hooks/use-toast";

export default function VendorEventPacketDialog({ event, bookings }: { event: Event; bookings: EventVendor[] }) {
  const { data: cues } = useRunOfShow(event.id);
  const { data: floorplans } = useFloorplans(event.id);
  const { data: history } = useEventHistory(event.id);
  const sendPacket = useSendVendorEventPacket();
  const { when } = usePreferences(event.timeZone);
  const [open, setOpen] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [includeRunOfShow, setIncludeRunOfShow] = useState(true);
  const [selectedFloorplanIds, setSelectedFloorplanIds] = useState<string[]>([]);
  const [subject, setSubject] = useState(() => defaultVendorPacketSubject(event.title));
  const [message, setMessage] = useState(() => defaultVendorPacketMessage(event.title));
  const [testEmail, setTestEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [lastResult, setLastResult] = useState<VendorEventPacketResult | null>(null);
  const [successfulTestKey, setSuccessfulTestKey] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID());

  const eligible = useMemo(() => bookings.filter((booking) => booking.status !== "cancelled" && isVendorPacketEmail(booking.vendor?.contactEmail)), [bookings]);
  const missingEmail = useMemo(() => bookings.filter((booking) => booking.status !== "cancelled" && !isVendorPacketEmail(booking.vendor?.contactEmail)), [bookings]);
  const deliveries = useMemo(() => (history ?? []).filter((entry) => entry.resource === "vendor-packet" && entry.after?.test !== true).slice(0, 20), [history]);
  const currentContentKey = useMemo(() => JSON.stringify({
    content: vendorPacketContentKey({ subject, message, includeRunOfShow, floorplanIds: selectedFloorplanIds }),
    event: { title: event.title, date: event.date, endDate: event.endDate, location: event.locationRecord?.name ?? event.location },
    cues: [...(cues ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    plans: [...(floorplans ?? [])].filter((plan) => selectedFloorplanIds.includes(plan.id)).sort((a, b) => a.id.localeCompare(b.id)),
  }), [cues, event.date, event.endDate, event.location, event.locationRecord?.name, event.title, floorplans, includeRunOfShow, message, selectedFloorplanIds, subject]);
  const testIsCurrent = successfulTestKey === currentContentKey;

  useEffect(() => {
    setSubject(defaultVendorPacketSubject(event.title));
    setMessage(defaultVendorPacketMessage(event.title));
  }, [event.id, event.title]);

  useEffect(() => {
    setConfirmed(false);
  }, [includeRunOfShow, message, selectedFloorplanIds, selectedVendorIds, subject]);

  const initialize = () => {
    setSelectedVendorIds(eligible.map((booking) => booking.vendorId));
    setSelectedFloorplanIds((floorplans ?? []).map((plan) => plan.id));
    setIncludeRunOfShow((cues?.length ?? 0) > 0);
    setConfirmed(false);
    setLastResult(null);
    setSuccessfulTestKey(null);
  };

  const setDialogOpen = (next: boolean) => {
    if (next) initialize();
    setOpen(next);
  };

  const toggleVendor = (vendorId: string) => {
    setSelectedVendorIds((current) => current.includes(vendorId) ? current.filter((id) => id !== vendorId) : [...current, vendorId]);
  };

  const toggleFloorplan = (floorplanId: string) => {
    setSelectedFloorplanIds((current) => current.includes(floorplanId) ? current.filter((id) => id !== floorplanId) : [...current, floorplanId]);
  };

  const deliver = async (testOnly: boolean) => {
    const email = testEmail.trim();
    if (testOnly && !isVendorPacketEmail(email)) {
      toast({ title: "Enter a valid test email" });
      return;
    }
    try {
      const result = await sendPacket.mutateAsync({
        eventId: event.id,
        draft: {
          vendorIds: testOnly ? [] : selectedVendorIds,
          subject: subject.trim(),
          message: message.trim(),
          includeRunOfShow,
          floorplanIds: selectedFloorplanIds,
          requestId: requestId.current,
          testEmail: testOnly ? email : null,
          consentConfirmed: testOnly ? false : confirmed,
        },
      });
      setLastResult(result);
      if (testOnly && result.sent > 0) setSuccessfulTestKey(currentContentKey);
      if (!testOnly && result.failed === 0) {
        requestId.current = crypto.randomUUID();
        setSuccessfulTestKey(null);
      }
      toast({
        title: testOnly ? (result.sent ? "Test packet sent" : "Test packet was not delivered") : `${result.sent} vendor email${result.sent === 1 ? "" : "s"} sent`,
        description: result.failed || result.skipped ? `${result.failed} failed and ${result.skipped} skipped. Review the delivery details.` : `${result.attachmentNames.length} PDF attachment${result.attachmentNames.length === 1 ? "" : "s"} included.`,
      });
    } catch (error) {
      toast({ title: testOnly ? "Couldn't send the test" : "Couldn't send the vendor update", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const sendToVendors = () => {
    if (!window.confirm(`Send this event packet as ${selectedVendorIds.length} private email${selectedVendorIds.length === 1 ? "" : "s"}?`)) return;
    void deliver(false);
  };

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm"><Mail className="mr-1.5 size-4" />Email event details</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email vendors</DialogTitle>
          <DialogDescription>Review recipients and documents, send yourself a test, then deliver one private email to each vendor.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">1. Choose vendors</h3><p className="text-xs text-muted-foreground">Email addresses stay private. Vendors never see the other recipients.</p></div><Pill tone={selectedVendorIds.length ? "success" : "warning"}>{selectedVendorIds.length} selected</Pill></div>
            <div className="max-h-56 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
              {eligible.map((booking) => <label key={booking.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-sunken"><input className="mt-1 size-4 accent-[hsl(var(--primary))]" type="checkbox" checked={selectedVendorIds.includes(booking.vendorId)} onChange={() => toggleVendor(booking.vendorId)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{booking.vendor?.name}</span><span className="block truncate text-xs text-muted-foreground">{booking.vendor?.contactEmail}</span></span><Pill className="ml-auto">{booking.status}</Pill></label>)}
              {eligible.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Add a contact email to at least one active event vendor first.</p> : null}
            </div>
            {missingEmail.length ? <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning-tint p-3 text-xs text-warning-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{missingEmail.map((booking) => booking.vendor?.name ?? "Removed vendor").join(", ")} will not receive this because no valid contact email is saved.</span></div> : null}
          </section>

          <section className="space-y-3">
            <div><h3 className="text-sm font-semibold">2. Choose attachments</h3><p className="text-xs text-muted-foreground">PDFs are generated from the latest saved event data at send time.</p></div>
            <label className="flex items-start gap-3 rounded-lg border border-hairline p-3"><input className="mt-1 size-4 accent-[hsl(var(--primary))]" type="checkbox" checked={includeRunOfShow} disabled={!cues?.length} onChange={(inputEvent) => setIncludeRunOfShow(inputEvent.target.checked)} /><FileText className="mt-0.5 size-4" /><span><span className="block text-sm font-medium">Run of show PDF</span><span data-numeric className="block text-xs text-muted-foreground">{cues?.length ?? 0} cue{cues?.length === 1 ? "" : "s"}</span></span></label>
            <div className="rounded-lg border border-hairline">
              <div className="flex items-center gap-2 border-b border-hairline px-3 py-2"><LayoutGrid className="size-4" /><span className="text-sm font-medium">Floorplan PDF</span><span className="ml-auto text-xs text-muted-foreground">{selectedFloorplanIds.length} room{selectedFloorplanIds.length === 1 ? "" : "s"}</span></div>
              {(floorplans ?? []).map((plan) => <label key={plan.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-sunken"><input className="size-4 accent-[hsl(var(--primary))]" type="checkbox" checked={selectedFloorplanIds.includes(plan.id)} onChange={() => toggleFloorplan(plan.id)} /><span className="truncate text-sm">{plan.name}</span><span data-numeric className="ml-auto text-xs text-muted-foreground">{plan.items.length} objects</span></label>)}
              {!floorplans?.length ? <p className="px-3 py-2 text-xs text-muted-foreground">No saved floorplans yet.</p> : null}
            </div>
          </section>
        </div>

        <section className="space-y-3 border-t border-hairline pt-4">
          <div><h3 className="text-sm font-semibold">3. Review the email</h3><p className="text-xs text-muted-foreground">Event date, time, and location are added automatically.</p></div>
          <div className="space-y-1.5"><Label htmlFor="vendor-packet-subject">Subject</Label><Input id="vendor-packet-subject" value={subject} maxLength={200} onChange={(inputEvent) => setSubject(inputEvent.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="vendor-packet-message">Message</Label><Textarea id="vendor-packet-message" value={message} maxLength={5000} rows={5} onChange={(inputEvent) => setMessage(inputEvent.target.value)} /></div>
          <div className="flex flex-col gap-2 sm:flex-row"><Input type="email" value={testEmail} onChange={(inputEvent) => setTestEmail(inputEvent.target.value)} placeholder="Your signed-in email for a private test" aria-label="Test email address" /><Button type="button" variant="outline" disabled={sendPacket.isPending || !subject.trim() || !message.trim() || !isVendorPacketEmail(testEmail)} onClick={() => void deliver(true)}><Eye className="mr-1.5 size-4" />Send test</Button></div>
          <p className="text-xs text-muted-foreground">For privacy, the test can only go to the email address on your signed-in Beebizy account.</p>
          <div className={testIsCurrent ? "flex items-center gap-2 rounded-lg border border-success/30 bg-success-tint p-3 text-sm text-success-text" : "flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-tint p-3 text-sm text-warning-text"}>{testIsCurrent ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}<span>{testIsCurrent ? "Test passed for this exact message and attachments." : "Send a successful test before the final vendor delivery."}</span></div>
        </section>

        {lastResult ? <section className="rounded-lg border border-hairline bg-surface-sunken p-3"><div className="flex flex-wrap gap-2"><Pill tone="success">{lastResult.sent} sent</Pill><Pill tone={lastResult.failed ? "danger" : "neutral"}>{lastResult.failed} failed</Pill><Pill tone={lastResult.skipped ? "warning" : "neutral"}>{lastResult.skipped} skipped</Pill></div><ul className="mt-2 space-y-1 text-xs">{lastResult.deliveries.map((delivery) => <li key={`${delivery.vendorId ?? "test"}-${delivery.email}`} className="flex items-center gap-2"><span className="font-medium">{delivery.vendorName}</span><span className="truncate text-muted-foreground">{delivery.email}</span><span className="ml-auto">{delivery.status}</span>{delivery.reason ? <span className="text-danger-text">{delivery.reason}</span> : null}</li>)}</ul></section> : null}

        {deliveries.length ? <section className="space-y-2 border-t border-hairline pt-4"><h3 className="text-sm font-semibold">Recent delivery history</h3><ul className="max-h-44 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">{deliveries.map((entry) => { const after = entry.after ?? {}; const status = after.status === "sent" ? "sent" : "failed"; return <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"><CheckCircle2 className={status === "sent" ? "size-4 text-success-text" : "size-4 text-danger-text"} /><span className="font-medium">{String(after.vendorName ?? "Vendor")}</span><span className="text-muted-foreground">{String(after.email ?? "")}</span><Pill tone={status === "sent" ? "success" : "danger"}>{status}</Pill><span className="ml-auto text-muted-foreground">{when(entry.createdAt)} by {String(after.sentBy ?? entry.actorId)}</span></li>; })}</ul></section> : null}

        <label className="flex items-start gap-2 rounded-lg border border-hairline p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-[hsl(var(--primary))]" checked={confirmed} onChange={(inputEvent) => setConfirmed(inputEvent.target.checked)} /><span>I reviewed the recipient list and confirm these vendors expect operational information about this event.</span></label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" disabled={sendPacket.isPending || !testIsCurrent || !confirmed || selectedVendorIds.length === 0 || !subject.trim() || !message.trim()} onClick={sendToVendors}><Send className="mr-1.5 size-4" />{sendPacket.isPending ? "Sending…" : `Send to ${selectedVendorIds.length} vendor${selectedVendorIds.length === 1 ? "" : "s"}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
