/**
 * Add or edit a venue.
 *
 * One component for both, because the field set is identical and the only differences
 * are the title, the seed values and which mutation runs. Name and the owning
 * corporation are required; everything else is optional detail.
 */

import { useEffect, useState } from "react";
import { Link, useLocation as useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ErrorNotice, LoadingRows, PageHeader, Panel, PanelHeader } from "@/components/primitives";
import { useCreateLocation, useLocation, useUpdateLocation } from "@/data/hooks";

interface Fields {
  name: string;
  corporationName: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
}

const EMPTY: Fields = {
  name: "",
  corporationName: "",
  address: "",
  city: "",
  state: "",
  country: "US",
  phone: "",
};

export default function LocationForm({ id }: { id?: string }) {
  const isEdit = Boolean(id);
  const [, navigate] = useRoute();
  const { data: existing, isLoading, isError, error, refetch } = useLocation(id ?? "");
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [touched, setTouched] = useState(false);

  // Seed once the record arrives. Editing is the only path that waits on a fetch.
  useEffect(() => {
    if (!existing) return;
    setFields({
      name: existing.name,
      corporationName: existing.corporationName,
      address: existing.address ?? "",
      city: existing.city ?? "",
      state: existing.state ?? "",
      country: existing.country,
      phone: existing.phone ?? "",
    });
  }, [existing]);

  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  const nameProblem = !fields.name.trim() ? "Give the location a name." : undefined;
  const corporationProblem = !fields.corporationName.trim()
    ? "Name the corporation or organization that runs it."
    : undefined;

  const pending = createLocation.isPending || updateLocation.isPending;

  if (isEdit && isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (isEdit && isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <LoadingRows rows={5} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/app/locations"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Locations
      </Link>

      <PageHeader title={isEdit ? "Edit Location" : "Add Location"} />

      <Panel>
        <PanelHeader title="Location details" />
        <form
          className="space-y-5 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            setTouched(true);
            if (nameProblem || corporationProblem) return;

            const draft = {
              name: fields.name.trim(),
              corporationName: fields.corporationName.trim(),
              address: fields.address.trim() || null,
              city: fields.city.trim() || null,
              state: fields.state.trim() || null,
              country: fields.country.trim() || "US",
              phone: fields.phone.trim() || null,
            };

            if (isEdit && id) {
              updateLocation.mutate(
                { id, patch: draft },
                {
                  onSuccess: (location) => {
                    toast({ title: "Location updated", description: `${location.name} is up to date.` });
                    navigate(`/app/locations/${location.id}`);
                  },
                  onError: (mutationError) =>
                    toast({ title: "Couldn't update location", description: mutationError.message }),
                },
              );
              return;
            }

            createLocation.mutate(draft, {
              onSuccess: (location) => {
                toast({ title: "Location created", description: `${location.name} is ready to book events into.` });
                navigate("/app/locations");
              },
              onError: (mutationError) =>
                toast({ title: "Couldn't create location", description: mutationError.message }),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="location-name">Location Name</Label>
              <Input
                id="location-name"
                value={fields.name}
                onChange={set("name")}
                placeholder="Moscone Center West"
                aria-invalid={Boolean(touched && nameProblem)}
              />
              {touched && nameProblem ? <p className="text-xs text-danger-text">{nameProblem}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location-corporation">Corporation / Organization</Label>
              <Input
                id="location-corporation"
                value={fields.corporationName}
                onChange={set("corporationName")}
                placeholder="Northwind Systems"
                aria-invalid={Boolean(touched && corporationProblem)}
              />
              {touched && corporationProblem ? (
                <p className="text-xs text-danger-text">{corporationProblem}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-address">Address</Label>
            <Input
              id="location-address"
              value={fields.address}
              onChange={set("address")}
              placeholder="800 Howard St"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="location-city">City</Label>
              <Input id="location-city" value={fields.city} onChange={set("city")} placeholder="San Francisco" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location-state">State/Province</Label>
              <Input id="location-state" value={fields.state} onChange={set("state")} placeholder="CA" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location-country">Country</Label>
              <Input id="location-country" value={fields.country} onChange={set("country")} placeholder="US" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-phone">Phone Number</Label>
            <Input
              id="location-phone"
              type="tel"
              value={fields.phone}
              onChange={set("phone")}
              placeholder="+1 415 974 4000"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <Button asChild variant="outline" type="button">
              <Link href={isEdit && id ? `/app/locations/${id}` : "/app/locations"}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              <Save className="mr-1.5 size-4" aria-hidden="true" />
              {isEdit ? "Save changes" : "Create Location"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
