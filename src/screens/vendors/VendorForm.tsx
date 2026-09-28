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
import { useAddEventVendor, useCreateVendor, useUpdateVendor, useVendor } from "@/data/hooks";
import { VENDOR_CATEGORIES } from "@/data/entities";

export default function VendorForm({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const addEventVendor = useAddEventVendor();
  const { data: existingVendor, isLoading, isError, error, refetch } = useVendor(id ?? "");
  const query = new URLSearchParams(window.location.search);
  const eventId = query.get("eventId")?.trim() || null;
  const requestedReturnTo = query.get("returnTo")?.trim() || "";
  const vendorHref = id ? `/app/vendors/${encodeURIComponent(id)}` : "/app/vendors";
  const returnTo = requestedReturnTo.startsWith("/app/") ? requestedReturnTo : vendorHref;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Catering");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [touched, setTouched] = useState(false);
  const [loadedVendorId, setLoadedVendorId] = useState<string | null>(null);

  useEffect(() => {
    if (!existingVendor || loadedVendorId === existingVendor.id) return;
    setName(existingVendor.name);
    setCategory(existingVendor.category);
    setDescription(existingVendor.description ?? "");
    setContactEmail(existingVendor.contactEmail ?? "");
    setContactPhone(existingVendor.contactPhone ?? "");
    setWebsite(existingVendor.website ?? "");
    setCity(existingVendor.city ?? "");
    setState(existingVendor.state ?? "");
    setLoadedVendorId(existingVendor.id);
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
        All vendors
      </Link>

      <PageHeader
        title={id ? "Edit vendor" : "Add a vendor"}
        description={id ? "Keep the vendor's contact information and service details current." : "They go into your directory, ready to book onto any event."}
      />

      <Panel>
        <PanelHeader title="Vendor details" />
        <form
          className="space-y-5 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            setTouched(true);
            if (nameProblem) return;
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
                  : await createVendor.mutateAsync(details);
                if (!id && eventId) await addEventVendor.mutateAsync({ eventId, draft: { vendorId: vendor.id } });
                toast({
                  title: id ? "Vendor updated" : eventId ? "Vendor added to the event" : "Vendor added",
                  description: id
                    ? `${vendor.name}'s information is up to date.`
                    : eventId
                    ? `${vendor.name} is booked on this event and saved in your directory.`
                    : `${vendor.name} is in your directory.`,
                });
                navigate(id ? vendorHref : eventId ? returnTo : `/app/vendors/${vendor.id}`);
              } catch (error) {
                toast({ title: id ? "Couldn't update vendor" : "Couldn't add vendor", description: error instanceof Error ? error.message : String(error) });
              }
            })();
          }}
        >
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
            <Button type="submit" disabled={createVendor.isPending || updateVendor.isPending || addEventVendor.isPending}>
              <Save className="mr-1.5 size-4" />
              {id ? "Save changes" : "Add vendor"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
