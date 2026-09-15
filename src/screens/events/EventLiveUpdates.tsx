import { useState } from "react";
import { BellRing, Clock3, Plus, Radio, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/primitives";
import { usePostTeamUpdate, useTeamUpdates } from "@/data/hooks";
import type { Event, TeamUpdateKind } from "@/data/entities";
import { usePreferences } from "@/app/preferences";
import { toast } from "@/hooks/use-toast";

const labels: Record<TeamUpdateKind, string> = { schedule: "Schedule change", "vendor-delay": "Vendor running late", general: "General update" };
const icons: Record<TeamUpdateKind, typeof Radio> = { schedule: Clock3, "vendor-delay": Truck, general: Radio };

export default function EventLiveUpdates({ event }: { event: Event }) {
  const { data } = useTeamUpdates(event.id);
  const post = usePostTeamUpdate();
  const { when } = usePreferences();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TeamUpdateKind>("schedule");
  const [message, setMessage] = useState("");
  const latest = data?.[0];
  const Icon = latest ? icons[latest.kind] : BellRing;

  const submit = async () => {
    if (!message.trim()) return;
    try {
      const created = await post.mutateAsync({ eventId: event.id, draft: { kind, message: message.trim() } });
      const delivery = created.emailDelivery;
      toast({
        title: "Live update posted",
        description: delivery
          ? `${delivery.sent} team email${delivery.sent === 1 ? "" : "s"} sent${delivery.notSent ? `; ${delivery.notSent} could not be sent` : ""}.`
          : "It is now visible to the team in Beebizy.",
      });
      setMessage("");
      setOpen(false);
    } catch (error) {
      toast({ title: "Couldn't send the update", description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-muted/35 px-4 py-3 sm:flex-row sm:items-center" aria-label="Live team updates">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        {latest ? <>
          <div className="flex flex-wrap items-center gap-2"><Pill tone="warning">Live · {labels[latest.kind]}</Pill><span className="text-xs text-muted-foreground">{when(latest.createdAt)}</span></div>
          <p className="mt-1 text-sm font-medium text-foreground">{latest.message}</p>
          {(data?.length ?? 0) > 1 ? <p className="mt-0.5 text-xs text-muted-foreground">{data!.length - 1} earlier update{data!.length === 2 ? "" : "s"} saved in event history</p> : null}
        </> : <><p className="text-sm font-semibold text-foreground">Live team updates</p><p className="text-xs text-muted-foreground">Post a schedule change or vendor delay to notify everyone in the workspace.</p></>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 size-4" />Post update</Button></DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Notify the whole team</DialogTitle><DialogDescription>The update appears live in this event and is emailed to workspace members.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Select value={kind} onValueChange={(value) => setKind(value as TeamUpdateKind)}><SelectTrigger aria-label="Update type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="The keynote starts at 10:15 AM, or Acme Catering is 20 minutes late…" maxLength={1000} rows={4} aria-label="Live update message" />
            <p className="text-xs text-muted-foreground">Keep personal or sensitive guest information out of team-wide updates.</p>
            {(data?.length ?? 0) > 0 ? (
              <div className="border-t border-hairline pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent updates</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {data!.slice(0, 10).map((update) => (
                    <li key={update.id} className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{labels[update.kind]}</span>
                        <span>{when(update.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-foreground">{update.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!message.trim() || post.isPending} onClick={() => void submit()}>{post.isPending ? "Sending…" : "Send to team"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
