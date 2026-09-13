/**
 * Beebizy's own staff, by email domain.
 *
 * This was three hardcoded addresses and had already fallen behind: sabina@beebizy.com
 * holds a workspace and was not on the list, so she counted as a customer. The domain is
 * the thing that actually means "works at Beebizy", and it does not need a deploy for
 * every hire. The address is verified with Clerk before it reaches any of this, so it
 * cannot simply be typed at sign-up.
 */
export const INTERNAL_EMAIL_DOMAIN = "beebizy.com";

/** Staff who sign in with an address outside the domain. */
export const INTERNAL_ACCESS_EMAILS: readonly string[] = [];

const internalAccessEmailSet = new Set<string>(INTERNAL_ACCESS_EMAILS);

/** True for Beebizy staff, never for a pilot customer or a public signup. */
export function isBeebizyOperator(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (internalAccessEmailSet.has(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  return at !== -1 && normalized.slice(at + 1) === INTERNAL_EMAIL_DOMAIN;
}

/** Internal reviewers retain inbox access independently of customer subscription state. */
export function canAccessOperatorFeedbackInbox(route: string, email: string | null | undefined): boolean {
  return route === "feedback/inbox" && isBeebizyOperator(email);
}

export function configuredBetaAccessEmails(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function hasInternalAccess(email: string | null | undefined, configuredEmails?: string | null): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return isBeebizyOperator(normalized) || configuredBetaAccessEmails(configuredEmails).has(normalized);
}
