import { useState } from "react";
import { Check, Gift, HeartHandshake } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, PanelHeader } from "@/components/primitives";
import { useCreateDonationCheckout, usePublicDonationCampaign, usePublicDonationStatus } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";
import { SCHOOL_GRADES, type SchoolGrade } from "@/data/entities";

export default function PublicDonationCampaignPage({ token }: { token: string }) {
  const query = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const donationResult = query.get("donation");
  const donationId = donationResult === "success" ? query.get("id") : null;
  const { data: campaign, isLoading } = usePublicDonationCampaign(token);
  const { data: donationStatus, isLoading: donationStatusLoading } = usePublicDonationStatus(token, donationId);
  const checkout = useCreateDonationCheckout();
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [frequency, setFrequency] = useState<"one-time" | "monthly">("one-time");
  const [designation, setDesignation] = useState("");
  const [tributeType, setTributeType] = useState<"" | "honor" | "memory">("");
  const [tributeName, setTributeName] = useState("");
  const [tributeEmail, setTributeEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [employer, setEmployer] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grades, setGrades] = useState<SchoolGrade[]>([]);

  if (isLoading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (!campaign) return <PublicFrame><Panel><EmptyState icon={Gift} title="This donation campaign is not active" description="Ask the organization for the current giving link." /></Panel></PublicFrame>;
  if (donationResult === "success") return (
    <PublicFrame>
      <Panel className="p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-tint text-success-text"><Check className="size-6" /></span>
        <h1 className="mt-4 text-2xl font-bold">Thank you for supporting {campaign.organizationName}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {donationStatus?.status === "paid"
            ? "Your gift is confirmed. A receipt has been emailed to you."
            : donationStatusLoading || donationStatus?.status === "pending"
              ? "Your payment is being confirmed. This page updates automatically."
              : "We could not confirm this payment yet. Keep this page open or contact the organization if it does not update."}
        </p>
        {donationStatus?.receiptToken ? <Button className="mt-5" onClick={() => window.location.assign(`/receipt/${donationStatus.receiptToken}`)}>View receipt</Button> : null}
      </Panel>
    </PublicFrame>
  );
  const progress = campaign.goalCents ? Math.min(100, Math.round((campaign.raisedCents / campaign.goalCents) * 100)) : null;
  const amountCents = amount ?? Math.round(Number(custom) * 100);
  return (
    <PublicFrame>
      <div className="space-y-6">
        <section className="rounded-3xl bg-[#17130a] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#ffd700]">{campaign.organizationName}</p><h1 className="mt-2 text-3xl font-bold">{campaign.title}</h1>{campaign.description ? <p className="mt-3 text-sm leading-6 text-white/75">{campaign.description}</p> : null}{progress !== null ? <div className="mt-6"><div className="h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-[#ffd700]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm">{formatMoney(campaign.raisedCents)} raised of {formatMoney(campaign.goalCents!)} · {campaign.donorCount} families</p></div> : null}</section>
        <Panel>
          <PanelHeader title="Make a gift" description="No goods or services are provided for straight donations." />
          <form className="space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); if (!Number.isInteger(amountCents) || amountCents < 100) return; checkout.mutate({ token, draft: { donorName: name.trim(), donorEmail: email.trim(), amountCents, frequency, designation: designation || null, tributeType: tributeType || null, tributeName: tributeName.trim() || null, tributeNotifyEmail: tributeEmail.trim() || null, anonymous, employer: employer.trim() || null, coverFees, grades } }, { onSuccess: (result) => window.location.assign(result.checkoutUrl), onError: (error) => toast({ title: "Couldn't open donation checkout", description: error.message }) }); }}>
            <div className="flex flex-wrap gap-2">{campaign.suggestedAmountsCents.map((suggested) => <Button key={suggested} type="button" variant={amount === suggested ? "default" : "outline"} onClick={() => { setAmount(suggested); setCustom(""); }}>{formatMoney(suggested)}</Button>)}<Input className="w-36" inputMode="decimal" value={custom} onChange={(event) => { setCustom(event.target.value); setAmount(null); }} placeholder="Other amount" /></div>
            {campaign.monthlyEnabled ? <div className="flex gap-2"><Button type="button" variant={frequency === "one-time" ? "default" : "outline"} onClick={() => setFrequency("one-time")}>One-time</Button><Button type="button" variant={frequency === "monthly" ? "default" : "outline"} onClick={() => setFrequency("monthly")}>Monthly</Button></div> : null}
            {campaign.designations.length > 0 ? <div className="space-y-1.5"><Label htmlFor="give-designation">Designation</Label><select id="give-designation" value={designation || campaign.defaultDesignation || ""} onChange={(event) => setDesignation(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">General fund</option>{campaign.designations.map((item) => <option key={item}>{item}</option>)}</select></div> : null}
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="give-name">Donor name</Label><Input id="give-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="give-email">Email</Label><Input id="give-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">School connection (optional)</legend><div className="flex flex-wrap gap-2">{SCHOOL_GRADES.map((grade) => <label key={grade} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${grades.includes(grade) ? "border-primary bg-primary-muted font-semibold" : "border-hairline bg-background"}`}><input type="checkbox" className="sr-only" checked={grades.includes(grade)} onChange={() => setGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : current.length < 5 ? [...current, grade] : current)} />{grade}</label>)}</div><p className="text-xs text-muted-foreground">Choose up to five grades or community groups.</p></fieldset>
            <div className="grid gap-3 sm:grid-cols-3"><select value={tributeType} onChange={(event) => setTributeType(event.target.value as typeof tributeType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">No tribute</option><option value="honor">In honor of</option><option value="memory">In memory of</option></select>{tributeType ? <><Input value={tributeName} onChange={(event) => setTributeName(event.target.value)} placeholder="Tribute name" /><Input type="email" value={tributeEmail} onChange={(event) => setTributeEmail(event.target.value)} placeholder="Notification email (optional)" /></> : null}</div>
            <Input value={employer} onChange={(event) => setEmployer(event.target.value)} placeholder="Employer for matching gift (optional)" />
            <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> Give anonymously on public lists</label>{campaign.coverFeesEnabled ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={coverFees} onChange={(event) => setCoverFees(event.target.checked)} /> Cover processing and Beebizy fees so the school receives the intended gift</label> : null}</div>
            <Button type="submit" size="lg" className="w-full" disabled={checkout.isPending || amountCents < 100 || !name.trim() || !email.trim()}><HeartHandshake className="mr-2 size-5" />{checkout.isPending ? "Opening secure checkout..." : `Give ${amountCents >= 100 ? formatMoney(amountCents) : ""}${frequency === "monthly" ? " monthly" : ""}`}</Button>
            <p className="text-center text-xs text-muted-foreground">Donor-advised fund gifts may be made only where no benefits are received. Apple Pay and Google Pay appear when supported.</p>
          </form>
        </Panel>
      </div>
    </PublicFrame>
  );
}
