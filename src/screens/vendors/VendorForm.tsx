/**
 * Add a vendor to the directory.
 *
 * Deliberately short: name and category are the only things required to be useful, and
 * everything else can be filled in when it matters.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ErrorNotice, LoadingRows, Panel, PanelHeader, PageHeader } from "@/components/primitives";
import { useEvents, useCreateVendor, useUpdateVendor, useVendor } from "@/data/hooks";
import { centsFromInput } from "@/data/money";
import { useWorkspaceProfile } from "@/app/useWorkspaceProfile";
import { usePrivateEditorDraft } from "@/hooks/usePrivateEditorDraft";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { VENDOR_CATEGORIES } from "@/data/entities";

export default function VendorForm({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const {data: events} = useEvents();
  const planner = useWorkspaceProfile().kind === "planner";
  const { data: existingVendor, isLoading, isError, error, refetch } = useVendor(id ?? "");
  const query = new URLSearchParams(window.location.search);
  const formInitial={name:"",category:"Catering",description:"",contactEmail:"",contactPhone:"",website:"",city:"",state:"",eventId:query.get("eventId")?.trim()||"",cost:"",charge:"",requestId:crypto.randomUUID()};
  const {draft,state: draftState,recovery,setDraft}=usePrivateEditorDraft(`vendor-${id??(formInitial.eventId||"new")}`,formInitial);
  const field=(key:string)=>(value:string)=>setDraft({...draft,[key]:value});
  const {name="",category="Catering",description="",contactEmail="",contactPhone="",website="",city="",state="",eventId="",cost="",charge=""}=draft;
  const setName=field("name"),setCategory=field("category"),setDescription=field("description"),setContactEmail=field("contactEmail"),setContactPhone=field("contactPhone"),setWebsite=field("website"),setCity=field("city"),setState=field("state"),setEventId=field("eventId"),setCost=field("cost"),setCharge=field("charge");
  const requestedReturnTo = query.get("returnTo")?.trim() || "";
  const vendorHref = id ? `/app/vendors/${encodeURIComponent(id)}` : "/app/vendors";
  const returnTo = requestedReturnTo.startsWith("/app/") ? requestedReturnTo : vendorHref;
  const backLabel = returnTo.startsWith("/app/events/") ? "Back to event vendors" : "All vendors";
  const [touched, setTouched] = useState(false);
  const [loadedVendorId, setLoadedVendorId] = useState<string | null>(null);

  useEffect(() => {
    if (!existingVendor || loadedVendorId === existingVendor.id) return;
    recovery.setBaseline({...formInitial,name:existingVendor.name,category:existingVendor.category,description:existingVendor.description??"",contactEmail:existingVendor.contactEmail??"",contactPhone:existingVendor.contactPhone??"",website:existingVendor.website??"",city:existingVendor.city??"",state:existingVendor.state??""});
    setLoadedVendorId(existingVendor.id);
  // Loading a saved vendor must preserve a recovered unfinished form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingVendor, loadedVendorId]);

  const nameProblem = !name.trim() ? "Give the vendor a name." : undefined;

  if (id && isLoading) return <LoadingRows rows={6} />;
  if (id && isError) return <ErrorNotice error={error} title="Couldn't load this vendor" onRetry={() => void refetch()} />;
  if (id && !existingVendor) {
    return (
      <Panel className="p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">That vendor doesn't exist</h1>
        <Button asChild className="mt-4" size="sm"><Link href="/app/vendors">Back to vendors</Link></Button>
      </Panel>
    );
  }
  if (id && loadedVendorId !== id) return <LoadingRows rows={6} />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={returnTo}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {backLabel}
      </Link>

      <PageHeader
        title={id ? "Edit vendor" : "Add a vendor"}
        description={id ? "Keep the vendor's contact information and service details current." : "Choose an event to share their details with its schedule, checklist, budget and payments."}
      />

      <Panel>
        <PanelHeader title="Vendor details" />
        <form
          className="space-y-5 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            setTouched(true);
            if (nameProblem || draftState.remote) return;
            if(!id&&eventId&&[cost,...(planner?[charge]:[])].some(value=>value.trim()&&(centsFromInput(value)===null||(centsFromInput(value)??0)<0))){toast({title:"Enter a valid cost",description:"Use a nonnegative amount, or leave it blank until you have a quote."});return;}
            const expected={...draft};
            void (async () => {
              try {
                const details = {
                  name: name.trim(),
                  category,
                  description: description.trim() || null,
                  contactEmail: contactEmail.trim() || null,
                  contactPhone: contactPhone.trim() || null,
                  website: website.trim() || null,
                  city: city.trim() || null,
                  state: state.trim() || null,
                };
                const vendor = id
                  ? await updateVendor.mutateAsync({ id, patch: details })
                  : await createVendor.mutateAsync({...details,requestId:draft.requestId,eventId:eventId||null,feeCents:centsFromInput(cost),clientChargeCents:planner?centsFromInput(charge):null});
                recovery.complete(expected,formInitial);
                toast({
                  title: id ? "Vendor updated" : eventId ? "Vendor added to the event" : "Vendor added",
                  description: id
                    ? `${vendor.name}'s information is up to date.`
                    : eventId
                    ? `${vendor.name} is booked on this event and saved in your directory.`
                    : `${vendor.name} is in your directory.`,
                });
                navigate(id ? returnTo : eventId ? (requestedReturnTo || `/app/events/${eventId}/vendors`) : `/app/vendors/${vendor.id}`);
              } catch (error) {
                toast({ title: id ? "Couldn't update vendor" : "Couldn't add vendor", description: error instanceof Error ? error.message : String(error) });
              }
            })();
          }}
        >
          <GuestDraftStatus state={{...draftState,message:draftState.message.replace("guest details","vendor details").replace("guest draft","vendor draft").replace("Submit to apply these details.","Choose Add vendor or Save changes to apply them.")}} recovery={recovery}/>
          <fieldset disabled={createVendor.isPending||updateVendor.isPending} className="min-w-0 space-y-5">
          {!id ? <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4"><label className="block space-y-2 text-sm font-semibold">Add to an event<select className="block h-11 w-full rounded-lg border border-input bg-white px-3" value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Directory only: choose an event later</option>{events?.map(event=><option value={event.id} key={event.id}>{event.title}</option>)}</select></label><p className="text-xs text-muted-foreground">An event booking appears automatically in Run of Show, Checklist, Budget and Payments. A directory-only vendor is not assigned to any event.</p>{eventId?<div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Vendor cost<Input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} placeholder="0.00"/></label>{planner?<label className="space-y-1 text-sm">Client charge<Input inputMode="decimal" value={charge} onChange={e=>setCharge(e.target.value)} placeholder="0.00"/></label>:null}</div>:null}</div>:null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vendor-name">Name</Label>
              <Input
                id="vendor-name"
                value={name}
                onChange={(inputEvent) => setName(inputEvent.target.value)}
                placeholder="Golden Gate Catering"
                aria-invalid={Boolean(touched && nameProblem)}
              />
              {touched && nameProblem ? <p className="text-xs text-danger-text">{nameProblem}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="vendor-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vendor-description">What they do</Label>
            <Textarea
              id="vendor-description"
              value={description}
              onChange={(inputEvent) => setDescription(inputEvent.target.value)}
              placeholder="Plated service, cocktail receptions, full dietary tracking. 800 covers max."
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vendor-email">Email</Label>
              <Input
                id="vendor-email"
                type="email"
                value={contactEmail}
                onChange={(inputEvent) => setContactEmail(inputEvent.target.value)}
                placeholder="events@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-phone">Phone</Label>
              <Input
                id="vendor-phone"
                type="tel"
                value={contactPhone}
                onChange={(inputEvent) => setContactPhone(inputEvent.target.value)}
                placeholder="+1 415 555 0121"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor-website">Website</Label>
              <Input
                id="vendor-website"
                type="url"
                value={website}
                onChange={(inputEvent) => setWebsite(inputEvent.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vendor-city">City</Label>
                <Input
                  id="vendor-city"
                  value={city}
                  onChange={(inputEvent) => setCity(inputEvent.target.value)}
                  placeholder="San Francisco"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vendor-state">State</Label>
                <Input
                  id="vendor-state"
                  value={state}
                  onChange={(inputEvent) => setState(inputEvent.target.value)}
                  placeholder="CA"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <Button asChild variant="outline" type="button">
              <Link href={returnTo}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={createVendor.isPending || updateVendor.isPending || !!draftState.remote}>
              <Save className="mr-1.5 size-4" />
              {id ? "Save changes" : "Add vendor"}
            </Button>
          </div>
          </fieldset>
        </form>
      </Panel>
    </div>
  );
}
