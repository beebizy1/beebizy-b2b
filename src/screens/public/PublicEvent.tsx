/**
 * The public face of a shared event: the agenda page and the ticket checkout.
 *
 * These render outside the app shell — no sidebar, no session — because the people using
 * them are guests, not organizers. They only ever read what the Share section promises
 * is visible: title, description, when, where, capacity, run of show, tickets on sale.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { CalendarDays, Check, HeartHandshake, MapPin, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { BrandLogo } from "@/components/BrandLogo";
import { useEventByShareToken, usePublicRegistration, usePublicVolunteerSignup, usePurchaseTickets } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { describeWhenInZone, formatClockTime, formatInZone, timeZoneLabel } from "@/lib/datetime";
import type { Event } from "@/data/entities";
import { eventDayOptions, formatEventDayLabel } from "@/data/eventDays";
import { SANTA_CLARA_REGISTRATION_SEGMENTS } from "@/data/santaClara";
import { normalizeRegistrationPage, registrationPageTemplate } from "@/data/registrationPage";

export function PublicFrame({ children, event }: { children: React.ReactNode; event?: Event }) {
  const settings = normalizeRegistrationPage(event?.registrationPage);
  const template = registrationPageTemplate(settings.template);
  const style = {
    backgroundColor: template.background,
    "--registration-accent": settings.accentColor,
  } as CSSProperties;
  return (
    <div className="min-h-dvh" style={style}>
      <header className="border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <BrandLogo size="sm" />
          {event ? <span className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: settings.accentColor }}>Registration</span> : null}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      <footer className="mx-auto max-w-4xl px-6 pb-10">
        <p className="text-xs text-muted-foreground">Event page powered by Beebizy.</p>
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

function EventHeading({ event, timeZone }: { event: Event; timeZone: string }) {
  const settings = normalizeRegistrationPage(event.registrationPage);
  return (
    <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
      {settings.heroImageUrl ? <div className="h-56 bg-cover bg-center sm:h-72" style={{ backgroundImage: `url(${settings.heroImageUrl})` }} role="img" aria-label={`${event.title} cover`} /> : null}
      <div className="space-y-4 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: settings.accentColor }}>{event.category}</span>
        <span className="text-xs font-medium text-muted-foreground">{describeWhenInZone(event.date, timeZone)}</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{settings.headline || event.title}</h1>
      {settings.welcomeMessage || event.description ? (
        <p className="max-w-2xl text-base leading-relaxed text-slate-600">{settings.welcomeMessage || event.description}</p>
      ) : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden="true" />
          <dt className="sr-only">When</dt>
         <dd>
            {formatInZone(event.date, timeZone, "full")}
            {event.endDate ? ` to ${formatInZone(event.endDate, timeZone, "full")}` : ""}{" "}
           <span className="text-muted-foreground/70">{timeZoneLabel(timeZone, new Date(event.date))}</span>
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
    </div>
  );
}

export function PublicEventPage({ token }: { token: string }) {
  // One request, and it needs no session: the agenda and the ticket types arrive with the
  // event. Fetching them through the ordinary hooks would have asked a guest for a token
  // they don't have.
  const { data: shared, isLoading, isError, error } = useEventByShareToken(token);
  const event = shared?.event ?? null;
  const agenda = shared?.agenda;
  const tickets = shared?.tickets;
  const volunteerNeeds = shared?.volunteerNeeds ?? [];
  const timeZone = shared?.timeZone ?? "UTC";

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
  const registrationPage = normalizeRegistrationPage(event.registrationPage);

  const maxScheduledDay = Math.max(1, ...(agenda ?? []).map((cue) => cue.dayNumber));
  const eventDays = eventDayOptions(event.date, event.endDate, timeZone, maxScheduledDay);

  const onSale = (tickets ?? []).filter(
    (ticket) => ticket.isActive && (ticket.quantityTotal === 0 || ticket.quantitySold < ticket.quantityTotal),
  );

  return (
    <PublicFrame event={event}>
      <div className="space-y-6">
        <EventHeading event={event} timeZone={timeZone} />

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

        <Panel className="p-5">
          <p className="text-sm font-semibold text-foreground">Register for this event</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose the guest type that best describes you.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SANTA_CLARA_REGISTRATION_SEGMENTS.map((segment) => (
              <Button key={segment} asChild variant="outline" size="sm">
                <Link href={`/e/${token}/register/${encodeURIComponent(segment)}`}>{segment}</Link>
              </Button>
            ))}
          </div>
        </Panel>

        {registrationPage.showVolunteerSignup && volunteerNeeds.length > 0 ? (
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-foreground">Volunteer schedule</p><p className="text-xs text-muted-foreground">See every planned shift and {volunteerNeeds.reduce((sum, need) => sum + (need.signupOpen ? need.openCount : 0), 0)} positions currently open for signup.</p></div>
              <Button asChild><Link href={`/e/${token}/volunteer`}><HeartHandshake className="mr-1.5 size-4" />View schedule</Link></Button>
            </div>
          </Panel>
        ) : null}

        {registrationPage.showAgenda && (agenda ?? []).length > 0 ? (
          <Panel>
            <PanelHeader title="Agenda" description={`Times shown in ${timeZoneLabel(timeZone, new Date(event.date))}, the venue\u2019s zone`} />
            {eventDays.map((day) => {
              const dayAgenda = (agenda ?? []).filter((cue) => cue.dayNumber === day.dayNumber);
              if (dayAgenda.length === 0) return null;
              return (
                <section key={day.dayNumber}>
                  {eventDays.length > 1 ? (
                    <div className="border-b border-hairline bg-surface-sunken px-5 py-2 text-xs font-semibold text-foreground">
                      {formatEventDayLabel(day)}
                    </div>
                  ) : null}
                  <ol className="divide-y divide-hairline">
                    {dayAgenda.map((cue) => (
                      <li key={cue.id} className="flex items-baseline gap-4 px-5 py-3">
                        <span data-numeric className="w-[4.5rem] shrink-0 font-mono text-xs font-semibold text-foreground">
                          {formatClockTime(cue.startTime)}
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
                </section>
              );
            })}
          </Panel>
        ) : null}
      </div>
    </PublicFrame>
  );
}

export function PublicRegistrationPage({ token, segment }: { token: string; segment: string }) {
  const { data: shared, isLoading } = useEventByShareToken(token);
  const register = usePublicRegistration();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [done, setDone] = useState(false);
  const selectedSegment = SANTA_CLARA_REGISTRATION_SEGMENTS.find((item) => item.toLowerCase() === decodeURIComponent(segment).toLowerCase());
  if (isLoading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!shared?.event || !selectedSegment) return <EventNotFound />;
  if (done) return <PublicFrame event={shared.event}><Panel className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text"><Check className="size-5" /></span><h1 className="mt-3 text-lg font-semibold text-foreground">You're registered</h1><p className="mt-1 text-sm text-muted-foreground">You are confirmed as {selectedSegment} for {shared.event.title}.</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href={`/e/${token}`}>Back to the event</Link></Button></Panel></PublicFrame>;
  const organizationLabel = selectedSegment === "Investor" ? "Firm or fund" : selectedSegment === "Student" ? "School" : "Company";
  return <PublicFrame event={shared.event}><div className="space-y-6"><div><Link href={`/e/${token}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">← {shared.event.title}</Link><h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{selectedSegment} registration</h1><p className="mt-1 text-sm text-muted-foreground">Your response will be added directly to the organizer's segmented guest list.</p></div><Panel><form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); register.mutate({ shareToken: token, draft: { name: name.trim(), email: email.trim(), organization: selectedSegment === "General" ? null : organization.trim() || null, segment: selectedSegment } }, { onSuccess: () => setDone(true), onError: (caught) => toast({ title: "Couldn't register", description: caught.message }) }); }}><label className="block space-y-1 text-sm font-medium">Full name<Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><label className="block space-y-1 text-sm font-medium">Email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} /></label>{selectedSegment !== "General" ? <label className="block space-y-1 text-sm font-medium">{organizationLabel}<Input value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} placeholder="Optional" /></label> : null}<Button type="submit" disabled={!name.trim() || !email.trim() || register.isPending}>{register.isPending ? "Registering…" : `Register as ${selectedSegment}`}</Button></form></Panel></div></PublicFrame>;
}

export function PublicVolunteerSignupPage({ token }: { token: string }) {
  const { data: shared, isLoading } = useEventByShareToken(token);
  const signup = usePublicVolunteerSignup();
  const [needId, setNeedId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const schedule = shared?.volunteerNeeds ?? [];
  const openings = schedule.filter((need) => need.signupOpen && need.openCount > 0);
  const selected = openings.find((need) => need.id === needId);
  if (isLoading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!shared?.event) return <EventNotFound />;
  if (done && selected) return <PublicFrame event={shared.event}><Panel className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text"><Check className="size-5" /></span><h1 className="mt-3 text-lg font-semibold text-foreground">Your shift is confirmed</h1><p className="mt-1 text-sm text-muted-foreground">{selected.role}, {selected.startTime}–{selected.endTime}. The organizer can now see you in the staffing plan.</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href={`/e/${token}`}>Back to the event</Link></Button></Panel></PublicFrame>;
  return (
    <PublicFrame event={shared.event}>
      <div className="space-y-6">
        <div>
          <Link href={`/e/${token}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">← {shared.event.title}</Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Volunteer schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">See every planned shift. Open shifts can be selected below.</p>
        </div>
        {schedule.length === 0 ? (
          <Panel><EmptyState icon={HeartHandshake} title="No volunteer shifts yet" description="The organizer has not published a volunteer schedule." /></Panel>
        ) : (
          <Panel>
            <PanelHeader title="Event shifts" />
            <ul className="divide-y divide-hairline">
              {schedule.map((need) => {
                const canJoin = need.signupOpen && need.openCount > 0;
                return (
                  <li key={need.id}>
                    <label className={cn("flex items-start gap-3 px-5 py-4", canJoin && "cursor-pointer hover:bg-accent/60", needId === need.id && "bg-primary-muted/60")}>
                      <input type="radio" name="need" value={need.id} checked={needId === need.id} onChange={() => setNeedId(need.id)} className="mt-1" disabled={!canJoin} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{need.role}</span>
                        <span className="block text-xs text-muted-foreground">{need.startTime}–{need.endTime} · {canJoin ? `${need.openCount} ${need.openCount === 1 ? "position" : "positions"} open` : need.isFull ? "Fully staffed" : "Signup closed"}{need.notes ? ` · ${need.notes}` : ""}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
        {openings.length === 0 ? (
          <Panel><EmptyState icon={HeartHandshake} title="No open volunteer positions" description="The complete schedule is shown above, but the organizer does not have any positions open for signup right now." /></Panel>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (!selected) return; signup.mutate({ shareToken: token, draft: { needId: selected.id, name: name.trim(), email: email.trim(), phone: phone.trim() || null } }, { onSuccess: () => setDone(true), onError: (caught) => toast({ title: "Couldn't sign up", description: caught.message }) }); }}>
            <Panel className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Full name<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">Email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label className="space-y-1 text-sm font-medium">Phone<Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" /></label>
              <div className="flex items-end"><Button className="w-full" disabled={!selected || !name.trim() || !email.trim() || signup.isPending}>{signup.isPending ? "Confirming…" : "Confirm volunteer shift"}</Button></div>
            </Panel>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}

export function PublicTicketsPage({ token }: { token: string }) {
  const { data: shared, isLoading } = useEventByShareToken(token);
  const event = shared?.event ?? null;
  const tickets = shared?.tickets;
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
      <PublicFrame event={event}>
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
    <PublicFrame event={event}>
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
