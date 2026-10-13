import { useState, type ReactNode } from "react";
import { Check, ChevronDown, CreditCard, ListChecks, Mail, Palette, PartyPopper, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import { useMe, useRegistrations, useStartStripeConnect, useStripeConnectStatus, useTicketInvitations } from "@/data/hooks";
import { registrationPageIsCustomized } from "@/data/registrationPage";
import {
  eventLaunchCompletion,
  eventLaunchDetailsHref,
  eventLaunchPath,
  eventLaunchRegistrationsHref,
  nextEventLaunchStep,
  openEventLaunchStep,
} from "@/data/eventLaunchGuide";
import type { EventLaunchStepId } from "@/data/eventLaunchGuide";
import { eventInvitationRecipients } from "@/data/ticketInvitations";
import type { Event, TicketType } from "@/data/entities";
import { toast } from "@/hooks/use-toast";

interface EventLaunchGuideProps {
  event: Event;
  tickets: TicketType[];
  publishing: boolean;
  onDesignInvite(): void;
  onPublishInvite(): void;
  onSendInvites(): void;
  onPriceTickets(): void;
}

interface LaunchStep {
  number: number;
  id: EventLaunchStepId;
  title: string;
  summary: string;
  complete: boolean;
  icon: typeof PartyPopper;
  detail: ReactNode;
  action: ReactNode;
}

export default function EventLaunchGuide({ event, tickets, publishing, onDesignInvite, onPublishInvite, onSendInvites, onPriceTickets }: EventLaunchGuideProps) {
  const { data: identity } = useMe();
  const { data: connect, isLoading: connectLoading } = useStripeConnectStatus();
  const { data: invitations } = useTicketInvitations(event.id);
  const { data: registrations } = useRegistrations();
  const startConnect = useStartStripeConnect();
  const [selectedStep, setSelectedStep] = useState<{ id: EventLaunchStepId; wasComplete: boolean } | null>(null);
  const activeTickets = tickets.filter((ticket) => ticket.isActive);
  const contactableInvitees = eventInvitationRecipients(registrations ?? [], event.id);
  const invitationsSent = (invitations ?? []).some((invitation) => ["sent", "opened", "registered"].includes(invitation.status));
  const completion = eventLaunchCompletion({
    inviteeCount: contactableInvitees.length,
    invitationDesigned: registrationPageIsCustomized(event.registrationPage),
    activeTicketCount: activeTickets.length,
    stripeReady: connect?.ready === true,
    invitationsSent,
  });

  const steps: LaunchStep[] = [
    {
      number: 1,
      id: "event",
      title: "Create event",
      summary: "Add the event name, date, location, and guest capacity.",
      complete: completion.event,
      icon: PartyPopper,
      detail: <p>Your event already exists. Review the basics whenever the date, location, or capacity changes.</p>,
      action: <Button asChild variant="outline" size="sm"><a href={eventLaunchDetailsHref(event.id)}>Review event details</a></Button>,
    },
    {
      number: 2,
      id: "invite-list",
      title: "Build invite list",
      summary: "Add names one by one or upload a spreadsheet.",
      complete: completion["invite-list"],
      icon: Users,
      detail: <p>You have {contactableInvitees.length} {contactableInvitees.length === 1 ? "person" : "people"} with an email address on this event's list. Step 6 will load them automatically.</p>,
      action: <Button asChild size="sm"><a href={eventLaunchRegistrationsHref(event.id)}>{contactableInvitees.length > 0 ? "Review invite list" : "Add or upload guests"}</a></Button>,
    },
    {
      number: 3,
      id: "invite-design",
      title: "Design invite",
      summary: "Choose the photo, wording, colors, and guest types.",
      complete: completion["invite-design"],
      icon: Palette,
      detail: <p>Make the invitation look like this event. Guests will see the same design in their email and on the registration page.</p>,
      action: <Button type="button" size="sm" onClick={onDesignInvite}>Design invitation</Button>,
    },
    {
      number: 4,
      id: "tickets",
      title: "Price your tickets",
      summary: "Name each ticket, set its price, and choose how many are available.",
      complete: completion.tickets,
      icon: Ticket,
      detail: <p>{activeTickets.length > 0 ? `${activeTickets.length} ticket ${activeTickets.length === 1 ? "option is" : "options are"} ready.` : "Add at least one free or paid ticket option before inviting guests."}</p>,
      action: <Button type="button" size="sm" onClick={onPriceTickets}>{activeTickets.length > 0 ? "Review ticket prices" : "Add ticket prices"}</Button>,
    },
    {
      number: 5,
      id: "payments",
      title: "Connect your school's bank account",
      summary: "Use Stripe so ticket, auction, and fundraising money can reach the school.",
      complete: completion.payments,
      icon: CreditCard,
      detail: connect?.ready ? <div className="space-y-2"><p>Stripe is connected. Stripe will send paid ticket and fundraising money to the school's bank account.</p><p className="text-xs">Stripe charges its normal processing fee. Beebizy adds 2%.</p></div> : <div className="space-y-2"><p>Stripe is the secure payment service that sends money to the school.</p><p><strong>1.</strong> Click Connect below.</p><p><strong>2.</strong> The school owner fills out Stripe's form.</p><p><strong>3.</strong> Stripe sends ticket and fundraising money to the school's bank account.</p><p className="text-xs">Stripe charges its normal processing fee. Beebizy adds 2%.</p></div>,
      action: connect?.ready ? <Button asChild variant="outline" size="lg"><a href={eventLaunchPath(event.id)}>Stripe connected · Continue to next step</a></Button> : identity?.role === "owner" ? <Button type="button" size="lg" className="w-full text-base font-bold shadow-sm sm:w-auto" disabled={connectLoading || startConnect.isPending} onClick={() => startConnect.mutate(eventLaunchPath(event.id), { onSuccess: (status) => { if (status.onboardingUrl) window.location.assign(status.onboardingUrl); }, onError: (error) => toast({ title: "Couldn't open Stripe", description: error.message }) })}>{startConnect.isPending ? "Opening Stripe…" : connect?.accountId ? "Continue connecting Stripe" : "Connect Stripe bank account"}</Button> : <p className="text-xs font-medium text-muted-foreground">Ask the Beebizy workspace owner to connect Stripe.</p>,
    },
    {
      number: 6,
      id: "send",
      title: "Send out invitations",
      summary: "Send each guest the designed invite and unique event link.",
      complete: completion.send,
      icon: Mail,
      detail: event.shareToken ? <p>Your shareable event link is ready. Open the invitation sender, review the guest list from Step 2, and send.</p> : <p>Create the public event link first. Then Beebizy can include it in every invitation.</p>,
      action: event.shareToken ? <Button type="button" size="sm" onClick={onSendInvites}>Open invitation sender</Button> : <Button type="button" size="sm" disabled={publishing} onClick={onPublishInvite}>{publishing ? "Creating link…" : "Create shareable link"}</Button>,
    },
  ];

  const completedCount = Object.values(completion).filter(Boolean).length;
  const nextStep = nextEventLaunchStep(completion);
  const openStep = openEventLaunchStep(selectedStep?.id ?? null, selectedStep?.wasComplete ?? false, completion);

  return (
    <Panel className="overflow-hidden border-primary/20">
      <PanelHeader title="Launch your event" description="Follow these six steps in order. Finish one, then move to the next." actions={<Pill tone={completedCount === 6 ? "success" : "warning"}>{completedCount} of 6 done</Pill>} />
      <div className="h-1.5 bg-surface-sunken"><div className="h-full bg-primary transition-[width]" style={{ width: `${(completedCount / 6) * 100}%` }} /></div>
      <ol className="divide-y divide-hairline">
        {steps.map((step) => {
          const Icon = step.icon;
          const expanded = openStep === step.id;
          const next = nextStep === step.id && !step.complete;
          return (
            <li key={step.id} className={expanded ? "bg-primary-muted/25" : "bg-background"}>
              <button type="button" className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={expanded} onClick={() => setSelectedStep(expanded ? null : { id: step.id, wasComplete: step.complete })}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${step.complete ? "bg-success text-white" : next ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-muted-foreground"}`}>{step.complete ? <Check className="size-4" /> : step.number}</span>
                <Icon className={`size-4 shrink-0 ${step.complete ? "text-success-text" : next ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Step {step.number}. {step.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{step.summary}</span></span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{step.complete ? "Done" : next ? "Next" : "Later"}</span>
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {expanded ? <div className="grid gap-4 px-5 pb-5 pl-[5.75rem] text-sm leading-6 text-muted-foreground"><div>{step.detail}</div><div>{step.action}</div></div> : null}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2 border-t border-hairline bg-surface-sunken px-5 py-3 text-xs text-muted-foreground"><ListChecks className="size-4" />Beebizy checks off steps automatically as you finish them.</div>
    </Panel>
  );
}
