import {
  useRegistrations,
  useMe,
  useStripeConnectStatus,
  useTicketInvitations,
  useTickets,
} from "@/data/hooks";
import {
  eventLaunchCompletion,
  eventPaymentsRequired,
  eventLaunchUnlocks,
} from "@/data/eventLaunchGuide";
import { registrationPageIsCustomized } from "@/data/registrationPage";
import { eventInvitationRecipients } from "@/data/ticketInvitations";
import type { Event } from "@/data/entities";
import { workspaceUsesStripeConnect } from "@/data/workspaceAccess";

export function useEventLaunchProgress(event: Event | null | undefined) {
  const eventId = event?.id ?? "";
  const { data: identity, isLoading: identityLoading } = useMe();
  const stripeConnectExempt = identity ? !workspaceUsesStripeConnect(identity.access) : true;
  const { data: tickets } = useTickets(eventId);
  const { data: connect, isLoading: connectLoading } = useStripeConnectStatus({ enabled: Boolean(identity) && !stripeConnectExempt });
  const { data: invitations } = useTicketInvitations(eventId);
  const { data: registrations } = useRegistrations();
  const activeTickets = (tickets ?? []).filter((ticket) => ticket.isActive);
  const paymentsRequired = eventPaymentsRequired({
    hasPaidTicket: activeTickets.some((ticket) => ticket.priceCents > 0),
    isFundraiser: event?.category === "Fundraiser",
    hasAuction: Boolean(event?.auctionPublicToken),
    stripeConnectExempt,
  });
  const contactableInvitees = event
    ? eventInvitationRecipients(registrations ?? [], event.id)
    : [];
  const invitationsSent = (invitations ?? []).some((invitation) =>
    ["sent", "opened", "registered"].includes(invitation.status),
  );
  const completion = eventLaunchCompletion({
    inviteeCount: contactableInvitees.length,
    invitationDesigned: event ? registrationPageIsCustomized(event.registrationPage) : false,
    activeTicketCount: activeTickets.length,
    paymentsRequired,
    stripeReady: connect?.ready === true,
    invitationsSent,
  });

  return {
    activeTickets,
    completion,
    connect,
    connectLoading,
    contactableInvitees,
    invitations: invitations ?? [],
    invitationsSent,
    identityLoading,
    paymentsRequired,
    stripeConnectExempt,
    tickets: tickets ?? [],
    unlocked: eventLaunchUnlocks(completion),
  };
}
