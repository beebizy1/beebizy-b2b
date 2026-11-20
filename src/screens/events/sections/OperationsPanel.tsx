import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import { useData } from "@/data/provider";
import { useEventRegistrations, useSponsorships, useEventVendors, useSettings } from "@/data/hooks";
import { apparelReport, eventOperationsSchema, preparationMilestones, type EventOperationsDocument, type EventOperationsSnapshot } from "@/data/eventOperations";
import { fromDateTimeLocalInputInZone, toDateTimeLocalInputInZone, resolveTimeZone } from "@/lib/datetime";
import { normalizeRegistrationPage } from "@/data/registrationPage";
import type { Event } from "@/data/entities";
import { csvCell } from "@/data/spreadsheet";
import PlacementBoard from "./PlacementBoard";
import OperationsReport from "./OperationsReport";
import BizyPartnerLinks from "./BizyPartnerLinks";

function downloadOperationsCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OperationsPanel({ event }: { event: Event }) {
  const adapter = useData();
  const query = useQuery({ queryKey: ["event-operations", adapter.cacheScope, event.id], queryFn: () => adapter.eventOperations.get(event.id), refetchInterval: 15_000 });
  if (query.error) return <div role="alert" className="p-6">Could not load Command center. <Button onClick={() => void query.refetch()}>Retry</Button></div>;
  if (!query.data) return <p className="p-6">Loading Command center…</p>;
  return <OperationsEditor key={event.id} event={event} snapshot={query.data} />;
}

const sections = ["Apparel & gear", "Tables", "Golf foursomes", "Sponsors & roadmap", "Bizy Link", "Wrap-up report"] as const;

function OperationsEditor({ event, snapshot }: { event: Event; snapshot: EventOperationsSnapshot }) {
  const adapter = useData(); const cache = useQueryClient();
  const [section, setSection] = useState<typeof sections[number]>("Apparel & gear");
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(event.id, "event-operations", { document: JSON.stringify(snapshot.document), baseRevision: String(snapshot.revision) });
  const document: EventOperationsDocument = state.discarded ? snapshot.document : JSON.parse(draft.document || JSON.stringify(snapshot.document));
  const setDocument = (value: EventOperationsDocument) => setDraft({ document: JSON.stringify(value), baseRevision: state.discarded ? String(snapshot.revision) : draft.baseRevision });
  const people = useEventRegistrations(event.id); const sponsors = useSponsorships(event.id); const vendors = useEventVendors(event.id);
  const page = normalizeRegistrationPage(event.registrationPage);
  const settings = useSettings(); const timeZone = resolveTimeZone(event.timeZone ?? settings.data?.timeZone);
  const report = apparelReport(people.data ?? [], page, document);
  const peopleIds = new Set(people.data?.map(row => row.id)); const sponsorIds = new Set(sponsors.data?.map(row => row.id));
  const removedReferences = !!people.data && !!sponsors.data && (document.assignments.some(row => !peopleIds.has(row.registrationId)) || document.apparel.handedOutRegistrationIds.some(id => !peopleIds.has(id)) || document.sponsorDeliverables.some(row => !sponsorIds.has(row.sponsorId)));
  async function save() {
    setSaving(true); setMessage(""); const expected = { ...draft };
    try {
      const parsed = eventOperationsSchema.safeParse(document);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review your changes.");
      const result = await adapter.eventOperations.save(event.id, state.discarded ? snapshot.revision : Number(draft.baseRevision), parsed.data);
      cache.setQueryData(["event-operations", adapter.cacheScope, event.id], result);
      recovery.complete(expected, { document: JSON.stringify(result.document), baseRevision: String(result.revision) });
      setMessage(`Saved to Beebizy. Revision ${result.revision}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saving failed. Your draft is preserved."); }
    finally { setSaving(false); }
  }
  const setApparel = (patch: Partial<EventOperationsDocument["apparel"]>) => setDocument({ ...document, apparel: { ...document.apparel, ...patch } });
  return <section className="space-y-5 rounded-2xl border border-hairline bg-white p-4 sm:p-6" aria-label="Event command center">
    <fieldset disabled={saving} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Command center</h2><p className="mt-1 text-sm text-muted-foreground">Collect details once. Plan placements. Share the results.</p></div><Button onClick={() => void save()} disabled={saving || state.discarded || !!state.remote}>{saving ? "Saving…" : "Save changes"}</Button></div>
    <GuestDraftStatus state={{ ...state, message: state.message.replace("guest details", "Command center changes").replace("guest draft", "Command center draft").replace("Submit to apply these details.", "Use Save changes to apply them.") }} recovery={recovery} />
    {snapshot.previous ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Previous saved version</summary><p className="my-2">Load the previous arrangement as a draft, review it, then save to restore it.</p><Button size="sm" variant="outline" onClick={() => setDocument(snapshot.previous!.document)}>Load previous saved arrangement</Button></details> : null}
    {message ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{message}</p> : null}
    {removedReferences ? <div role="alert" className="space-y-2 rounded-lg border border-amber-300 p-3 text-sm"><p>Some guests or sponsors were removed from the event. Clear their old placements and fulfillment references before saving.</p><Button variant="outline" onClick={() => setDocument({ ...document, assignments: document.assignments.filter(row => peopleIds.has(row.registrationId)), apparel: { ...document.apparel, handedOutRegistrationIds: document.apparel.handedOutRegistrationIds.filter(id => peopleIds.has(id)) }, sponsorDeliverables: document.sponsorDeliverables.filter(row => sponsorIds.has(row.sponsorId)) })}>Reconcile removed records</Button></div> : null}
    {!state.discarded && Number(draft.baseRevision) !== snapshot.revision ? <div role="alert" className="space-y-2 rounded-lg border border-amber-300 p-3 text-sm"><p>Your team saved a newer arrangement. Your draft is still protected. Load their version before making further changes.</p><Button variant="outline" onClick={() => recovery.complete(draft, { document: JSON.stringify(snapshot.document), baseRevision: String(snapshot.revision) })}>Use latest team version</Button></div> : null}
    <nav className="flex flex-wrap gap-2" aria-label="Command center sections">{sections.map(label => <Button key={label} size="sm" variant={section === label ? "default" : "outline"} aria-current={section === label ? "page" : undefined} onClick={() => setSection(label)}>{label}</Button>)}</nav>
    {section === "Apparel & gear" ? <div className="space-y-5">
      <div className="rounded-xl bg-primary/10 p-4 text-sm"><strong>1. Add sizing questions. 2. Select them below. 3. Download the vendor report.</strong><p className="mt-2">Use the shirt, pant, or gift preset in <Link className="font-semibold underline" href={`/app/events/${event.id}/share`}>Design invitation → RSVP questions</Link>. Include additional guests when they need gear too.</p></div>
      {page.questions.length ? <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Questions to include in fulfillment</legend>{page.questions.map(question => <label key={question.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={document.apparel.questionIds.includes(question.id)} onChange={e => setApparel({ questionIds: e.target.checked ? [...document.apparel.questionIds, question.id] : document.apparel.questionIds.filter(id => id !== question.id) })} />{question.label}</label>)}</fieldset> : <p>No RSVP questions yet. Add them in Design invitation first.</p>}
      <label className="block space-y-2 text-sm font-medium">Production cutoff ({timeZone})<Input type="datetime-local" value={toDateTimeLocalInputInZone(document.apparel.cutoffAt, timeZone)} onChange={e => { const cutoffAt = e.target.value ? fromDateTimeLocalInputInZone(e.target.value, timeZone) : null; if (e.target.value && !cutoffAt) { setMessage("Choose a valid time in the event time zone."); return; } setApparel({ cutoffAt }); }} /><span className="block text-xs font-normal text-muted-foreground">At this time, sizing questions close and new production requests stop. Guests can still register. Recorded handouts remain in inventory totals.</span></label>
      <label className="block space-y-2 text-sm font-medium">Vendor fulfillment instructions<Textarea value={document.apparel.vendorNotes} maxLength={2000} onChange={e => setApparel({ vendorNotes: e.target.value })} /></label>
      {people.isLoading ? <p>Loading sizing responses…</p> : people.error ? <p role="alert">Sizing responses could not load. Retry before exporting.</p> : <>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!report.individual.length} onClick={() => downloadOperationsCsv("apparel-individual.csv", [["Name", "Guest type", "Item", "Size", "Registration status", "Within production cutoff", "Handed out"], ...report.individual.map(row => [row.name, row.guestType, row.item, row.size, row.registrationStatus, row.withinCutoff ? "Yes" : "No", row.handedOut ? "Yes" : "No"])])}>Download individual sizes CSV</Button><Button variant="outline" disabled={!report.quantities.length} onClick={() => downloadOperationsCsv("apparel-production.csv", [["Item", "Size", "Requested", "Received", "Handed out", "Stock remaining", "Instructions"], ...report.quantities.map(row => [row.item, row.size, row.requested, row.received, row.handedOut, row.received - row.handedOut, document.apparel.vendorNotes])])}>Download vendor production CSV</Button></div>
        {report.unnamedExtraGuests ? <p role="alert" className="text-sm">{report.unnamedExtraGuests} extra guests have no individual record. Add their names and sizes before placing the order.</p> : null}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Item / size", "Requested", "Received", "Handed out", "Stock remaining"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{report.quantities.map(row => <tr key={`${row.questionId}:${row.size}`} className="border-t border-hairline"><td className="p-2">{row.item} · {row.size}</td><td className="p-2">{row.requested}</td><td className="p-2"><Input className="w-24" aria-label={`Received ${row.item} ${row.size}`} type="number" min={0} max={100000} value={row.received} onChange={e => setApparel({ received: [...document.apparel.received.filter(item => item.questionId !== row.questionId || item.size !== row.size), { questionId: row.questionId, size: row.size, quantity: Number(e.target.value) }] })} /></td><td className="p-2">{row.handedOut}</td><td className="p-2">{row.received - row.handedOut}</td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer font-semibold">Track guest handouts</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{[...new Map(report.individual.filter(row => row.size !== "Not provided").map(row => [row.registrationId, row])).values()].map(row => <label className="flex items-center gap-2 text-sm" key={row.registrationId}><input type="checkbox" checked={row.handedOut} onChange={e => setApparel({ handedOutRegistrationIds: e.target.checked ? [...document.apparel.handedOutRegistrationIds, row.registrationId] : document.apparel.handedOutRegistrationIds.filter(id => id !== row.registrationId) })} />{row.name}{row.registrationStatus === "cancelled" ? " (cancelled)" : ""} · Gear handed out</label>)}</div></details>
      </>}
    </div> : null}
    {section === "Tables" || section === "Golf foursomes" ? people.error ? <p role="alert">Guest list unavailable. Retry before arranging guests.</p> : <PlacementBoard document={document} rows={people.data ?? []} kind={section === "Tables" ? "table" : "golf"} onChange={setDocument} onError={setMessage} /> : null}
    {section === "Sponsors & roadmap" ? <div className="space-y-6">
      <div><h3 className="mb-3 font-semibold">Sponsor deliverables</h3><p className="mb-3 text-sm text-muted-foreground">Sponsor names, tiers and commitments come from Fundraising. Track the work promised to each sponsor here.</p>{sponsors.error ? <p role="alert">Sponsors could not load.</p> : (sponsors.data ?? []).map(sponsor => <div key={sponsor.id} className="mb-3 rounded-xl border border-hairline p-4"><h4 className="font-semibold">{sponsor.companyName} · {sponsor.tier}</h4>{document.sponsorDeliverables.filter(item => item.sponsorId === sponsor.id).map(item => <div key={item.id} className="mt-3 grid gap-2 sm:grid-cols-2"><Input aria-label={`Deliverable for ${sponsor.companyName}`} value={item.description} maxLength={500} onChange={e => setDocument({ ...document, sponsorDeliverables: document.sponsorDeliverables.map(row => row.id === item.id ? { ...row, description: e.target.value } : row) })} /><select aria-label={`Status of ${item.description}`} className="rounded border border-input p-2 text-sm" value={item.status} onChange={e => setDocument({ ...document, sponsorDeliverables: document.sponsorDeliverables.map(row => row.id === item.id ? { ...row, status: e.target.value as typeof item.status } : row) })}><option value="pending">Pending</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select><Input aria-label={`Completed by for ${item.description}`} placeholder="Completed by" value={item.completedBy} onChange={e => setDocument({ ...document, sponsorDeliverables: document.sponsorDeliverables.map(row => row.id === item.id ? { ...row, completedBy: e.target.value } : row) })} /><Button variant="ghost" onClick={() => setDocument({ ...document, sponsorDeliverables: document.sponsorDeliverables.filter(row => row.id !== item.id) })}>Remove deliverable</Button></div>)}<Button size="sm" className="mt-3" variant="outline" onClick={() => setDocument({ ...document, sponsorDeliverables: [...document.sponsorDeliverables, { id: crypto.randomUUID(), sponsorId: sponsor.id, description: "New sponsor deliverable", status: "pending", completedBy: "", dueAt: null }] })}>Add deliverable</Button></div>)}</div>
      <div><h3 className="font-semibold">Preparation roadmap</h3>{!document.milestones.length ? <Button className="my-3" variant="outline" onClick={() => setDocument({ ...document, milestones: preparationMilestones(event.date) })}>Add event preparation timeline</Button> : null}<p className="my-2 text-sm text-muted-foreground">Set dates for onboarding, partner collection, production cutoffs, seating, check-in and the wrap-up report.</p>{document.milestones.map(item => <div key={item.id} className="mb-2 flex flex-wrap items-center gap-2"><input aria-label={`Complete ${item.title}`} type="checkbox" checked={item.completed} onChange={e => setDocument({ ...document, milestones: document.milestones.map(row => row.id === item.id ? { ...row, completed: e.target.checked } : row) })} /><Input className="min-w-40 flex-1" aria-label="Milestone title" value={item.title} maxLength={200} onChange={e => setDocument({ ...document, milestones: document.milestones.map(row => row.id === item.id ? { ...row, title: e.target.value } : row) })} /><Input aria-label={`Due date for ${item.title}`} className="w-40" type="date" value={item.dueAt?.slice(0, 10) ?? ""} onChange={e => setDocument({ ...document, milestones: document.milestones.map(row => row.id === item.id ? { ...row, dueAt: e.target.value ? `${e.target.value}T12:00:00Z` : null } : row) })} /><Button variant="ghost" onClick={() => setDocument({ ...document, milestones: document.milestones.filter(row => row.id !== item.id) })}>Remove</Button></div>)}<Button variant="outline" onClick={() => setDocument({ ...document, milestones: [...document.milestones, { id: crypto.randomUUID(), title: "New preparation step", dueAt: null, completed: false }] })}>Add milestone</Button></div>
    </div> : null}
    {section === "Bizy Link" ? <div className="space-y-4"><h3 className="font-semibold">One starting point for your event</h3>{event.shareToken ? <><Input aria-label="Event Bizy Link" readOnly value={`${location.origin}/bizy/${event.shareToken}`} /><Button asChild variant="outline"><a href={`/bizy/${event.shareToken}`} target="_blank" rel="noreferrer">Preview Bizy Link</a></Button></> : <p>Enable event sharing in Design invitation to create your Bizy Link.</p>}<p className="rounded-xl bg-muted/30 p-4 text-sm">SMS is not connected. You can copy your Bizy Link into a text yourself. Sending texts from Beebizy needs a business texting account first.</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/app/events/${event.id}/vendors`}>Vendor schedules ({vendors.data?.length ?? 0})</Link></Button><Button asChild variant="outline"><Link href={`/app/events/${event.id}/deposits`}>Payments/Deposits</Link></Button><Button asChild variant="outline"><Link href={`/app/events/${event.id}/fundraising`}>Contributions and sponsor tiers</Link></Button></div></div> : null}
    {section === "Bizy Link" ? <BizyPartnerLinks eventId={event.id} /> : null}
    {section === "Wrap-up report" ? <OperationsReport event={event} document={document} rows={people.data} sponsors={sponsors.data} vendors={vendors.data} dirty={!state.discarded} /> : null}
    </fieldset>
  </section>;
}
