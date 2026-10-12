import { useState } from "react";
import { Building2, CheckCircle2, Gift, ImagePlus, Users } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, PanelHeader } from "@/components/primitives";
import { usePublicItemIntake, useSubmitPublicItem, useUploadPublicItemImage } from "@/data/hooks";
import { centsFromInput } from "@/data/money";
import { toast } from "@/hooks/use-toast";

const DELIVERY_OPTIONS = ["Drop off at school", "Certificate emailed", "Donor contacts winner", "Pick up from donor"];
const QUICK_RESTRICTIONS = ["Weekdays only", "Blackout dates", "Not transferable", "Adults only", "Maximum guests"];

export default function PublicItemIntakePage({ token }: { token: string }) {
  const { data, isLoading } = usePublicItemIntake(token);
  const submit = useSubmitPublicItem();
  const upload = useUploadPublicItemImage();
  const [submitted, setSubmitted] = useState(false);
  const [donorKind, setDonorKind] = useState<"family" | "business">("family");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [creditText, setCreditText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [fairMarketValue, setFairMarketValue] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [restrictionFlags, setRestrictionFlags] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [notes, setNotes] = useState("");
  const [isServiceOrUse, setIsServiceOrUse] = useState(false);

  if (isLoading) return <PublicFrame><LoadingRows rows={6} /></PublicFrame>;
  if (!data) return <PublicFrame><Panel><EmptyState icon={Gift} title="This donation link is not active" description="Ask the event organizer for the current family donation link." /></Panel></PublicFrame>;
  if (submitted) return (
    <PublicFrame>
      <Panel className="p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h1 className="mt-4 text-2xl font-bold">Thank you for your donation</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Your item was sent to the {data.organizationName} review queue. A property acknowledgment is being emailed without assigning a dollar value to your donation.</p>
        <Button className="mt-5" onClick={() => { setSubmitted(false); setTitle(""); setDescription(""); setPhotos([]); }}>Submit another item</Button>
      </Panel>
    </PublicFrame>
  );

  return (
    <PublicFrame>
      <div className="space-y-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Family auction donation</p><h1 className="mt-2 text-3xl font-bold">Donate an item to {data.eventTitle}</h1><p className="mt-2 text-sm text-muted-foreground">Most families finish this form in about three minutes.</p></div>
        <form className="space-y-6" onSubmit={(event) => {
          event.preventDefault();
          const estimatedValueCents = centsFromInput(estimatedValue);
          const fairMarketValueCents = centsFromInput(fairMarketValue);
          const suggestedStartingBidCents = startingBid.trim() ? centsFromInput(startingBid) : null;
          if (estimatedValueCents == null || fairMarketValueCents == null) return;
          submit.mutate({ token, draft: {
            donorName: donorName.trim(), donorEmail: donorEmail.trim(), donorPhone: donorPhone.trim() || null,
            grades, creditText: anonymous ? "Anonymous" : creditText.trim(), anonymous, donorKind,
            companyName: donorKind === "business" ? companyName.trim() || null : null,
            website: donorKind === "business" ? website.trim() || null : null,
            logoUrl: donorKind === "business" ? logoUrl.trim() || null : null,
            itemTitle: title.trim(), description: description.trim(), photoUrls: photos, category,
            estimatedValueCents, fairMarketValueCents, restrictions: [...restrictionFlags, restrictions.trim()].filter(Boolean).join(" · ") || null,
            expirationDate: expiresAt ? new Date(`${expiresAt}T12:00:00`).toISOString() : null,
            deliveryMethod, suggestedStartingBidCents, notesToSchool: notes.trim() || null, isServiceOrUse,
          } }, {
            onSuccess: () => setSubmitted(true),
            onError: (error) => toast({ title: "Couldn't submit item", description: error.message }),
          });
        }}>
          <Panel>
            <PanelHeader title="About the donor" description="The school uses this information for acknowledgments and grade participation reports." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="flex gap-2 sm:col-span-2"><Button type="button" variant={donorKind === "family" ? "default" : "outline"} onClick={() => setDonorKind("family")}><Users className="mr-1.5 size-4" />Family</Button><Button type="button" variant={donorKind === "business" ? "default" : "outline"} onClick={() => setDonorKind("business")}><Building2 className="mr-1.5 size-4" />Business</Button></div>
              <div className="space-y-1.5"><Label htmlFor="intake-donor-name">Donor name(s)</Label><Input id="intake-donor-name" value={donorName} onChange={(event) => setDonorName(event.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-donor-email">Email</Label><Input id="intake-donor-email" type="email" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-donor-phone">Phone</Label><Input id="intake-donor-phone" type="tel" value={donorPhone} onChange={(event) => setDonorPhone(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-credit">How should we credit you?</Label><Input id="intake-credit" value={creditText} onChange={(event) => setCreditText(event.target.value)} placeholder="The Patel family" disabled={anonymous} required={!anonymous} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> Credit this donation anonymously</label>
              {donorKind === "business" ? <><div className="space-y-1.5"><Label htmlFor="intake-company">Company name</Label><Input id="intake-company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="intake-website">Website</Label><Input id="intake-website" type="url" value={website} onChange={(event) => setWebsite(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="intake-logo">Company logo</Label><div className="flex gap-2"><Input id="intake-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Logo URL or upload" /><label className="flex cursor-pointer items-center rounded-md border border-input px-3 text-xs">Upload<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; upload.mutate({ token, file }, { onSuccess: setLogoUrl, onError: (error) => toast({ title: "Couldn't upload logo", description: error.message }) }); }} /></label></div></div></> : null}
              <div className="space-y-2 sm:col-span-2"><Label>Student grade(s)</Label><div className="flex flex-wrap gap-2">{data.grades.map((grade) => <label key={grade} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${grades.includes(grade) ? "border-primary bg-primary-muted font-semibold" : "border-hairline"}`}><input type="checkbox" className="sr-only" checked={grades.includes(grade)} onChange={() => setGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade])} />{grade}</label>)}</div></div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Auction item" description="Add clear details so the school can publish the catalog without retyping them." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="intake-title">Item title</Label><Input id="intake-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="3 nights in Lake Tahoe" required /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-category">Category</Label><select id="intake-category" value={category} onChange={(event) => setCategory(event.target.value)} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose category</option>{data.categories.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="intake-description">Description and redemption details</Label><textarea id="intake-description" value={description} onChange={(event) => setDescription(event.target.value)} required className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Photos (1 to 5)</Label><div className="flex flex-wrap gap-3">{photos.map((url, index) => <div key={url} className="relative"><img src={url} alt={`Item photo ${index + 1}`} className="size-24 rounded-lg object-cover" /><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((item) => item !== url))} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-danger text-white">×</button></div>)}{photos.length < 5 ? <label className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-input bg-surface-sunken text-center text-xs text-muted-foreground"><ImagePlus className="mx-auto size-5" />{upload.isPending ? "Uploading" : "Add photo"}<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; upload.mutate({ token, file }, { onSuccess: (url) => setPhotos((current) => [...current, url]), onError: (error) => toast({ title: "Couldn't upload photo", description: error.message }) }); }} /></label> : null}</div></div>
              <div className="space-y-1.5"><Label htmlFor="intake-estimated">Estimated value</Label><Input id="intake-estimated" inputMode="decimal" value={estimatedValue} onChange={(event) => { setEstimatedValue(event.target.value); if (!fairMarketValue) setFairMarketValue(event.target.value); }} placeholder="0.00" required /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-fmv">Fair market value</Label><Input id="intake-fmv" inputMode="decimal" value={fairMarketValue} onChange={(event) => setFairMarketValue(event.target.value)} placeholder="Used for bidder tax receipts" required /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-starting">Suggested starting bid (optional)</Label><Input id="intake-starting" inputMode="decimal" value={startingBid} onChange={(event) => setStartingBid(event.target.value)} placeholder="School can override" /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-expiration">Expiration date</Label><Input id="intake-expiration" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="intake-restrictions">Restrictions, blackout dates, guests, or transfer rules</Label><div className="flex flex-wrap gap-2">{QUICK_RESTRICTIONS.map((restriction) => <label key={restriction} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${restrictionFlags.includes(restriction) ? "border-primary bg-primary-muted font-semibold" : "border-hairline"}`}><input type="checkbox" className="sr-only" checked={restrictionFlags.includes(restriction)} onChange={() => setRestrictionFlags((current) => current.includes(restriction) ? current.filter((item) => item !== restriction) : [...current, restriction])} />{restriction}</label>)}</div><Input id="intake-restrictions" value={restrictions} onChange={(event) => setRestrictions(event.target.value)} placeholder="Add specific dates, guest limits, or other details" /></div>
              <div className="space-y-1.5"><Label htmlFor="intake-delivery">Delivery method</Label><select id="intake-delivery" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose delivery</option>{DELIVERY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isServiceOrUse} onChange={(event) => setIsServiceOrUse(event.target.checked)} /> This is donated service time or use of property</label>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="intake-notes">Private notes to the school</Label><Input id="intake-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            </div>
          </Panel>
          <Button type="submit" size="lg" disabled={submit.isPending || upload.isPending || !donorName.trim() || !donorEmail.trim() || grades.length === 0 || !title.trim() || !description.trim() || photos.length === 0 || !category || !deliveryMethod}>{submit.isPending ? "Submitting item..." : "Submit auction item"}</Button>
        </form>
      </div>
    </PublicFrame>
  );
}
