import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/primitives";
import type { Sponsorship } from "@/data/entities";
import { SponsorshipDialog } from "./FundraisingPanel";

export default function InvitationSponsorsEditor({
  eventId,
  sponsors,
  visible,
  onVisibilityChange,
}: {
  eventId: string;
  sponsors: Sponsorship[];
  visible: boolean;
  onVisibilityChange(value: boolean): void;
}) {
  const [editing, setEditing] = useState<{ sponsor: Sponsorship | null } | null>(null);

  return (
    <section aria-label="Invitation sponsors" className="space-y-4 rounded-xl border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Sponsors</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ sponsor: null })}>
          <Plus className="size-4" aria-hidden="true" />Add sponsor
        </Button>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Show sponsors on the RSVP page</span>
        <Switch checked={visible} onCheckedChange={onVisibilityChange} />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        Add a name and upload a logo. Confirmed sponsors appear in the guest preview and on the RSVP page. Sponsorship amounts are optional.
      </p>
      {sponsors.length ? (
        <ul className="divide-y divide-hairline">
          {sponsors.map(sponsor => (
            <li key={sponsor.id} className="flex items-center gap-3 py-3">
              {sponsor.logoUrl ? <img src={sponsor.logoUrl} alt={sponsor.companyName} className="h-12 w-20 shrink-0 rounded-lg border border-hairline bg-white object-contain p-1" /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-medium">{sponsor.companyName}</p>
                <Pill tone={sponsor.status === "confirmed" ? "success" : "neutral"}>{sponsor.status}</Pill>
              </div>
              <Button type="button" size="sm" variant="ghost" aria-label={`Edit sponsor ${sponsor.companyName}`} onClick={() => setEditing({ sponsor })}>
                <Pencil className="size-3.5" aria-hidden="true" />Edit
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No sponsors added yet.</p>}
      <p className="text-xs leading-5 text-muted-foreground">Save each sponsor in its form. Use Save invitation and continue to apply changes to sponsor visibility.</p>
      {editing ? <SponsorshipDialog eventId={eventId} sponsor={editing.sponsor} open defaultStatus="confirmed" onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
