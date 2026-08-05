/**
 * Share: the public face of the event.
 *
 * The old share dialog handed out a link without ever saying what it exposed. This
 * screen states exactly what a stranger with the link can see, because that is a
 * privacy decision and not a detail.
 */

import { useState } from "react";
import { Check, Copy, ExternalLink, Eye, Globe, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { EmptyState, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useShareEvent, useTickets } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import type { Event } from "@/data/entities";

function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function CopyRow({ label, url, hint }: { label: string; url: string; hint: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some embedded browsers; the input is selectable as a fallback.
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually." });
    }
  };

  return (
    <div className="space-y-1.5 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={`${label} URL`}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-sunken px-3 py-2 font-mono text-xs text-foreground"
        />
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check className="mr-1.5 size-3.5 text-success-text" /> : <Copy className="mr-1.5 size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}>
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export default function ShareSection({ event }: { event: Event }) {
  const share = useShareEvent();
  const { data: tickets } = useTickets(event.id);

  const onSale = (tickets ?? []).filter((ticket) => ticket.isActive);

  if (!event.shareToken) {
    return (
      <Panel>
        <PanelHeader title="Public page" description="Off by default — nothing about this event is public" />
        <EmptyState
          icon={Globe}
          title="This event isn't shared"
          description="Turning sharing on creates one link that shows the agenda and, if you have ticket types on sale, lets people buy. You can see exactly what's exposed before you send it."
          action={
            <Button
              disabled={share.isPending}
              onClick={() =>
                share.mutate(
                  { id: event.id },
                  {
                    onSuccess: () => toast({ title: "Public page created", description: "Copy the link below to share it." }),
                    onError: (error) => toast({ title: "Couldn't create link", description: error.message }),
                  },
                )
              }
            >
              <Globe className="mr-1.5 size-4" />
              Turn on sharing
            </Button>
          }
        />
      </Panel>
    );
  }

  const eventUrl = absoluteUrl(`/e/${event.shareToken}`);
  const ticketUrl = absoluteUrl(`/e/${event.shareToken}/tickets`);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Links"
            description="Anyone with these can view without signing in"
            actions={<Pill tone="success">Sharing on</Pill>}
          />
          <div className="divide-y divide-hairline">
            <CopyRow label="Event page" url={eventUrl} hint="Agenda and details" />
            {onSale.length > 0 ? (
              <CopyRow label="Ticket checkout" url={ticketUrl} hint={`${onSale.length} type${onSale.length === 1 ? "" : "s"} on sale`} />
            ) : null}
          </div>
          {onSale.length === 0 ? (
            <p className="border-t border-hairline px-5 py-3 text-xs text-muted-foreground">
              No ticket types are on sale, so the checkout link is hidden. Add one in Money to start selling.
            </p>
          ) : null}
        </Panel>

        {onSale.length > 0 ? (
          <Panel>
            <PanelHeader title="What buyers see" description="Live prices and remaining allocation" />
            <ul className="divide-y divide-hairline">
              {onSale.map((ticket) => {
                const remaining = ticket.quantityTotal === 0 ? null : ticket.quantityTotal - ticket.quantitySold;
                return (
                  <li key={ticket.id} className="flex items-center gap-3 px-5 py-3">
                    <Ticket className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{ticket.name}</p>
                      {ticket.description ? (
                        <p className="truncate text-xs text-muted-foreground">{ticket.description}</p>
                      ) : null}
                    </div>
                    <span data-numeric className="text-sm font-semibold text-foreground">
                      {formatMoney(ticket.priceCents)}
                    </span>
                    <span data-numeric className="w-24 text-right text-xs text-muted-foreground">
                      {remaining === null ? "unlimited" : remaining <= 0 ? "sold out" : `${remaining} left`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <PanelHeader title="What the link exposes" description="Be deliberate before you send it" />
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden="true" />
            <p className="text-foreground">
              <span className="font-medium">Visible:</span> title, description, date, venue, capacity, the run of show, and
              any ticket types on sale.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden="true" />
            <p className="text-foreground">
              <span className="font-medium">Never visible:</span> your budget, vendor fees, guest list, guest contact
              details, sponsorship amounts and auction bids.
            </p>
          </div>
          <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">
            Buying a ticket through this link creates a confirmed registration and adds the buyer to your people list.
          </p>
        </div>
      </Panel>
    </div>
  );
}
