import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useData } from "@/data/provider";
import { useEventVendors, useSponsorships } from "@/data/hooks";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import ShareLinkField from "@/components/ShareLinkField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SponsorshipDialog } from "./FundraisingPanel";

export default function BizyPartnerLinks({ eventId, sharingReady }: { eventId: string; sharingReady: boolean }) {
  const adapter = useData(); const cache = useQueryClient();
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(eventId, "bizy-partner-link", { role: "sponsor", resourceId: "", seatLimit: "10", link: "", linkName: "", linkId: "" });
  const vendors = useEventVendors(eventId); const sponsors = useSponsorships(eventId);
  const queryKey = ["bizy-partners", adapter.cacheScope, eventId];
  const partners = useQuery({ queryKey, queryFn: () => adapter.eventOperations.partners(eventId), refetchInterval: 15000 });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [addSponsor, setAddSponsor] = useState(false);
  const sponsor = draft.role === "sponsor";
  const choices = sponsor ? sponsors.data?.map(item => ({ id: item.id, name: item.companyName })) : vendors.data?.map(item => ({ id: item.id, name: item.vendor?.name ?? "Removed vendor" }));
  const lookupError = sponsor ? sponsors.error : vendors.error;
  function change(patch: Record<string, string>) { setMessage(""); setDraft({ ...draft, ...patch, link: "", linkName: "", linkId: "" }); }
  async function create() {
    setBusy(true); setMessage("");
    try {
      const result = await adapter.eventOperations.createPartner(eventId, { role: draft.role as "sponsor" | "vendor", resourceId: draft.resourceId, seatLimit: Number(draft.seatLimit) });
      setDraft({ ...draft, link: location.origin + result.path, linkName: result.name, linkId: result.id }); await cache.invalidateQueries({ queryKey });
      setMessage("Your private link is ready. Copy it below and send it to this person. Creating a link does not send a message.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The private link could not be created. Try again."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage("");
    try { await adapter.eventOperations.revokePartner(eventId, id); await cache.invalidateQueries({ queryKey }); if (id === draft.linkId) setDraft({ ...draft, link: "", linkName: "", linkId: "" }); setMessage("Link closed. It can no longer be used."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The link could not be closed. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-xl border border-hairline p-4 sm:p-5" aria-label="Sponsor and vendor links">
    <h3 className="text-lg font-bold">Give sponsors and vendors their own link</h3>
    <p className="text-sm leading-6 text-muted-foreground">A sponsor adds their guest names and sizes. A vendor adds arrival and service times. Each person sees only their own form. No account or password is needed.</p>
    <GuestDraftStatus state={{ ...state, message: state.message.replace("guest details", "link settings").replace("guest draft", "link draft").replace("Submit to apply these details.", draft.link ? "" : "Choose Create private link when you are ready.") }} recovery={recovery} />
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold">1. Who is the link for?<select className="block h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" value={draft.role} onChange={e => change({ role: e.target.value, resourceId: "" })}><option value="sponsor">A sponsor</option><option value="vendor">A vendor</option></select></label>
        <label className="space-y-2 text-sm font-semibold">2. Choose their name<select className="block h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" value={draft.resourceId} onChange={e => change({ resourceId: e.target.value })}><option value="">{choices ? `Choose a ${sponsor ? "sponsor" : "vendor"}` : "Loading names…"}</option>{choices?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {lookupError ? <p role="alert" className="text-sm">Names could not load. <Button size="sm" variant="outline" onClick={() => void (sponsor ? sponsors.refetch() : vendors.refetch())}>Try again</Button></p> : null}
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Name missing?</span>{sponsor ? <Button variant="outline" size="sm" onClick={() => setAddSponsor(true)}>Add a sponsor</Button> : <Button asChild variant="outline" size="sm"><Link href={`/app/vendors/new?eventId=${encodeURIComponent(eventId)}&returnTo=${encodeURIComponent(`/app/events/${eventId}/operations?tool=links`)}`}>Add a vendor</Link></Button>}</div>
      {sponsor ? <label className="block space-y-2 text-sm font-semibold">3. How many guests can they add?<Input className="max-w-40" type="number" min={1} max={50} value={draft.seatLimit} onChange={e => change({ seatLimit: e.target.value })} /><span className="block text-xs font-normal text-muted-foreground">For example, enter 8 for a sponsor with eight guest places. Up to 50 guests per link.</span></label> : null}
      {!sharingReady ? <p className="text-sm text-muted-foreground">Create your guest link above first. Then you can make private links.</p> : null}
      <Button variant={draft.link ? "outline" : "default"} disabled={!sharingReady || !draft.resourceId || !!lookupError || busy || !!state.remote || (sponsor && (!Number.isInteger(Number(draft.seatLimit)) || Number(draft.seatLimit) < 1 || Number(draft.seatLimit) > 50))} onClick={() => void create()}>{busy ? "Working…" : draft.link ? "Create another private link" : "Create private link"}</Button>
      {draft.link && sharingReady ? <div className="space-y-3 rounded-xl bg-primary/10 p-4"><ShareLinkField label={`Private link for ${draft.linkName}`} value={draft.link} copyLabel={`Copy ${sponsor ? "sponsor" : "vendor"} link`} /><p className="text-xs leading-5 text-muted-foreground">Send this only to {draft.linkName}. Anyone with this link can fill in their form. If you create another link, the old one stays open until you close it below.</p></div> : null}
    </fieldset>
    {message ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{message}</p> : null}
    <details className="border-t border-hairline pt-4"><summary className="cursor-pointer text-sm font-semibold">See links already created{partners.data ? ` (${partners.data.length})` : ""}</summary>
      {partners.error ? <p role="alert" className="mt-3 text-sm">Links could not load. <Button variant="outline" onClick={() => void partners.refetch()}>Try again</Button></p> : <ul className="mt-2 divide-y divide-hairline">{partners.data?.map(partner => <li key={partner.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words"><strong>{partner.name}</strong>{draft.linkId === partner.id ? " · Link shown above" : ""}<small className="mt-1 block text-muted-foreground">{partner.role === "sponsor" ? "Sponsor" : "Vendor"} · {partner.revoked ? "Closed" : new Date(partner.expiresAt).getTime() <= Date.now() ? "Expired" : partner.submitted ? "Guest list received" : "Open"} · Ends {new Date(partner.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</small>{partner.vendorNotes ? <span className="mt-2 block whitespace-pre-wrap">Vendor note: {partner.vendorNotes}</span> : null}</span><Button size="sm" variant="outline" disabled={busy || partner.revoked} onClick={() => void revoke(partner.id)}>Close this link</Button></li>)}</ul>}
    </details>
    {addSponsor ? <SponsorshipDialog eventId={eventId} sponsor={null} open onClose={() => { setAddSponsor(false); void sponsors.refetch(); }} /> : null}
  </section>;
}
