import { useState } from "react";
import { Gift, ImagePlus } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { usePublicAuctionDonor, useSubmitPublicAuctionDonation, useUploadPublicAuctionDonorImage } from "@/data/hooks";
import { centsFromInput, formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";

export default function PublicAuctionDonationPage({ token }: { token: string }) {
  const { data: payload, isLoading } = usePublicAuctionDonor(token);
  const upload = useUploadPublicAuctionDonorImage();
  const submit = useSubmitPublicAuctionDonation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [value, setValue] = useState("");
  const [delivery, setDelivery] = useState("");
  const [recognition, setRecognition] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  if (isLoading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (!payload) return <PublicFrame><Panel><EmptyState icon={Gift} title="This donation link is not active" description="Ask the event organizer for a new private link." /></Panel></PublicFrame>;

  return (
    <PublicFrame>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Private donor form</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Donate an auction item</h1>
          <p className="mt-2 text-sm text-muted-foreground">{payload.eventTitle} invited {payload.donor.businessName} to submit item details.</p>
        </div>

        <Panel>
          <PanelHeader title="Item details" description="The organizer reviews every item before it appears in the public catalog." />
          <form
            className="grid gap-4 p-5 sm:grid-cols-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const fairMarketValueCents = centsFromInput(value);
              if (fairMarketValueCents === null || !imageUrl) {
                toast({ title: !imageUrl ? "Add an item photo" : "Enter the fair market value" });
                return;
              }
              submit.mutate({ token, draft: {
                title: title.trim(), description: description.trim(), imageUrl, category: category.trim(),
                restrictions: restrictions.trim() || null, expiresAt: expiresAt ? new Date(`${expiresAt}T12:00:00`).toISOString() : null,
                fairMarketValueCents, deliveryDetails: delivery.trim(), recognitionPreference: recognition.trim() || null,
              } }, {
                onSuccess: () => {
                  setTitle(""); setDescription(""); setCategory(""); setRestrictions(""); setExpiresAt("");
                  setValue(""); setDelivery(""); setImageUrl("");
                  toast({ title: "Donation submitted", description: "The organizer can now review and prepare it for the catalog." });
                },
                onError: (error) => toast({ title: "Couldn't submit donation", description: error.message }),
              });
            }}
          >
            <div className="space-y-1.5"><Label htmlFor="donation-title">Item name</Label><Input id="donation-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="donation-category">Category</Label><Input id="donation-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Travel, dining, experience…" required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="donation-description">Description</Label><textarea id="donation-description" value={description} onChange={(event) => setDescription(event.target.value)} required className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
            <div className="space-y-1.5"><Label htmlFor="donation-value">Fair market value</Label><Input id="donation-value" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0.00" inputMode="decimal" required /></div>
            <div className="space-y-1.5"><Label htmlFor="donation-expiration">Expiration date</Label><Input id="donation-expiration" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="donation-restrictions">Restrictions or blackout dates</Label><Input id="donation-restrictions" value={restrictions} onChange={(event) => setRestrictions(event.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="donation-delivery">Delivery or pickup instructions</Label><Input id="donation-delivery" value={delivery} onChange={(event) => setDelivery(event.target.value)} required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="donation-recognition">How should the donor be recognized?</Label><Input id="donation-recognition" value={recognition} onChange={(event) => setRecognition(event.target.value)} placeholder={payload.donor.businessName} /></div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Item photo</Label>
              <label className="flex min-h-28 cursor-pointer items-center justify-center rounded-xl border border-dashed border-input bg-surface-sunken p-5 text-center">
                {imageUrl ? <img src={imageUrl} alt="Donation preview" className="max-h-48 rounded-lg object-contain" /> : <span className="text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 size-6" />{upload.isPending ? "Resizing and uploading…" : "Choose a photo. Large images resize automatically."}</span>}
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  upload.mutate({ token, file }, {
                    onSuccess: setImageUrl,
                    onError: (error) => toast({ title: "Couldn't upload photo", description: error.message }),
                  });
                }} />
              </label>
            </div>
            <div className="sm:col-span-2"><Button type="submit" disabled={submit.isPending || upload.isPending || !title.trim() || !description.trim() || !category.trim() || !delivery.trim()}>{submit.isPending ? "Submitting…" : "Submit donation"}</Button></div>
          </form>
        </Panel>

        {payload.items.length > 0 ? (
          <Panel>
            <PanelHeader title="Submitted items" description="These are saved for the organizer's review." />
            <ul className="divide-y divide-hairline">{payload.items.map((item) => <li key={item.id} className="flex items-center gap-3 px-5 py-4">{item.imageUrl ? <img src={item.imageUrl} alt="" className="size-14 rounded-lg object-cover" /> : null}<div className="min-w-0 flex-1"><p className="font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.fairMarketValueCents == null ? "Value not entered" : formatMoney(item.fairMarketValueCents)}</p></div><Pill>{item.readinessStatus}</Pill></li>)}</ul>
          </Panel>
        ) : null}
      </div>
    </PublicFrame>
  );
}
