/** The only email addresses permitted to use the private Beebizy Studio workspace. */
export const INTERNAL_ACCESS_EMAILS = [
  "laila@beebizy.com",
  "mary@beebizy.com",
  "tarang@beebizy.com",
] as const;

const internalAccessEmailSet = new Set<string>(INTERNAL_ACCESS_EMAILS);

/** True only for Beebizy's three internal operators, never for invited pilot users. */
export function isBeebizyOperator(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return internalAccessEmailSet.has(email.trim().toLowerCase());
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
