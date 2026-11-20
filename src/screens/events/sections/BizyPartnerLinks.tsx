import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useData } from "@/data/provider";
import { useEventVendors, useSponsorships } from "@/data/hooks";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function BizyPartnerLinks({ eventId }: { eventId: string }) {
  const adapter = useData(); const cache = useQueryClient();
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(eventId, "bizy-partner-link", { role: "sponsor", resourceId: "", seatLimit: "10", link: "", linkName: "", linkId: "" });
  const vendors = useEventVendors(eventId); const sponsors = useSponsorships(eventId);
  const queryKey = ["bizy-partners", adapter.cacheScope, eventId];
  const partners = useQuery({ queryKey, queryFn: () => adapter.eventOperations.partners(eventId), refetchInterval: 15000 });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function create() {
    setBusy(true); setMessage("");
    try {
      const result = await adapter.eventOperations.createPartner(eventId, { role: draft.role as "sponsor" | "vendor", resourceId: draft.resourceId, seatLimit: Number(draft.seatLimit) });
      setDraft({ ...draft, link: location.origin + result.path, linkName: result.name, linkId: result.id }); await cache.invalidateQueries({ queryKey });
      setMessage("Personal link created. Copy it and share it only with this partner. No message was sent.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your personal link could not be created."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage("");
    try { await adapter.eventOperations.revokePartner(eventId, id); await cache.invalidateQueries({ queryKey }); setMessage("Personal link closed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The link could not be closed."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 rounded-xl border border-hairline p-4"><h3 className="font-semibold">Personal links for sponsors and vendors</h3><p className="text-sm text-muted-foreground">Sponsors submit a named guest roster and sizing answers. Vendors update their own arrival, service and departure details. They do not need a Beebizy account.</p><GuestDraftStatus state={{ ...state, message: state.message.replace("guest details", "link setup").replace("guest draft", "link draft").replace("Submit to apply these details.", draft.link ? "" : "Create a personal link when you are ready.") }} recovery={recovery} />
    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-sm">Partner type<select className="block h-10 w-full rounded border border-input bg-background px-2" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value, resourceId: "", link: "", linkName: "", linkId: "" })}><option value="sponsor">Sponsor</option><option value="vendor">Vendor</option></select></label><label className="space-y-1 text-sm">Choose partner<select className="block h-10 w-full rounded border border-input bg-background px-2" value={draft.resourceId} onChange={e => setDraft({ ...draft, resourceId: e.target.value, link: "", linkName: "", linkId: "" })}><option value="">Choose one</option>{draft.role === "sponsor" ? sponsors.data?.map(item => <option key={item.id} value={item.id}>{item.companyName}</option>) : vendors.data?.map(item => <option key={item.id} value={item.id}>{item.vendor?.name}</option>)}</select></label>{draft.role === "sponsor" ? <label className="space-y-1 text-sm">Maximum named guests<Input type="number" min={1} max={50} value={draft.seatLimit} onChange={e => setDraft({ ...draft, seatLimit: e.target.value, link: "", linkName: "", linkId: "" })} /></label> : null}</div>
    <Button disabled={!draft.resourceId || busy || !!state.remote} onClick={() => void create()}>Create personal Bizy Link</Button>
    {draft.link ? <label className="block space-y-2 text-sm font-medium">Personal link for {draft.linkName}<Input readOnly value={draft.link} onFocus={e => e.target.select()} /><span className="block text-xs font-normal text-muted-foreground">Anyone with this link can act for this partner. Close it below when access is no longer needed.</span></label> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {partners.error ? <p role="alert">Personal links could not load. <Button variant="outline" onClick={() => void partners.refetch()}>Retry</Button></p> : <ul className="divide-y divide-hairline">{partners.data?.map(partner => <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{partner.name}{draft.linkId === partner.id ? " · Link shown above" : ""} · {partner.role} · {partner.revoked ? "Closed" : partner.submitted ? "Roster submitted" : "Active"}<small className="block text-muted-foreground">Expires {partner.expiresAt.slice(0, 10)}</small>{partner.vendorNotes ? <span className="mt-2 block whitespace-pre-wrap text-foreground">Vendor note: {partner.vendorNotes}</span> : null}</span><Button size="sm" variant="outline" disabled={busy || partner.revoked} onClick={() => void revoke(partner.id)}>Close personal link</Button></li>)}</ul>}
  </div>;
}
