import { useState } from "react";
import { Check, FileText, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, LoadingRows, Panel, PanelHeader } from "@/components/primitives";
import { usePublicRfp, useSubmitPublicRfp } from "@/data/hooks";
import { centsFromInput, formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";
import { PublicFrame } from "./PublicEvent";

function eventDate(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" }) : null;
}

export default function PublicRfp({ token }: { token: string }) {
  const { data, isLoading, isError } = usePublicRfp(token);
  const submit = useSubmitPublicRfp();
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [quote, setQuote] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  if (isLoading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (isError || !data) {
    return <PublicFrame><Panel><EmptyState icon={FileText} title="This proposal link is not active" description="Ask the event organizer for a fresh link." /></Panel></PublicFrame>;
  }

  const { rfp } = data;
  if (done || data.response) {
    return (
      <PublicFrame>
        <Panel className="p-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text"><Check className="size-5" /></span>
          <h1 className="mt-3 text-xl font-semibold">Proposal received</h1>
          <p className="mt-1 text-sm text-muted-foreground">Thank you, {data.vendorName}. The Beebizy team can now review your proposal for {data.eventTitle}.</p>
        </Panel>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-text">Private proposal request</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{rfp.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">For {data.eventTitle} · sent to {data.vendorName}</p>
        </div>

        <Panel>
          <PanelHeader title="Event brief" description={[rfp.targetType === "venue" ? "Venue" : rfp.vendorCategory, rfp.eventType].filter(Boolean).join(" · ")} />
          <div className="space-y-4 p-5 text-sm">
            {rfp.description ? <p className="leading-6 text-foreground">{rfp.description}</p> : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              {rfp.eventDate ? <div><dt className="text-xs font-semibold text-muted-foreground">Date and time</dt><dd>{eventDate(rfp.eventDate)}{rfp.startTime ? ` · ${rfp.startTime}${rfp.endTime ? `-${rfp.endTime}` : ""}` : ""}</dd></div> : null}
              {rfp.headcount ? <div><dt className="text-xs font-semibold text-muted-foreground"><Users className="mr-1 inline size-3.5" />Headcount</dt><dd>{rfp.headcount}</dd></div> : null}
              {rfp.location || rfp.city ? <div><dt className="text-xs font-semibold text-muted-foreground"><MapPin className="mr-1 inline size-3.5" />Location</dt><dd>{[rfp.location, rfp.city].filter(Boolean).join(", ")}</dd></div> : null}
              {rfp.budgetMinCents !== null || rfp.budgetMaxCents !== null ? <div><dt className="text-xs font-semibold text-muted-foreground">Budget guidance</dt><dd>{rfp.budgetMinCents !== null ? formatMoney(rfp.budgetMinCents) : "Open"} - {rfp.budgetMaxCents !== null ? formatMoney(rfp.budgetMaxCents) : "Open"}</dd></div> : null}
              {rfp.deadline ? <div><dt className="text-xs font-semibold text-muted-foreground">Proposal due</dt><dd>{eventDate(rfp.deadline)}</dd></div> : null}
            </dl>
            {rfp.requirements ? <div className="rounded-xl bg-surface-sunken p-4"><p className="text-xs font-semibold text-muted-foreground">Requirements</p><p className="mt-1 whitespace-pre-wrap leading-6">{rfp.requirements}</p></div> : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Submit your proposal" description="Your response goes directly into the organizer's RFP workspace" />
          <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            submit.mutate({ token, draft: {
              vendorName: data.vendorName,
              contactName: contactName.trim() || null,
              contactEmail: contactEmail.trim() || null,
              contactPhone: contactPhone.trim() || null,
              quotedAmountCents: centsFromInput(quote),
              notes: notes.trim() || null,
              status: "received",
            } }, {
              onSuccess: () => setDone(true),
              onError: (error) => toast({ title: "Couldn't submit the proposal", description: error.message }),
            });
          }}>
            <div className="space-y-1.5"><Label htmlFor="rfp-contact-name">Contact name</Label><Input id="rfp-contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="rfp-contact-email">Email</Label><Input id="rfp-contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="rfp-contact-phone">Phone</Label><Input id="rfp-contact-phone" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rfp-quote">Quoted amount</Label><Input id="rfp-quote" inputMode="decimal" value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="25,000" required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rfp-notes">Proposal details</Label><Textarea id="rfp-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={7} placeholder="Scope, inclusions, exclusions, timing and next steps…" required /></div>
            <div className="flex justify-end sm:col-span-2"><Button disabled={!contactName.trim() || !contactEmail.trim() || !quote.trim() || !notes.trim() || submit.isPending}>{submit.isPending ? "Submitting…" : "Submit proposal"}</Button></div>
          </form>
        </Panel>
      </div>
    </PublicFrame>
  );
}
