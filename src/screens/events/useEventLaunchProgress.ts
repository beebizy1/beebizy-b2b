import {
  useRegistrations,
  useStripeConnectStatus,
  useTicketInvitations,
  useTickets,
} from "@/data/hooks";
import {
  eventLaunchCompletion,
  eventLaunchUnlocks,
} from "@/data/eventLaunchGuide";
import { registrationPageIsCustomized } from "@/data/registrationPage";
import { eventInvitationRecipients } from "@/data/ticketInvitations";
import type { Event } from "@/data/entities";

export function useEventLaunchProgress(event: Event | null | undefined) {
  const eventId = event?.id ?? "";
  const { data: tickets } = useTickets(eventId);
  const { data: connect, isLoading: connectLoading } = useStripeConnectStatus();
  const { data: invitations } = useTicketInvitations(eventId);
  const { data: registrations } = useRegistrations();
  const activeTickets = (tickets ?? []).filter((ticket) => ticket.isActive);
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
    tickets: tickets ?? [],
    unlocked: eventLaunchUnlocks(completion),
  };
}
