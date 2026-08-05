/**
 * The public face of a shared event: the agenda page and the ticket checkout.
 *
 * These render outside the app shell — no sidebar, no session — because the people using
 * them are guests, not organizers. They only ever read what the Share section promises
 * is visible: title, description, when, where, capacity, run of show, tickets on sale.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, Check, MapPin, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { BrandLogo } from "@/components/BrandLogo";
import { useEventByShareToken, usePurchaseTickets, useRunOfShow, useTickets } from "@/data/hooks";
import { describeWhen } from "@/data/derive";
import { formatMoney } from "@/data/money";
import type { Event } from "@/data/entities";

function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="honeycomb border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-5">
          <BrandLogo size="sm" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-6 pb-10">
        <p className="text-xs text-muted-foreground">
          Event page powered by Beebizy. <Link href="/" className="underline hover:text-foreground">What's this?</Link>
        </p>
      </footer>
    </div>
  );
}

function EventNotFound() {
  return (
    <PublicFrame>
      <Panel>
        <EmptyState
          icon={CalendarDays}
          title="This link isn't active"
          description="The organizer may have turned sharing off, or the event may have been deleted."
        />
      </Panel>
    </PublicFrame>
  );
}

function EventHeading({ event }: { event: Event }) {
  const start = new Date(event.date);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">{event.category}</Pill>
        <span className="text-xs font-medium text-muted-foreground">{describeWhen(event.date)}</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{event.title}</h1>
      {event.description ? (
        <p className="text-base leading-relaxed text-muted-foreground">{event.description}</p>
      ) : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden="true" />
          <dt className="sr-only">When</dt>
          <dd>
            {start.toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
          </dd>
        </div>
        {event.locationRecord || event.location ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            <dt className="sr-only">Where</dt>
            <dd>
              {event.locationRecord
                ? [event.locationRecord.name, event.locationRecord.city].filter(Boolean).join(", ")
                : event.location}
            </dd>
          </div>
        ) : null}
        {event.capacity ? (
          <div className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            <dt className="sr-only">Capacity</dt>
            <dd data-numeric>{event.capacity} places</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function PublicEventPage({ token }: { token: string }) {
  const { data: event, isLoading, isError, error } = useEventByShareToken(token);
  const { data: agenda } = useRunOfShow(event?.id ?? "");
  const { data: tickets } = useTickets(event?.id ?? "");

  if (isLoading) {
    return (
      <PublicFrame>
        <LoadingRows rows={5} />
      </PublicFrame>
    );
  }
  if (isError) {
    return (
      <PublicFrame>
        <ErrorNotice error={error} title="Couldn't load this event" />
      </PublicFrame>
    );
  }
  if (!event) return <EventNotFound />;

  const onSale = (tickets ?? []).filter(
    (ticket) => ticket.isActive && (ticket.quantityTotal === 0 || ticket.quantitySold < ticket.quantityTotal),
  );

  return (
    <PublicFrame>
      <div className="space-y-6">
        <EventHeading event={event} />

        {onSale.length > 0 ? (
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Tickets are on sale</p>
                <p className="text-xs text-muted-foreground">
                  From {formatMoney(Math.min(...onSale.map((ticket) => ticket.priceCents)))}
                </p>
              </div>
              <Button asChild>
                <Link href={`/e/${token}/tickets`}>
                  <Ticket className="mr-1.5 size-4" />
                  Get tickets
                </Link>
              </Button>
            </div>
          </Panel>
        ) : null}

        {(agenda ?? []).length > 0 ? (
          <Panel>
            <PanelHeader title="Agenda" description="Times are local to the venue" />
            <ol className="divide-y divide-hairline">
              {(agenda ?? []).map((cue) => (
                <li key={cue.id} className="flex items-baseline gap-4 px-5 py-3">
                  <span data-numeric className="w-14 shrink-0 font-mono text-xs font-semibold text-foreground">
                    {cue.startTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{cue.title}</span>
                    {cue.description ? (
                      <span className="block text-xs text-muted-foreground">{cue.description}</span>
                    ) : null}
                  </span>
                  {cue.duration ? (
                    <span data-numeric className="shrink-0 text-xs text-muted-foreground">
                      {cue.duration}m
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}
      </div>
    </PublicFrame>
  );
}

export function PublicTicketsPage({ token }: { token: string }) {
  const { data: event, isLoading } = useEventByShareToken(token);
  const { data: tickets } = useTickets(event?.id ?? "");
  const purchase = usePurchaseTickets();

  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [done, setDone] = useState(false);

  const onSale = useMemo(
    () => (tickets ?? []).filter((ticket) => ticket.isActive),
    [tickets],
  );
  const chosen = onSale.find((ticket) => ticket.id === selected) ?? null;
  const remaining = chosen === null ? null : chosen.quantityTotal === 0 ? null : chosen.quantityTotal - chosen.quantitySold;

  if (isLoading) {
    return (
      <PublicFrame>
        <LoadingRows rows={4} />
      </PublicFrame>
    );
  }
  if (!event) return <EventNotFound />;

  if (done) {
    return (
      <PublicFrame>
        <Panel className="p-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text">
            <Check className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-foreground">You're registered</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {quantity} {quantity === 1 ? "ticket" : "tickets"} for {event.title}. A confirmation goes to {contact}.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/e/${token}`}>Back to the event</Link>
          </Button>
        </Panel>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <div className="space-y-6">
        <div>
          <Link href={`/e/${token}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            ← {event.title}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Get tickets</h1>
        </div>

        {onSale.length === 0 ? (
          <Panel>
            <EmptyState icon={Ticket} title="Nothing on sale" description="The organizer hasn't opened ticket sales yet." />
          </Panel>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              if (!chosen || !name.trim() || !contact.trim()) return;
              purchase.mutate(
                {
                  shareToken: token,
                  ticketTypeId: chosen.id,
                  name: name.trim(),
                  contact: contact.trim(),
                  quantity,
                },
                {
                  onSuccess: () => setDone(true),
                  onError: (error) => toast({ title: "Couldn't complete", description: error.message }),
                },
              );
            }}
          >
            <Panel>
              <PanelHeader title="Choose a ticket" />
              <ul className="divide-y divide-hairline">
                {onSale.map((ticket) => {
                  const left = ticket.quantityTotal === 0 ? null : ticket.quantityTotal - ticket.quantitySold;
                  const soldOut = left !== null && left <= 0;
                  return (
                    <li key={ticket.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors",
                          soldOut ? "cursor-not-allowed opacity-55" : "hover:bg-accent/60",
                          selected === ticket.id ? "bg-primary-muted/60" : "",
                        )}
                      >
                        <input
                          type="radio"
                          name="ticketType"
                          value={ticket.id}
                          disabled={soldOut}
                          checked={selected === ticket.id}
                          onChange={() => {
                            setSelected(ticket.id);
                            setQuantity(1);
                          }}
                          className="mt-1 size-4 accent-[hsl(var(--primary))]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{ticket.name}</span>
                            {soldOut ? <Pill tone="warning">sold out</Pill> : null}
                          </span>
                          {ticket.description ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">{ticket.description}</span>
                          ) : null}
                          {left !== null && !soldOut ? (
                            <span data-numeric className="mt-0.5 block text-xs text-muted-foreground">
                              {left} left
                            </span>
                          ) : null}
                        </span>
                        <span data-numeric className="shrink-0 text-sm font-semibold text-foreground">
                          {ticket.priceCents === 0 ? "Free" : formatMoney(ticket.priceCents)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Your details" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-name">Full name</Label>
                  <Input
                    id="buyer-name"
                    value={name}
                    onChange={(inputEvent) => setName(inputEvent.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-email">Email</Label>
                  <Input
                    id="buyer-email"
                    type="email"
                    value={contact}
                    onChange={(inputEvent) => setContact(inputEvent.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-quantity">How many</Label>
                  <Input
                    id="buyer-quantity"
                    type="number"
                    min={1}
                    max={remaining ?? undefined}
                    value={quantity}
                    onChange={(inputEvent) => setQuantity(Math.max(1, Number.parseInt(inputEvent.target.value, 10) || 1))}
                  />
                  {remaining !== null ? (
                    <p data-numeric className="text-xs text-muted-foreground">
                      {remaining} available
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  Total{" "}
                  <span data-numeric className="text-base font-semibold text-foreground">
                    {chosen ? formatMoney(chosen.priceCents * quantity) : formatMoney(0)}
                  </span>
                </p>
                <Button type="submit" disabled={!chosen || !name.trim() || !contact.trim() || purchase.isPending}>
                  <Ticket className="mr-1.5 size-4" />
                  Confirm
                </Button>
              </div>
            </Panel>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}
