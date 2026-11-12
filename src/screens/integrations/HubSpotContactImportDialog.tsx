import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ContactRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorNotice, LoadingRows, Pill } from "@/components/primitives";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { useAddHubSpotContacts, useHubSpotContacts, useHubSpotStatus } from "@/data/hooks";
import { recoverHubSpotSelection } from "@/data/hubspotContacts";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import { toast } from "@/hooks/use-toast";

function ContactPicker({ eventId, onClose }: { eventId: string; onClose(): void }) {
  const status = useHubSpotStatus(); const add = useAddHubSpotContacts();
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(eventId, "hubspot-selection", { selected: "[]", search: "", cursor: "0", emailOnly: "true" });
  const selected = useMemo(() => new Set(recoverHubSpotSelection(draft.selected)), [draft.selected]);
  const connected = status.data?.state === "connected" || status.data?.state === "error";
  const contacts = useHubSpotContacts({ eventId, search: draft.search || "", cursor: draft.cursor || "0", limit: 50 }, connected);
  const visible = (contacts.data?.contacts ?? []).filter(contact => draft.emailOnly !== "true" || Boolean(contact.email && !contact.emailOptOut));
  const selectable = visible.filter(contact => !contact.alreadyRegistered && !contact.issue && contact.guestId);
  const busy = add.isPending || Boolean(state.remote);
  function choose(ids: string[], checked: boolean) {
    const next = new Set(selected); for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
    if (next.size > 2000) { toast({ title: "Choose up to 2,000 guests at a time" }); return; }
    setDraft(current => ({ ...current, selected: JSON.stringify([...next]) }));
  }
  async function submit() {
    const submitted = { ...draft };
    try {
      const result = await add.mutateAsync({ eventId, contactIds: [...selected] });
      recovery.complete(submitted);
      toast({ title: `${result.added} guest${result.added === 1 ? "" : "s"} added`, description: `Saved as pending. No emails sent. ${result.alreadyOnList ? `${result.alreadyOnList} already on the list.` : "Send invitations when you're ready."}` });
      onClose();
    } catch (error) { toast({ title: "Couldn't add these guests", description: error instanceof Error ? error.message : "Please try again." }); }
  }
  const cursor = Number(draft.cursor || 0);
  return <Dialog open onOpenChange={open => { if (!open && !add.isPending) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
      <DialogHeader><DialogTitle>Add HubSpot guests</DialogTitle><DialogDescription>Choose people for this event. They will be added as pending guests. This does not send email, confirm an RSVP, or check anyone in.</DialogDescription></DialogHeader>
      {!connected ? <div className="space-y-3 py-4"><p>Connect your organization's HubSpot account in Settings first.</p><Button asChild variant="outline"><Link href="/app/settings#hubspot">Open HubSpot settings</Link></Button></div> : <>
        {status.data?.isDemo ? <p className="text-sm text-muted-foreground">Sample contacts only. No real HubSpot account or emails.</p> : null}
        <Input type="search" aria-label="Search HubSpot contacts" placeholder="Search names, email or company" value={draft.search || ""} disabled={busy} onChange={event => setDraft(current => ({ ...current, search: event.target.value, cursor: "0" }))} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.emailOnly === "true"} disabled={busy} onChange={event => setDraft(current => ({ ...current, emailOnly: String(event.target.checked), cursor: "0" }))} />Show contacts with an email who have not unsubscribed</label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{selected.size} selected · {contacts.data?.total ?? 0} contacts in address book</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || !selectable.length} onClick={() => choose(selectable.map(contact => contact.id), true)}>Select this page</Button><Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={() => setDraft(current => ({ ...current, selected: "[]" }))}>Clear selection</Button></div></div>
        <div className="min-h-24 flex-1 overflow-y-auto rounded-lg border border-hairline">
          {contacts.isLoading ? <LoadingRows rows={3} /> : contacts.isError ? <ErrorNotice error={contacts.error} onRetry={() => void contacts.refetch()} className="m-3" /> : visible.length ? visible.map(contact => <label key={contact.id} className="flex cursor-pointer items-start gap-3 border-b border-hairline p-3 last:border-b-0 hover:bg-primary-muted/30">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" aria-label={`Select ${contact.name}`} checked={selected.has(contact.id)} disabled={busy || contact.alreadyRegistered || Boolean(contact.issue) || !contact.guestId} onChange={event => choose([contact.id], event.target.checked)} />
            <span className="min-w-0 flex-1"><span className="block font-medium">{contact.name}</span><span className="block break-words text-sm text-muted-foreground">{[contact.email, contact.company, contact.phone].filter(Boolean).join(" · ") || "No contact details"}</span>{contact.issue ? <span className="block text-xs text-warning-text">{contact.issue}</span> : null}{contact.emailOptOut ? <span className="block text-xs text-warning-text">Unsubscribed. Add for attendance tracking only.</span> : !contact.email ? <span className="block text-xs text-muted-foreground">No email. Add for attendance tracking only.</span> : null}</span>
            {contact.alreadyRegistered ? <Pill tone="neutral">Already on list</Pill> : null}
          </label>) : <p className="p-4 text-sm text-muted-foreground">{!status.data?.inbound?.contacts ? "No contacts imported yet. Turn on contact sync in Settings, then return here." : "No contacts on this page match your filters. Try the next page, another search, or turn off the email filter."}</p>}
        </div>
        <div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={busy || cursor === 0} onClick={() => setDraft(current => ({ ...current, cursor: String(Math.max(0, cursor - 50)) }))}>Previous</Button><span className="text-xs text-muted-foreground">Page {Math.floor(cursor / 50) + 1}</span><Button variant="outline" size="sm" disabled={busy || !contacts.data?.nextCursor} onClick={() => setDraft(current => ({ ...current, cursor: contacts.data!.nextCursor! }))}>Next</Button></div>
      </>}
      <GuestDraftStatus state={state} recovery={recovery} />
      <DialogFooter><Button variant="outline" disabled={add.isPending} onClick={onClose}>Close</Button><Button disabled={!connected || busy || !selected.size} onClick={() => void submit()}>{add.isPending ? "Adding guests…" : `Add ${selected.size || "selected"} guest${selected.size === 1 ? "" : "s"}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default function HubSpotContactImportDialog({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><ContactRound className="size-4" />Add HubSpot guests</Button>{open ? <ContactPicker eventId={eventId} onClose={() => setOpen(false)} /> : null}</>;
}
