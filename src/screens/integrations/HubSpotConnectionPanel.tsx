import { Link } from "wouter";
import { ContactRound, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice, KeyValue, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useConnectHubSpot, useDisconnectHubSpot, useHubSpotStatus, useMe, useSetHubSpotContactSync, useSyncHubSpotContacts } from "@/data/hooks";
import { EMPTY_HUBSPOT_INBOUND } from "@/data/hubspotContacts";
import { toast } from "@/hooks/use-toast";

export default function HubSpotConnectionPanel() {
  const status = useHubSpotStatus(); const me = useMe();
  const connect = useConnectHubSpot(); const disconnect = useDisconnectHubSpot();
  const toggle = useSetHubSpotContactSync(); const sync = useSyncHubSpotContacts();
  const connection = status.data; const incoming = connection?.inbound ?? EMPTY_HUBSPOT_INBOUND;
  const connected = connection?.state === "connected" || connection?.state === "error";
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  const working = incoming.enabled && ["queued", "running"].includes(incoming.state);
  const failed = (error: Error) => toast({ title: "Couldn't update HubSpot sync", description: error.message });
  if (me.data?.eventScope) return null;
  return <section id="hubspot"><Panel>
    <PanelHeader title="HubSpot contacts & event emails" description="Bring your contacts into Beebizy, then choose the guests for each event." actions={connection?.isDemo ? <Pill tone="neutral">Demo contacts</Pill> : connected ? <Pill tone={connection?.state === "error" ? "warning" : "success"}>{connection?.state === "error" ? "Needs attention" : "Connected"}</Pill> : <ContactRound className="size-4 text-muted-foreground" />} />
    {status.isLoading || me.isLoading ? <LoadingRows rows={3} /> : status.isError ? <ErrorNotice error={status.error} onRetry={() => void status.refetch()} className="m-5" /> : <div className="space-y-5 p-5">
      {connection?.isDemo ? <p className="rounded-lg bg-primary-muted p-3 text-sm">This demo uses sample contacts. It does not connect to a real HubSpot account or send emails.</p> : null}
      <div className="space-y-2"><h3 className="text-sm font-semibold">1. Connect your HubSpot account</h3>
        {connected ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{connection?.isDemo ? "Sample address book ready." : `Connected to HubSpot account ${connection?.portalId}.`}</p>{!connection?.isDemo && canManage ? <Button variant="ghost" size="sm" disabled={connect.isPending} onClick={() => connect.mutate(undefined, { onSuccess: result => window.location.assign(result.authorizationUrl), onError: failed })}>Reconnect HubSpot</Button> : null}</div> : <>
          <p className="text-sm text-muted-foreground">Use the HubSpot account for your organization. An owner or admin can connect it.</p>
          <Button disabled={!canManage || !connection?.isConfigured || connect.isPending} onClick={() => connect.mutate(undefined, { onSuccess: result => window.location.assign(result.authorizationUrl), onError: error => toast({ title: "Couldn't connect HubSpot", description: error.message }) })}>{connect.isPending ? "Opening HubSpot…" : "Connect HubSpot"}</Button>
        </>}
      </div>
      {connected ? <>
        <div className="space-y-3 border-t border-hairline pt-4"><h3 className="text-sm font-semibold">2. Keep your contacts updated</h3>
          <p className="text-sm text-muted-foreground">Sync all HubSpot contacts into this workspace's address book. Changes to names, email addresses, companies and phone numbers stay updated. Your team can then choose contacts for individual events.</p>
          <dl className="grid gap-3 rounded-lg border border-hairline bg-surface-sunken/40 p-3 sm:grid-cols-3"><KeyValue label="Contacts available">{incoming.contacts}</KeyValue><KeyValue label="Import progress">{working ? `${incoming.processed} processed…` : incoming.state === "paused" && incoming.enabled ? `${incoming.processed} processed · saved` : incoming.lastSyncedAt ? "Up to date" : "Not started"}</KeyValue><KeyValue label="Last update">{incoming.lastWebhookAt || incoming.lastSyncedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(incoming.lastWebhookAt || incoming.lastSyncedAt!)) : "Waiting for first sync"}</KeyValue></dl>
          {working ? <p className="text-xs text-muted-foreground" role="status">Importing on the server. Progress is saved after each batch. You can return here to resume an interrupted import.</p> : null}
          {incoming.error ? <p className="rounded-lg border border-warning-border bg-warning-tint p-3 text-sm text-warning-text" role="alert">{incoming.error}</p> : null}
          {incoming.issues ? <p className="text-sm text-warning-text">{incoming.issues} contact{incoming.issues === 1 ? " needs" : "s need"} review. Details appear when you choose guests for an event.</p> : null}
          <div className="flex flex-wrap gap-2">
            {!incoming.enabled ? <Button disabled={!canManage || toggle.isPending} onClick={() => toggle.mutate(true, { onError: failed })}>{toggle.isPending ? "Starting…" : connection?.isDemo ? "Import sample contacts" : "Turn on contact sync"}</Button> : <>
              <Button variant="outline" disabled={!canManage || sync.isPending || working} onClick={() => sync.mutate(undefined, { onError: failed })}><RefreshCw className={`size-4 ${working || sync.isPending ? "animate-spin" : ""}`} />{working ? "Importing contacts…" : incoming.state === "paused" || incoming.state === "error" ? "Resume import" : "Sync now"}</Button>
              <Button variant="ghost" disabled={!canManage || toggle.isPending} onClick={() => toggle.mutate(false, { onError: failed })}>Pause contact updates</Button>
            </>}
          </div>
          {!canManage ? <p className="text-xs text-muted-foreground">A workspace owner or admin manages contact syncing.</p> : null}
        </div>
        <div className="space-y-2 border-t border-hairline pt-4"><h3 className="text-sm font-semibold">3. Connect your event's registration list</h3><p className="text-sm text-muted-foreground">Open your event, go to Registrations, and choose Connect a registration list. Select the HubSpot list of people registered for that event. Existing and new registrants will appear automatically, even when Beebizy is closed.</p><p className="text-xs text-muted-foreground">A list connection confirms those registrations. It does not send emails, take payments, or check anyone in. You can also choose individual contacts as pending invitations.</p><Button asChild variant="outline"><Link href="/app/events">Choose an event</Link></Button></div>
        {connection?.lastError ? <p className="text-sm text-warning-text">{connection.lastError}</p> : null}
        <div className="border-t border-hairline pt-3"><Button variant="ghost" size="sm" disabled={!canManage || disconnect.isPending} onClick={() => {
          if (!connection?.isDemo && !window.confirm("Disconnect HubSpot? Beebizy will stop syncing. Existing guests and event records stay in Beebizy.")) return;
          disconnect.mutate(undefined, { onSuccess: () => toast({ title: connection?.isDemo ? "Demo connection reset" : "HubSpot disconnected" }), onError: failed });
        }}><Unplug className="size-3.5" />{connection?.isDemo ? "Reset demo connection" : "Disconnect HubSpot"}</Button></div>
      </> : null}
    </div>}
  </Panel></section>;
}
