export const INVITATION_ACCEPTANCE_PATH = "/accept-invitation";

/** Clerk appends this ticket after its emailed invitation link is opened. */
export function isInvitationAcceptance(search: string): boolean {
  return Boolean(new URLSearchParams(search).get("__clerk_ticket")?.trim());
}

/** Keep the email destination and the client route on one shared contract. */
export function invitationAcceptanceUrl(origin: string): string {
  return new URL(INVITATION_ACCEPTANCE_PATH, origin).toString();
}
