import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice, LoadingRows, Panel, Pill } from "@/components/primitives";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { useHubSpotEventSource, useHubSpotRegistrationLists, useHubSpotStatus, useMe, useSetHubSpotEventSource } from "@/data/hooks";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import { toast } from "@/hooks/use-toast";

export default function HubSpotEventSourcePanel({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const me = useMe();
  const connection = useHubSpotStatus();
  const available = Boolean(me.data && !me.data.eventScope && connection.data?.inbound?.enabled);
  const source = useHubSpotEventSource(eventId, available);
  const update = useSetHubSpotEventSource();
  const [open, setOpen] = useState(false);
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(eventId, "hubspot-registration-list", { listId: "", listName: "", search: "", offset: "0" });
  const offset = Math.max(0, Number(draft.offset) || 0);
  const lists = useHubSpotRegistrationLists(draft.search ?? "", offset, open && available);
  const row = source.data;
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  const failed = (error: Error) => toast({ title: "Couldn't update automatic registration sync", description: error.message });
  if (!me.data || me.data.eventScope) return null;
  const busy = update.isPending || Boolean(state.remote);
  return <Panel>
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-muted"><Link2 className="size-5" /></span>
          <div><h2 className="font-semibold">Automatically sync registrations from HubSpot</h2><p className="mt-1 text-sm text-muted-foreground">Connect this event's registration list once. New registrations keep appearing here.</p></div>
        </div>
        {row ? <Pill tone={row.error ? "warning" : row.enabled ? "success" : "neutral"}>{row.error ? "Needs attention" : row.enabled ? "Automatic sync on" : "Paused"}</Pill> : null}
      </div>
      {available ? source.isLoading ? <LoadingRows rows={1} /> : source.isError ? <ErrorNotice error={source.error} onRetry={() => void source.refetch()} /> : <>
        {row ? <div className="rounded-lg border border-hairline p-4">
          <p className="text-sm font-semibold">{row.listName} → {eventTitle}</p>
          <p className="mt-2 text-sm"><CheckCircle2 className="mr-1.5 inline size-4 text-success-text" />{row.registrations} registrations synced</p>
          <p className="mt-1 text-xs text-muted-foreground" role="status">{row.state === "queued" || row.state === "syncing" ? "Checking the registration list…" : row.lastSyncedAt ? `Last checked ${new Date(row.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Waiting for the first sync."} {row.enabled ? "Checks run in the background about every minute, even when Beebizy is closed. HubSpot processing can add a delay." : "Existing guest records stay in this event."}</p>
          {row.error ? <p className="mt-2 text-sm text-warning-text" role="alert">{row.error}</p> : null}
        </div> : <p className="text-sm text-muted-foreground">For example, connect “Demo Day registrations” to bring in all 200 attendees. The next person who registers in HubSpot will join this event automatically.</p>}
        {canManage ? <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} disabled={update.isPending}>{row ? "Change registration list" : "Connect a registration list"}</Button>
          {row?.error ? <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ eventId, listId: row.listId, enabled: true }, { onError: failed })}><RefreshCw className="size-4" />Retry sync</Button> : null}
          {row ? <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ eventId, listId: row.listId, enabled: !row.enabled }, { onError: failed })}>{row.enabled ? "Pause automatic sync" : "Resume automatic sync"}</Button> : null}
        </div> : <p className="text-xs text-muted-foreground">A workspace owner or admin connects the registration list.</p>}
      </> : <Button asChild variant="outline"><Link href="/app/settings#hubspot">Set up HubSpot in Settings</Link></Button>}
      <p className="text-xs text-muted-foreground">Use a list of registered attendees, rather than everyone in your CRM. New attendees are marked confirmed. Emails, payments and check-in happen only when you choose.</p>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Connect a registration list</DialogTitle><DialogDescription>Choose the HubSpot list for <strong>{eventTitle}</strong>. Everyone on it will appear in this event, and new registrations will sync automatically.</DialogDescription></DialogHeader>
      <Label htmlFor="hubspot-list-search">Find your registration list</Label>
      <Input id="hubspot-list-search" value={draft.search ?? ""} onChange={e => setDraft(current => ({ ...current, search: e.target.value, offset: "0" }))} placeholder="For example, Demo Day registrations" />
      {lists.isLoading ? <LoadingRows rows={3} /> : lists.isError ? <><ErrorNotice error={lists.error} onRetry={() => void lists.refetch()} /><Button asChild variant="outline"><Link href="/app/settings#hubspot">Open HubSpot settings to reconnect</Link></Button></> : <div className="max-h-72 space-y-2 overflow-y-auto">
        {(lists.data?.lists ?? []).map(list => <label key={list.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-hairline p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-muted">
          <input type="radio" name="hubspot-registration-list" value={list.id} checked={draft.listId === list.id} onChange={() => setDraft(current => ({ ...current, listId: list.id, listName: list.name }))} />
          <span className="min-w-0 flex-1 break-words text-sm font-medium">{list.name}</span><span className="shrink-0 text-xs text-muted-foreground">{list.size === null ? "Contact list" : `${list.size} contacts`}</span>
        </label>)}
        {!lists.data?.lists.length ? <p className="text-sm text-muted-foreground">No contact lists found on this page. Create a registration list in HubSpot, or try another search.</p> : null}
      </div>}
      <div className="flex gap-2">{offset > 0 ? <Button variant="ghost" size="sm" onClick={() => setDraft(current => ({ ...current, offset: String(Math.max(0, offset - 100)) }))}>Previous lists</Button> : null}{lists.data?.nextOffset !== null && lists.data?.nextOffset !== undefined ? <Button variant="ghost" size="sm" onClick={() => setDraft(current => ({ ...current, offset: String(lists.data!.nextOffset) }))}>More lists</Button> : null}</div>
      <GuestDraftStatus state={state} recovery={recovery} />
      {draft.listId ? <p className="text-sm">Connect <strong>{draft.listName}</strong> to <strong>{eventTitle}</strong>.</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Keep draft and close</Button><Button disabled={!draft.listId || busy || lists.isError} onClick={() => {
        const submitted = { ...draft };
        update.mutate({ eventId, listId: draft.listId!, enabled: true }, { onError: failed, onSuccess: result => {
          recovery.complete(submitted); setOpen(false);
          toast({ title: result?.error ? "Registration list saved. Sync needs attention." : "Automatic registration sync is on", description: result?.error ?? "Existing and new registrants will appear here without selecting people again." });
        } });
      }}>{update.isPending ? "Connecting…" : "Connect list & sync registrations"}</Button></div>
    </DialogContent></Dialog>
  </Panel>;
}
