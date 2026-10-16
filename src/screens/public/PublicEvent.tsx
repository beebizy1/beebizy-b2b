/**
 * The public face of a shared event: the agenda page and the ticket checkout.
 *
 * These render outside the app shell — no sidebar, no session — because the people using
 * them are guests, not organizers. They only ever read what the Share section promises
 * is visible: title, description, when, where, capacity, run of show, tickets on sale.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { CalendarDays, Check, ExternalLink, Gavel, HeartHandshake, MapPin, Minus, Plus, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { BrandLogo } from "@/components/BrandLogo";
import { useEventByShareToken, usePublicRegistration, usePublicTicketOrderStatus, usePublicVolunteerSignup, usePurchaseTickets } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { describeWhenInZone, formatClockTime, formatInZone, timeZoneLabel } from "@/lib/datetime";
import { SCHOOL_GRADES, type Event, type PublicRegistrationResult, type SchoolGrade } from "@/data/entities";
import { normalizeAuctionPageSettings } from "@/data/auctionSettings";
import { eventDayOptions, formatEventDayLabel } from "@/data/eventDays";
import { normalizeRegistrationPage, registrationPageTemplate } from "@/data/registrationPage";

export function PublicFrame({ children, event }: { children: React.ReactNode; event?: Event }) {
  const settings = normalizeRegistrationPage(event?.registrationPage);
  const template = registrationPageTemplate(settings.template);
  const style = { backgroundColor: template.background } as CSSProperties;
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
  const auctionPage = normalizeAuctionPageSettings(event.auctionPage);
  const bidderExperienceOpen = Boolean(event.auctionPublicToken) && (auctionPage.registrationOpen || auctionPage.catalogPublished);

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
                {registrationPage.paymentUrl ? (
                  <a href={registrationPage.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 size-4" />Buy tickets
                  </a>
                ) : (
                  <Link href={`/e/${token}/tickets`}>
                    <Ticket className="mr-1.5 size-4" />Get tickets
                  </Link>
                )}
              </Button>
            </div>
          </Panel>
        ) : null}

        {registrationPage.paymentUrl && onSale.length === 0 ? (
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Payment required</p>
                <p className="text-xs text-muted-foreground">Registration is tracked here. Payment opens in the organizer's secure checkout.</p>
              </div>
              <Button asChild variant="outline">
                <a href={registrationPage.paymentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 size-4" />Continue to payment
                </a>
              </Button>
            </div>
          </Panel>
        ) : null}

        {bidderExperienceOpen && event.auctionPublicToken ? (
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{auctionPage.catalogPublished ? "Auction and mobile bidding" : "Bidder registration is open"}</p>
                <p className="text-xs text-muted-foreground">{auctionPage.catalogPublished ? "Browse auction items, save favorites, get a paddle, and bid from your phone." : "Get your paddle now. Auction items will appear here when the organizer publishes the catalog."}</p>
              </div>
              <Button asChild>
                <Link href={`/auction/${event.auctionPublicToken}`}>
                  <Gavel className="mr-1.5 size-4" />{auctionPage.catalogPublished ? "Open auction" : "Get a bidder paddle"}
                </Link>
              </Button>
            </div>
          </Panel>
        ) : null}

        <Panel className="p-5">
          <p className="text-sm font-semibold text-foreground">Register for this event</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose the guest type that best describes you.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {registrationPage.registrationTypes.map((segment) => (
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
  const [result, setResult] = useState<PublicRegistrationResult | null>(null);
  const settings = normalizeRegistrationPage(shared?.event?.registrationPage);
  const selectedSegment = settings.registrationTypes.find((item) => item.toLowerCase() === decodeURIComponent(segment).toLowerCase());
  if (isLoading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!shared?.event || !selectedSegment) return <EventNotFound />;
  if (result) return <PublicFrame event={shared.event}><Panel className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text"><Check className="size-5" /></span><h1 className="mt-3 text-lg font-semibold text-foreground">You're registered</h1><p className="mt-1 text-sm text-muted-foreground">You are confirmed as {selectedSegment} for {shared.event.title}.</p><p className="mt-3 text-sm text-muted-foreground">{result.confirmationEmailStatus === "sent" ? `A confirmation email was sent to ${email.trim()}.` : `Your place is confirmed, but we could not send the confirmation email to ${email.trim()}. Please save this event link.`}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{settings.paymentUrl ? <Button asChild size="sm"><a href={settings.paymentUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 size-4" />Continue to payment</a></Button> : null}<Button asChild variant="outline" size="sm"><Link href={`/e/${token}`}>Back to the event</Link></Button></div></Panel></PublicFrame>;
  return <PublicFrame event={shared.event}><div className="space-y-6"><div><Link href={`/e/${token}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">← {shared.event.title}</Link><h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{selectedSegment} registration</h1><p className="mt-1 text-sm text-muted-foreground">Your response will be added directly to the organizer's segmented guest list.</p></div><Panel><form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); register.mutate({ shareToken: token, draft: { name: name.trim(), email: email.trim(), organization: settings.collectOrganization ? organization.trim() || null : null, segment: selectedSegment } }, { onSuccess: setResult, onError: (caught) => toast({ title: "Couldn't register", description: caught.message }) }); }}><label className="block space-y-1 text-sm font-medium">Full name<Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><label className="block space-y-1 text-sm font-medium">Email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} /></label>{settings.collectOrganization ? <label className="block space-y-1 text-sm font-medium">Company, school, or organization <span className="font-normal text-muted-foreground">(optional)</span><Input value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} placeholder="Example: Cedar Grove School or Acme Inc." /><span className="block text-xs font-normal text-muted-foreground">This helps the event organizer understand who you are attending with. Leave it blank if it does not apply.</span></label> : null}<Button type="submit" disabled={!name.trim() || !email.trim() || register.isPending}>{register.isPending ? "Registering…" : `Register as ${selectedSegment}`}</Button></form></Panel></div></PublicFrame>;
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
  const multiDay = schedule.some((need) => need.dayNumber > 1);
  const openings = schedule.filter((need) => need.signupOpen && need.openCount > 0);
  const selected = openings.find((need) => need.id === needId);
  if (isLoading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!shared?.event || !normalizeRegistrationPage(shared.event.registrationPage).showVolunteerSignup) return <EventNotFound />;
  if (done && selected) return <PublicFrame event={shared.event}><Panel className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text"><Check className="size-5" /></span><h1 className="mt-3 text-lg font-semibold text-foreground">Your shift is confirmed</h1><p className="mt-1 text-sm text-muted-foreground">{selected.role}, {multiDay ? `Day ${selected.dayNumber}, ` : ""}{selected.startTime}–{selected.endTime}. The organizer can now see you in the staffing plan.</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href={`/e/${token}`}>Back to the event</Link></Button></Panel></PublicFrame>;
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
                        <span className="block text-xs text-muted-foreground">{multiDay ? `Day ${need.dayNumber} · ` : ""}{need.startTime}–{need.endTime} · {canJoin ? `${need.openCount} ${need.openCount === 1 ? "position" : "positions"} open` : need.isFull ? "Fully staffed" : "Signup closed"}{need.notes ? ` · ${need.notes}` : ""}</span>
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
  const [phone, setPhone] = useState("");
  const [grades, setGrades] = useState<SchoolGrade[]>([]);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [donationAddOn, setDonationAddOn] = useState("");
  const [benefitsDeclined, setBenefitsDeclined] = useState(false);
  const [autoChargeOptIn, setAutoChargeOptIn] = useState(false);
  const [done, setDone] = useState(false);
  const [freeOrderId, setFreeOrderId] = useState<string | null>(null);
  const checkoutOrderId = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("checkout") === "success"
      ? new URLSearchParams(window.location.search).get("order")
      : null;
  const { data: checkoutOrder, isLoading: checkoutOrderLoading } = usePublicTicketOrderStatus(token, checkoutOrderId ?? freeOrderId);

  const onSale = useMemo(
    () => (tickets ?? []).filter((ticket) => ticket.isActive),
    [tickets],
  );
  const chosen = onSale.find((ticket) => ticket.id === selected) ?? null;
  const remaining = chosen === null ? null : chosen.quantityTotal === 0 ? null : chosen.quantityTotal - chosen.quantitySold;
  const chosenSoldOut = chosen !== null && remaining !== null && remaining <= 0;
  const maxPerOrder = chosen?.maxPerOrder ?? 10;
  const quantityLimit = chosen ? Math.max(1, Math.min(remaining ?? maxPerOrder, maxPerOrder)) : 1;
  const quantityHelp = chosenSoldOut
    ? "This ticket option is sold out. Choose another available option."
    : chosen && remaining !== null && remaining <= quantity
    ? remaining === 1
      ? "Only 1 ticket remains for this option, so another guest cannot be added."
      : `This order includes all ${remaining} remaining tickets for this option.`
    : chosen && quantity >= maxPerOrder
      ? `This ticket option allows up to ${maxPerOrder} tickets per order.`
      : "Use + to add a spouse or guest, then enter each person's full name below.";
  const changeQuantity = (requested: number) => {
    const nextQuantity = Math.max(1, Math.min(requested, quantityLimit));
    setQuantity(nextQuantity);
    setGuestNames((current) => Array.from(
      { length: nextQuantity },
      (_, index) => current[index] ?? (index === 0 ? name : ""),
    ));
  };

  if (isLoading) {
    return (
      <PublicFrame>
        <LoadingRows rows={4} />
      </PublicFrame>
    );
  }
  if (!event) return <EventNotFound />;

  if (done || checkoutOrder?.registrationConfirmed) {
    const confirmedQuantity = checkoutOrder?.quantity ?? quantity;
    return (
      <PublicFrame event={event}>
        <Panel className="p-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-tint text-success-text">
            <Check className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-foreground">You're registered</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your {confirmedQuantity === 1 ? "ticket is" : `${confirmedQuantity} tickets are`} confirmed for {event.title}.
            {contact ? ` A confirmation goes to ${contact}.` : checkoutOrder?.buyerEmailMasked ? ` A receipt is on its way to ${checkoutOrder.buyerEmailMasked}.` : " A receipt is on its way to the buyer's email."}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/e/${token}`}>Back to the event</Link>
          </Button>
          {checkoutOrder?.auctionAccessUrl ? <Button className="ml-2 mt-4" onClick={() => window.location.assign(checkoutOrder.auctionAccessUrl!)}>Open auction and view paddle</Button> : null}
        </Panel>
      </PublicFrame>
    );
  }

  if (checkoutOrderId) {
    const failed = !checkoutOrderLoading && (!checkoutOrder || ["failed", "refunded"].includes(checkoutOrder.status));
    return (
      <PublicFrame event={event}>
        <Panel className="p-8 text-center">
          <span className={`mx-auto grid size-11 place-items-center rounded-xl ${failed ? "bg-danger-tint text-danger-text" : "bg-primary-muted text-primary"}`}>
            <Ticket className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-foreground">{failed ? "Payment was not completed" : "Confirming your registration"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {failed
              ? "No registration was created. Return to the ticket page when you are ready to try again."
              : checkoutOrderLoading || checkoutOrder?.status === "pending"
                ? "Stripe is confirming the payment. This page updates automatically and will show your ticket only after the signed payment confirmation arrives."
                : "We are finishing the guest registration now. This page updates automatically."}
          </p>
          {failed ? <Button className="mt-4" onClick={() => window.location.assign(`/e/${token}/tickets`)}>Return to tickets</Button> : null}
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
              if (!chosen || !name.trim() || !contact.trim() || phone.replace(/\D/g, "").length < 10) {
                toast({ title: "Add your mobile number", description: "A mobile number is required for auction access and event updates." });
                return;
              }
              const names = chosen.collectGuestNames
                ? Array.from({ length: quantity }, (_, index) => (guestNames[index] || (index === 0 ? name : "")).trim())
                : [name.trim()];
              if (chosen.collectGuestNames && names.some((guestName) => !guestName)) {
                toast({ title: "Add every ticket holder", description: `Enter a full name for all ${quantity} tickets.` });
                return;
              }
              const donationAddOnCents = donationAddOn.trim() ? Math.max(0, Math.round(Number(donationAddOn) * 100)) : 0;
              purchase.mutate(
                {
                  shareToken: token,
                  ticketTypeId: chosen.id,
                  name: name.trim(),
                  contact: contact.trim(),
                  phone: phone.trim(),
                  grades,
                  quantity,
                  guestNames: names,
                  donationAddOnCents,
                  benefitsDeclined,
                  autoChargeOptIn,
                },
                {
                  onSuccess: (result) => {
                    if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
                    else {
                      setFreeOrderId(result.orderId);
                      setDone(true);
                    }
                  },
                  onError: (error) => toast({ title: "Couldn't complete", description: error.message }),
                },
              );
            }}
          >
            <Panel>
              <PanelHeader title="Select a ticket option" description="Choose one option below. You will select the household quantity and enter every ticket holder next." />
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
                            setGuestNames([name]);
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
                    onChange={(inputEvent) => {
                      const nextName = inputEvent.target.value;
                      setGuestNames((current) => [
                        !current[0] || current[0] === name ? nextName : current[0],
                        ...current.slice(1),
                      ]);
                      setName(nextName);
                    }}
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
                  <Label htmlFor="buyer-phone">Mobile phone</Label>
                  <Input id="buyer-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" placeholder="(408) 555-0123" />
                  <p className="text-xs text-muted-foreground">Used for auction access and important event updates.</p>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">School connection (optional)</legend>
                  <div className="flex flex-wrap gap-2">{SCHOOL_GRADES.map((grade) => <label key={grade} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${grades.includes(grade) ? "border-primary bg-primary-muted font-semibold" : "border-hairline bg-background"}`}><input type="checkbox" className="sr-only" checked={grades.includes(grade)} onChange={() => setGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : current.length < 5 ? [...current, grade] : current)} />{grade}</label>)}</div>
                  <p className="text-xs text-muted-foreground">Choose up to five grades or community groups.</p>
                </fieldset>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer-quantity">Number of tickets</Label>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" aria-label="Remove one ticket" disabled={!chosen || quantity <= 1} onClick={() => changeQuantity(quantity - 1)}><Minus className="size-4" /></Button>
                    <Input id="buyer-quantity" type="number" min={1} max={quantityLimit} value={quantity} onChange={(inputEvent) => changeQuantity(Number.parseInt(inputEvent.target.value, 10) || 1)} className="w-20 text-center font-semibold" />
                    <Button type="button" size="icon" variant="outline" aria-label="Add one ticket" disabled={!chosen || quantity >= quantityLimit} onClick={() => changeQuantity(quantity + 1)}><Plus className="size-4" /></Button>
                  </div>
                  <p className={cn("text-xs", chosenSoldOut || (remaining !== null && remaining <= quantity) ? "text-warning-text" : "text-muted-foreground")}>{quantityHelp}</p>
                  {remaining !== null ? (
                    <p data-numeric className="text-xs text-muted-foreground">
                      {remaining} available
                    </p>
                  ) : null}
                </div>
                {chosen?.collectGuestNames ? (
                  <div className="space-y-3 sm:col-span-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Ticket holder names</p>
                      <p className="text-xs text-muted-foreground">Enter the full name that should appear on each guest record.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: quantity }, (_, index) => (
                        <div key={index} className="space-y-1.5">
                          <Label htmlFor={`ticket-holder-${index}`}>Ticket {index + 1}</Label>
                          <Input
                            id={`ticket-holder-${index}`}
                            value={guestNames[index] ?? (index === 0 ? name : "")}
                            onChange={(inputEvent) => setGuestNames((current) => Array.from(
                              { length: quantity },
                              (_, guestIndex) => guestIndex === index
                                ? inputEvent.target.value
                                : current[guestIndex] ?? (guestIndex === 0 ? name : ""),
                            ))}
                            required
                            autoComplete={index === 0 ? "name" : "off"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {chosen ? (
                  <div className="space-y-3 sm:col-span-2">
                    {chosen.priceCents > 0 ? (
                      <div className="rounded-lg bg-surface-sunken p-3 text-sm text-muted-foreground">
                        <p><strong>Value of benefits:</strong> {formatMoney((chosen.fairMarketValueCents ?? 0) * quantity)}{chosen.benefitsDescription ? ` - ${chosen.benefitsDescription}` : ""}</p>
                        <p><strong>Estimated deductible ticket portion:</strong> {formatMoney(benefitsDeclined ? chosen.priceCents * quantity : Math.max(0, (chosen.priceCents - (chosen.fairMarketValueCents ?? 0)) * quantity))}</p>
                      </div>
                    ) : null}
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={benefitsDeclined} onChange={(event) => setBenefitsDeclined(event.target.checked)} className="mt-1" /><span>I decline the meal, entertainment, or other ticket benefits. The organizer will treat the ticket payment as fully deductible where allowed.</span></label>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={autoChargeOptIn} onChange={(event) => setAutoChargeOptIn(event.target.checked)} className="mt-1" /><span>If I bid or give, I authorize the organizer to charge this saved payment method for my combined event bill. My card will not be charged unless I win or give.</span></label>
                    <div className="space-y-1.5"><Label htmlFor="ticket-donation-add-on">Add a fully deductible donation (optional)</Label><Input id="ticket-donation-add-on" inputMode="decimal" value={donationAddOn} onChange={(event) => setDonationAddOn(event.target.value)} placeholder="0.00" /></div>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  Total{" "}
                  <span data-numeric className="text-base font-semibold text-foreground">
                    {chosen ? formatMoney(chosen.priceCents * quantity + (Math.round(Number(donationAddOn || 0) * 100) || 0)) : formatMoney(0)}
                  </span>
                </p>
                <Button type="submit" disabled={!chosen || chosenSoldOut || !name.trim() || !contact.trim() || purchase.isPending}>
                  <Ticket className="mr-1.5 size-4" />
                  {purchase.isPending ? "Reserving…" : chosen && chosen.priceCents > 0 ? "Continue to secure payment" : "Confirm registration"}
                </Button>
              </div>
            </Panel>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}
