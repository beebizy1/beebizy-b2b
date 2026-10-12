import { useEffect, useState } from "react";
import { AlertTriangle, Copy, FileCheck2, Plus, ReceiptText, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import {
  useAuctionCategories,
  useBuildBidderBills,
  useCreateAuctionCategory,
  useCreateDonationCampaign,
  useDonationCampaigns,
  useFundraisingDashboard,
  useExtendAuctionItem,
  useSendFundraisingBroadcast,
  useFundraisingOrganizationProfile,
  useItemSubmissions,
  useMergeAuctionItems,
  useRefundBidderBill,
  useReinvitePastItemDonors,
  useSendBidderBills,
  useSendYearEndStatements,
  useUpdateFundraisingOrganizationProfile,
  useUpdateItemSubmission,
} from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";
import type { Event, FundraisingOrganizationProfile, ItemSubmissionStatus, PublicBidderBill } from "@/data/entities";
import FundraisingReportsPanel from "./FundraisingReportsPanel";

const STATUS_FLOW: ItemSubmissionStatus[] = ["submitted", "needs_info", "approved", "in_catalog", "sold", "delivered"];

export default function FundraisingOperationsPanel({ event }: { event: Event }) {
  const { data: dashboard, isLoading: dashboardLoading } = useFundraisingDashboard(event.id);
  const extendHotItem = useExtendAuctionItem();
  const sendPromotionBlast = useSendFundraisingBroadcast();
  const { data: profile } = useFundraisingOrganizationProfile();
  const updateProfile = useUpdateFundraisingOrganizationProfile();
  const { data: categories } = useAuctionCategories();
  const createCategory = useCreateAuctionCategory();
  const { data: campaigns } = useDonationCampaigns(event.id);
  const createCampaign = useCreateDonationCampaign();
  const { data: submissions, isLoading: submissionsLoading } = useItemSubmissions(event.id);
  const updateSubmission = useUpdateItemSubmission();
  const mergeItems = useMergeAuctionItems();
  const buildBills = useBuildBidderBills();
  const sendBills = useSendBidderBills();
  const refundBill = useRefundBidderBill();
  const sendYearEndStatements = useSendYearEndStatements();
  const reinvitePastDonors = useReinvitePastItemDonors();
  const [profileForm, setProfileForm] = useState<FundraisingOrganizationProfile | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [changeRequests, setChangeRequests] = useState<Record<string, string>>({});
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [billReview, setBillReview] = useState<PublicBidderBill[]>([]);
  const [packageItemIds, setPackageItemIds] = useState<string[]>([]);
  const [packageTitle, setPackageTitle] = useState("");

  useEffect(() => { if (profile) setProfileForm(profile); }, [profile]);

  const intakeUrl = event.auctionPublicToken ? `${window.location.origin}/donate/event/${event.auctionPublicToken}` : null;
  const p0Ready = Boolean(profile?.legalName && profile?.ein && profile?.orgType);

  return (
    <div className="space-y-6">
      {!p0Ready ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-tint p-4 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div><p className="font-semibold">Tax receipt setup is incomplete</p><p>Add the organization's legal name, EIN, and organization type before issuing bidder or donor receipts. Templates still require CPA or nonprofit tax attorney approval before launch.</p></div>
        </div>
      ) : null}

      {dashboardLoading ? <LoadingRows rows={2} /> : dashboard ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatTile label="Total raised" value={formatMoney(dashboard.totals.totalCents)} tone="success" />
          <StatTile label="Silent" value={formatMoney(dashboard.totals.silentCents)} />
          <StatTile label="Live" value={formatMoney(dashboard.totals.liveCents)} />
          <StatTile label="Fund-a-Need" value={formatMoney(dashboard.totals.pledgesCents)} />
          <StatTile label="Bidders" value={String(dashboard.bidders.registered)} sublabel={`${dashboard.bidders.checkedIn} in room, ${dashboard.bidders.remote} remote`} />
          <StatTile label="No-bid items" value={String(dashboard.items.noBids)} sublabel={`${dashboard.items.sellThroughRate}% sell-through`} />
        </div>
      ) : null}
      {dashboard && (dashboard.hotItems.length > 0 || dashboard.noBidClosingSoon.length > 0) ? <Panel><PanelHeader title="Closing opportunities" description="Act on hot bidding and no-bid items before the window closes." /><div className="grid gap-3 p-5 lg:grid-cols-2">{dashboard.hotItems.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-tint p-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.title}</p><p data-numeric className="text-xs text-success-text">{item.bidCountLastFiveMinutes} bids in the last 5 minutes</p></div><Button size="sm" variant="outline" disabled={extendHotItem.isPending} onClick={() => extendHotItem.mutate({ eventId: event.id, itemId: item.id, minutes: 2 }, { onSuccess: () => toast({ title: `${item.title} extended 2 minutes` }) })}>Extend +2m</Button></div>)}{dashboard.noBidClosingSoon.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-tint p-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.title}</p><p className="text-xs text-warning-text">No bids and closing soon</p></div><Button size="sm" variant="outline" disabled={sendPromotionBlast.isPending} onClick={() => sendPromotionBlast.mutate({ eventId: event.id, audience: "all", itemIds: [item.id], channels: ["email", "in_app"], message: `${item.title} has no bids yet and is closing soon. Open the auction now to bid.` }, { onSuccess: (result) => toast({ title: `Promotion sent to ${result.sent} bidders` }), onError: (error) => toast({ title: "Couldn't send promotion", description: error.message }) })}>Send blast</Button></div>)}</div></Panel> : null}

      <Panel>
        <PanelHeader title="Family donation link" description="One link for every family and business donor. Each submission lands in the review queue below." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="min-w-0 flex-1"><p className="truncate font-mono text-xs text-muted-foreground">{intakeUrl ?? "Create the public auction link first."}</p></div>
          {intakeUrl ? <><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(intakeUrl); toast({ title: "Family donation link copied" }); }}><Copy className="mr-1.5 size-4" />Copy</Button><Button variant="outline" size="sm" asChild><a href={intakeUrl} target="_blank" rel="noreferrer">Open form</a></Button><Button variant="outline" size="sm" disabled={reinvitePastDonors.isPending} onClick={() => { if (!window.confirm("Email this intake link to prior auction item donors in this workspace?")) return; reinvitePastDonors.mutate(event.id, { onSuccess: (result) => toast({ title: `${result.sent} prior donors invited`, description: result.failed ? `${result.failed} could not be delivered.` : undefined }), onError: (error) => toast({ title: "Couldn't invite prior donors", description: error.message }) }); }}><Send className="mr-1.5 size-4" />Re-invite prior donors</Button></> : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="End-of-night checkout" description="Create one combined bill per bidder for auction items and Fund-a-Need gifts." />
        <div className="flex flex-wrap gap-3 p-5"><Button variant="outline" disabled={buildBills.isPending} onClick={() => buildBills.mutate(event.id, { onSuccess: (result) => { setBillReview(result.bills); toast({ title: `${result.bills.length} bidder bills ready`, description: `${result.created} new bills created.` }); }, onError: (error) => toast({ title: "Couldn't build bills", description: error.message }) })}><ReceiptText className="mr-1.5 size-4" />Build and review bills</Button><Button disabled={sendBills.isPending || !p0Ready || billReview.length === 0} onClick={() => { const chargeable = billReview.filter((bill) => ["draft", "pending", "failed"].includes(bill.status)); const total = chargeable.reduce((sum, bill) => sum + bill.totalCents, 0); if (!window.confirm(`Start checkout for ${chargeable.length} bidder${chargeable.length === 1 ? "" : "s"} totaling ${formatMoney(total)}? Opted-in bidders may be charged immediately.`)) return; sendBills.mutate(event.id, { onSuccess: (result) => toast({ title: "Bidder checkout started", description: `${result.autoCharged} auto-charged, ${result.sent} payment links sent, ${result.failed} failed.` }), onError: (error) => toast({ title: "Couldn't send bills", description: error.message }) }); }}><Send className="mr-1.5 size-4" />Charge opted-in bidders and send links</Button></div>
        {billReview.length > 0 ? <div className="overflow-x-auto border-t border-hairline"><table className="w-full min-w-[42rem] text-sm"><thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Bidder</th><th className="px-3 py-3">Items</th><th className="px-3 py-3">Pledges</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-hairline">{billReview.map((bill) => <tr key={bill.id}><td className="px-5 py-3"><p className="font-medium">{bill.bidderName}</p><p className="text-xs text-muted-foreground">{bill.bidderEmail}</p></td><td className="px-3 py-3">{formatMoney(bill.itemsTotalCents)}</td><td className="px-3 py-3">{formatMoney(bill.pledgesTotalCents)}</td><td className="px-3 py-3 font-semibold">{formatMoney(bill.totalCents)}</td><td className="px-3 py-3"><Pill tone={bill.status === "paid" ? "success" : bill.status === "refunded" ? "warning" : undefined}>{bill.status}</Pill></td><td className="px-5 py-3 text-right">{bill.status === "paid" ? <Button size="sm" variant="outline" disabled={refundBill.isPending} onClick={() => { if (!window.confirm(`Refund ${bill.bidderName}'s full combined bill? A corrected receipt will be issued.`)) return; refundBill.mutate({ eventId: event.id, billId: bill.id }, { onSuccess: (updated) => { setBillReview((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); toast({ title: "Bill refunded", description: "A corrected receipt was issued automatically." }); }, onError: (error) => toast({ title: "Couldn't refund bill", description: error.message }) }); }}>Refund</Button> : null}</td></tr>)}</tbody></table></div> : null}
      </Panel>

      <Panel>
        <PanelHeader title="Straight donation campaigns" description="Create a standalone giving link with one-time or monthly gifts, designations, tributes, and employer matching." />
        {(campaigns ?? []).length > 0 ? <ul className="divide-y divide-hairline">{(campaigns ?? []).map((campaign) => { const url = `${window.location.origin}/give/${campaign.publicToken}`; return <li key={campaign.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-semibold">{campaign.title}</p><p className="truncate font-mono text-xs text-muted-foreground">{url}</p></div><Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(url); toast({ title: "Donation link copied" }); }}><Copy className="mr-1.5 size-4" />Copy</Button><Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer">Open</a></Button></li>; })}</ul> : null}
        <form className="grid gap-3 border-t border-hairline p-5 sm:grid-cols-[1fr_10rem_auto]" onSubmit={(formEvent) => { formEvent.preventDefault(); const goalCents = campaignGoal ? Math.round(Number(campaignGoal) * 100) : null; createCampaign.mutate({ eventId: event.id, title: campaignTitle.trim(), goalCents, suggestedAmountsCents: [5_000, 10_000, 25_000, 50_000, 100_000], designations: ["Annual Fund", "Scholarships", "Arts", "Athletics"], defaultDesignation: "Annual Fund" }, { onSuccess: () => { setCampaignTitle(""); setCampaignGoal(""); toast({ title: "Donation campaign created" }); }, onError: (error) => toast({ title: "Couldn't create campaign", description: error.message }) }); }}><Input value={campaignTitle} onChange={(formEvent) => setCampaignTitle(formEvent.target.value)} placeholder="Campaign title" required /><Input value={campaignGoal} onChange={(formEvent) => setCampaignGoal(formEvent.target.value)} placeholder="Goal" inputMode="decimal" /><Button type="submit" disabled={!campaignTitle.trim() || createCampaign.isPending}><Plus className="mr-1.5 size-4" />Create</Button></form>
      </Panel>

      <Panel>
        <PanelHeader title="Procurement review board" description="Submitted items move from review to catalog, sale, and delivery." />
        {submissionsLoading ? <LoadingRows rows={4} /> : (submissions ?? []).length === 0 ? <EmptyState icon={FileCheck2} title="No family submissions yet" description="Share the family donation link to begin procurement." /> : (
          <div className="grid gap-4 p-5 lg:grid-cols-2">{(submissions ?? []).map((submission) => {
            const payload = submission.payload;
            const title = String(payload.itemTitle ?? "Untitled item");
            const donor = String(payload.donorName ?? submission.submittedBy);
            const photos = Array.isArray(payload.photoUrls) ? payload.photoUrls.filter((url): url is string => typeof url === "string") : [];
            return (
              <article key={submission.id} className="rounded-xl border border-hairline bg-background p-4">
                <div className="flex gap-3">{photos[0] ? <img src={photos[0]} alt="" className="size-20 rounded-lg object-cover" /> : null}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{title}</h3><Pill tone={submission.status === "in_catalog" ? "success" : submission.status === "needs_info" ? "warning" : undefined}>{submission.status.replaceAll("_", " ")}</Pill></div><p className="text-xs text-muted-foreground">{donor}</p><p className="mt-1 text-xs text-muted-foreground">{String(payload.category ?? "Uncategorized")} · {Array.isArray(payload.grades) ? payload.grades.join(", ") : "No grade"}</p></div></div>
                {submission.auctionItemId ? <label className="mt-3 flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={packageItemIds.includes(submission.auctionItemId)} onChange={(event) => setPackageItemIds((current) => event.target.checked ? [...new Set([...current, submission.auctionItemId!])] : current.filter((id) => id !== submission.auctionItemId))} />Include in package</label> : null}
                <div className="mt-4 flex flex-wrap gap-2">{STATUS_FLOW.map((status) => <Button key={status} size="sm" variant={submission.status === status ? "default" : "outline"} disabled={updateSubmission.isPending} onClick={() => updateSubmission.mutate({ eventId: event.id, submissionId: submission.id, patch: { status } }, { onError: (error) => toast({ title: "Couldn't update submission", description: error.message }) })}>{status.replaceAll("_", " ")}</Button>)}</div>
                <div className="mt-3 flex gap-2"><Input value={changeRequests[submission.id] ?? submission.requestedChanges ?? ""} onChange={(event) => setChangeRequests((current) => ({ ...current, [submission.id]: event.target.value }))} placeholder="Request a change from the donor" /><Button size="sm" variant="outline" disabled={!String(changeRequests[submission.id] ?? "").trim()} onClick={() => updateSubmission.mutate({ eventId: event.id, submissionId: submission.id, patch: { status: "needs_info", requestedChanges: changeRequests[submission.id] } }, { onSuccess: () => toast({ title: "Change request sent" }) })}><Send className="mr-1.5 size-4" />Send</Button></div>
              </article>
            );
          })}<form className="flex flex-wrap gap-2 rounded-xl border border-dashed border-hairline p-4 lg:col-span-2" onSubmit={(formEvent) => { formEvent.preventDefault(); mergeItems.mutate({ eventId: event.id, itemIds: packageItemIds, title: packageTitle.trim() }, { onSuccess: () => { setPackageItemIds([]); setPackageTitle(""); toast({ title: "Auction package created", description: "The source items were hidden and the new package is ready for review." }); }, onError: (error) => toast({ title: "Couldn't create package", description: error.message }) }); }}><Input className="min-w-56 flex-1" value={packageTitle} onChange={(inputEvent) => setPackageTitle(inputEvent.target.value)} placeholder="Package title, e.g. Tahoe Escape" /><Button type="submit" disabled={packageItemIds.length < 2 || !packageTitle.trim() || mergeItems.isPending}>Merge {packageItemIds.length} items</Button></form></div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Catalog categories" description="These become the scrolling category chips in the bidder catalog." />
        <div className="flex flex-wrap gap-2 border-b border-hairline p-5">{(categories ?? []).map((category) => <Pill key={category.id}>{category.name}</Pill>)}</div>
        <form className="flex gap-2 p-5" onSubmit={(event) => { event.preventDefault(); if (!newCategory.trim()) return; createCategory.mutate(newCategory.trim(), { onSuccess: () => setNewCategory(""), onError: (error) => toast({ title: "Couldn't add category", description: error.message }) }); }}><Input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" /><Button type="submit"><Plus className="mr-1.5 size-4" />Add</Button></form>
      </Panel>

      {profileForm ? (
        <Panel>
          <PanelHeader title="Fundraising organization and receipts" description="Receipts are issued in the school's name. Beebizy remains the processor." />
          <form className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); updateProfile.mutate(profileForm, { onSuccess: () => toast({ title: "Fundraising profile saved" }), onError: (error) => toast({ title: "Couldn't save profile", description: error.message }) }); }}>
            <div className="space-y-1.5"><Label htmlFor="fundraising-legal-name">Organization legal name</Label><Input id="fundraising-legal-name" value={profileForm.legalName ?? ""} onChange={(event) => setProfileForm({ ...profileForm, legalName: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="fundraising-ein">EIN</Label><Input id="fundraising-ein" value={profileForm.ein ?? ""} onChange={(event) => setProfileForm({ ...profileForm, ein: event.target.value })} placeholder="XX-XXXXXXX" /></div>
            <div className="space-y-1.5"><Label htmlFor="fundraising-org-type">Organization type</Label><select id="fundraising-org-type" value={profileForm.orgType ?? ""} onChange={(event) => setProfileForm({ ...profileForm, orgType: event.target.value as FundraisingOrganizationProfile["orgType"] })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose type</option><option value="nonprofit_501c3">501(c)(3) nonprofit</option><option value="government">Government or public school entity</option></select></div>
            <div className="space-y-1.5"><Label htmlFor="fundraising-prefix">Receipt prefix</Label><Input id="fundraising-prefix" value={profileForm.receiptPrefix} onChange={(event) => setProfileForm({ ...profileForm, receiptPrefix: event.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.defaultCoverFees} onChange={(event) => setProfileForm({ ...profileForm, defaultCoverFees: event.target.checked })} /> Start “cover fees” checked</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.raffleRegistrationConfirmed} onChange={(event) => setProfileForm({ ...profileForm, raffleRegistrationConfirmed: event.target.checked, raffleEnabled: event.target.checked ? profileForm.raffleEnabled : false })} /> California raffle registration confirmed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.raffleEnabled} disabled={!profileForm.raffleRegistrationConfirmed} onChange={(event) => setProfileForm({ ...profileForm, raffleEnabled: event.target.checked })} /> Enable raffle tools</label>
            <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={updateProfile.isPending}><ReceiptText className="mr-1.5 size-4" />Save receipt setup</Button></div>
          </form>
        </Panel>
      ) : null}

      {dashboard?.byGrade.length ? <Panel><PanelHeader title="Participation by grade" description="Households and fundraising participation across the school." /><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{dashboard.byGrade.map((grade) => <div key={grade.grade} className="rounded-lg border border-hairline p-3"><p className="font-semibold">{grade.grade}</p><p className="text-xs text-muted-foreground"><Users className="mr-1 inline size-3" />{grade.households} households</p></div>)}</div></Panel> : null}
      <Panel><PanelHeader title="Year-end giving statements" description="Each January, Beebizy automatically emails one annual summary per household. You can also send a prior year manually." /><div className="flex flex-wrap items-center gap-3 p-5"><Input id="statement-year" className="w-28" type="number" min={2000} max={new Date().getFullYear()} defaultValue={new Date().getFullYear() - 1} /><Button variant="outline" disabled={sendYearEndStatements.isPending} onClick={() => { const input = document.getElementById("statement-year") as HTMLInputElement | null; const taxYear = Number(input?.value); if (!Number.isInteger(taxYear)) return; if (!window.confirm(`Email ${taxYear} giving statements to every household with receipts in this workspace?`)) return; sendYearEndStatements.mutate(taxYear, { onSuccess: (result) => toast({ title: `${result.sent} statements sent`, description: result.failed ? `${result.failed} could not be delivered.` : "Every eligible statement was processed." }), onError: (error) => toast({ title: "Couldn't send statements", description: error.message }) }); }}><Send className="mr-1.5 size-4" />Send statements</Button></div></Panel>
      <FundraisingReportsPanel event={event} />
    </div>
  );
}
