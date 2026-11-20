import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useData } from "@/data/provider";
import type { Event, RegistrationWithGuest, Sponsorship, EventVendor } from "@/data/entities";
import { apparelReport, type EventOperationsDocument } from "@/data/eventOperations";
import { normalizeRegistrationPage } from "@/data/registrationPage";
import { Button } from "@/components/ui/button";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const table = (headings: string[], content: unknown[][]) => `<table><thead><tr>${headings.map(heading => `<th>${escape(heading)}</th>`).join("")}</tr></thead><tbody>${content.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

export default function OperationsReport({ event, rows, sponsors, vendors, dirty }: { event: Event; document: EventOperationsDocument; rows: RegistrationWithGuest[] | undefined; sponsors: Sponsorship[] | undefined; vendors: EventVendor[] | undefined; dirty: boolean }) {
  const adapter = useData();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const financials = useQuery({ queryKey: ["operations-financials", adapter.cacheScope, event.id], queryFn: () => adapter.eventOperations.financials(event.id), refetchInterval: 15000 });
  const ready = rows && sponsors && vendors && financials.data;
  async function download() {
    setBusy(true); setMessage("");
    try {
      // Re-read all sources on demand. A cached dashboard is not a new report snapshot.
      const [snapshot, rows, sponsors, vendors, finances, settings, latestEvent] = await Promise.all([
        adapter.eventOperations.get(event.id), adapter.registrations.listForEvent(event.id),
        adapter.sponsorships.list(event.id), adapter.eventVendors.list(event.id),
        adapter.eventOperations.financials(event.id), adapter.settings.get(), adapter.events.get(event.id),
      ]);
      if (!latestEvent) throw new Error("This event is no longer available.");
      const document = snapshot.document;
      const apparel = apparelReport(rows, normalizeRegistrationPage(latestEvent.registrationPage), document);
      const people = [...new Map(rows.filter(row => row.status !== "cancelled").map(row => [row.guestId, row])).values()];
      const checked = new Set(rows.filter(row => row.status !== "cancelled" && row.checkedInAt).map(row => row.guestId)).size;
      const capturedAt = new Date().toISOString();
      const sections = [
        `<p><strong>BEEBIZY · EVENT WRAP-UP</strong></p><h1>${escape(latestEvent.title)}</h1><p>Event date: ${escape(latestEvent.date)}<br>Records captured: ${escape(capturedAt)} · Operations revision ${snapshot.revision}</p>`,
        `<div class="metrics"><p><b>${people.length}</b>Named registered people</p><p><b>${checked}</b>Checked in</p>${finances.currencies.map(row => `<p><b>${escape(money(row.collectedCents, row.currency))}</b>Collected · ${escape(row.currency)}</p>`).join("")}</div>`,
        `<h2>Fundraising and payments</h2>${table(["Currency", "Paid tickets", "Paid auction orders", "Paid donations", "Paid pledges", "Total collected"], finances.currencies.map(row => [row.currency, money(row.ticketsCents, row.currency), money(row.auctionsCents, row.currency), money(row.donationsCents, row.currency), money(row.paidPledgesCents, row.currency), money(row.collectedCents, row.currency)]))}`,
        `<p><small>Gross recorded payments, separated by currency. Refunded and pending transactions are excluded. Auction amounts paid through bidder bills are counted once. Fees, external collections and sponsor commitments are not counted as collected funds. No currency conversion is applied.</small></p>`,
        finances.unclassified.length ? `<h3>Legacy payments needing currency reconciliation</h3>${table(["Record", "Source", "Recorded amount (currency unknown)"], finances.unclassified.map(row => [row.id, row.source, (row.amountCents / 100).toFixed(2)]))}<p>These legacy records did not retain payment currency. They are listed separately and excluded from currency totals.</p>` : "",
        `<p>Recorded pledge commitments: ${escape(money(finances.pledgedCents, settings.currency))} (workspace display currency; not added as a second payment).</p>`,
        `<h2>Sponsors and commitments</h2>${table(["Sponsor", "Tier", "Status", `Commitment (${settings.currency}), not a receipt`], sponsors.map(sponsor => [sponsor.companyName, sponsor.tier, sponsor.status, money(sponsor.amountCents ?? 0, settings.currency)]))}`,
        `<h2>Sponsor deliverables</h2>${table(["Sponsor", "Deliverable", "Status", "Completed by"], document.sponsorDeliverables.map(item => [sponsors.find(sponsor => sponsor.id === item.sponsorId)?.companyName ?? "Removed sponsor", item.description, item.status, item.completedBy]))}`,
        `<h2>Apparel inventory</h2>${table(["Item", "Size", "Requested before cutoff", "Received", "Handed out", "Stock remaining"], apparel.quantities.map(item => [item.item, item.size, item.requested, item.received, item.handedOut, item.received - item.handedOut]))}<p>${escape(document.apparel.vendorNotes)}</p><p><small>${apparel.unnamedExtraGuests} legacy extra guests lack individual sizing records. Negative stock means entered handouts exceed received inventory and need reconciliation.</small></p>`,
        `<h2>Tables and golf foursomes</h2>${table(["Group", "Location", "Time / notes", "Guests"], document.groups.map(group => [group.name, group.location, group.time, document.assignments.filter(item => item.groupId === group.id).map(item => rows.find(row => row.id === item.registrationId)?.guest?.name ?? "Removed guest").join(", ")]))}`,
        `<h2>Vendor logistics</h2>${table(["Vendor", "Status", "Arrival", "Service", "Departure", `Contracted (${settings.currency})`], vendors.map(vendor => [vendor.vendor?.name, vendor.status, vendor.arrivalTime, vendor.serviceTime, vendor.departureTime, money(vendor.feeCents ?? 0, settings.currency)]))}`,
        `<h2>Preparation and follow-through</h2>${table(["Milestone", "Due", "Status"], document.milestones.map(item => [item.title, item.dueAt?.slice(0, 10), item.completed ? "Complete" : "Open"]))}`,
        `<p><small>Generated from Beebizy records without AI estimation. This report contains attendee names. Share only with authorized event staff.</small></p>`,
      ];
      const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(latestEvent.title)} - Event wrap-up</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#172033;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:38px;line-height:1.1}h2{margin-top:38px;padding-top:12px;border-top:4px solid #f6d900}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;border-bottom:1px solid #dde0e6;padding:10px;vertical-align:top;overflow-wrap:anywhere}th{background:#fff9d7}small{color:#596579}.metrics{display:flex;gap:28px;flex-wrap:wrap}.metrics b{font-size:28px;display:block}button{background:#ffdf00;border:0;padding:12px 20px;border-radius:8px;cursor:pointer}@media print{body{margin:0;max-width:none;padding:0}button{display:none}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}}@page{margin:18mm}</style><body><button onclick="window.print()">Print or save as PDF</button>${sections.join("")}</body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${latestEvent.title.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80) || "Event"} - Wrap-up.html`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Report generated from current records at ${capturedAt}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Report could not be generated. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4"><h3 className="text-lg font-semibold">Your board report, from real records</h3><p className="text-sm text-muted-foreground">Download attendance, collected funds, sponsor commitments and deliverables, apparel inventory, vendor schedules and placements in one printable report. Open the downloaded file to print it or save it as PDF.</p>
    {financials.error ? <p role="alert">Financial records could not load. <Button variant="outline" onClick={() => void financials.refetch()}>Retry</Button></p> : !ready ? <p>Loading the records for your report…</p> : <div className="grid gap-4 sm:grid-cols-3">{financials.data!.currencies.length ? financials.data!.currencies.map(row => <div key={row.currency} className="rounded-xl border border-hairline p-4"><p className="text-sm">Collected · {row.currency}</p><strong className="text-2xl">{money(row.collectedCents, row.currency)}</strong></div>) : <p className="text-sm">No payments with a recorded currency yet.</p>}</div>}
    <Button disabled={!ready || dirty || busy} onClick={() => void download()}>{busy ? "Generating report…" : "Download board report"}</Button>{dirty ? <p className="text-sm text-muted-foreground">Save Command center changes before generating the report.</p> : null}{message ? <p role="status" className="text-sm">{message}</p> : null}<p className="text-xs text-muted-foreground">Records refresh when you download. Sponsor commitments and unpaid pledges stay separate from collected funds. Legacy payments without currency appear separately for reconciliation.</p>
  </div>;
}
