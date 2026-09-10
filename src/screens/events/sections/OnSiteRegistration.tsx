import { useState } from "react";
import { BadgeCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useRegisterWalkIn } from "@/data/hooks";
import type { Event, RegistrationWithGuest } from "@/data/entities";

interface OnSiteRegistrationProps {
  event: Event;
  station: string;
  onRegistered: (row: RegistrationWithGuest, printBadge: boolean) => void;
}

/** Registers an unexpected arrival and checks them in as one front-desk operation. */
export function OnSiteRegistration({ event, station, onRegistered }: OnSiteRegistrationProps) {
  const registerWalkIn = useRegisterWalkIn();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [organization, setOrganization] = useState("");
  const [segment, setSegment] = useState("Walk-in");
  const [printBadge, setPrintBadge] = useState(true);
  const [busy, setBusy] = useState(false);

  const atCapacity = event.capacity !== null && event.registrationCount >= event.capacity;

  const submit = async () => {
    const cleanName = name.trim();
    if (!cleanName || atCapacity) return;

    setBusy(true);
    const row = await registerWalkIn.mutateAsync({
      eventId: event.id,
      draft: {
        name: cleanName,
        contact: contact.trim(),
        segment: segment.trim() || "Walk-in",
        organization: organization.trim() || null,
        checkInStation: station.trim() || null,
        checkInNotes: "Registered on site.",
      },
    });
    onRegistered(row, printBadge);
    setName("");
    setContact("");
    setOrganization("");
    setBusy(false);
    toast({
      title: `${row.guest?.name ?? cleanName} is checked in`,
      description: station ? `Added at ${station}.` : "Added as an on-site registration.",
    });
  };

  return (
    <form
      className="space-y-3 p-4 sm:p-5"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        void submit().catch((error) => {
          setBusy(false);
          toast({
            title: "Couldn't register this guest",
            description: error instanceof Error ? error.message : undefined,
          });
        });
      }}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
          <UserPlus className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-foreground">Register a walk-in</h3>
          <p className="text-xs text-muted-foreground">Search the guest list first. If they are new, create their registration and arrival record together.</p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Input value={name} onChange={(inputEvent) => setName(inputEvent.target.value)} placeholder="Full name" aria-label="Walk-in guest name" required />
        <Input type="email" value={contact} onChange={(inputEvent) => setContact(inputEvent.target.value)} placeholder="Email" aria-label="Walk-in guest email" required />
        <Input value={organization} onChange={(inputEvent) => setOrganization(inputEvent.target.value)} placeholder="Organization (optional)" aria-label="Walk-in guest organization" />
        <Input value={segment} onChange={(inputEvent) => setSegment(inputEvent.target.value)} placeholder="Category" aria-label="Walk-in guest category" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
          <Checkbox checked={printBadge} onCheckedChange={(checked) => setPrintBadge(checked === true)} />
          Print badge after check-in
        </label>
        <Button type="submit" size="sm" disabled={!name.trim() || !contact.trim() || busy || atCapacity}>
          <BadgeCheck className="mr-1.5 size-3.5" aria-hidden="true" />
          {busy ? "Registering…" : "Register and check in"}
        </Button>
      </div>

      {atCapacity ? (
        <p className="text-xs text-warning-text">This event is at capacity. Raise the capacity in Edit before registering a walk-in.</p>
      ) : null}
    </form>
  );
}
