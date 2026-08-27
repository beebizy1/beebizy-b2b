/** The only email addresses permitted to use the private Beebizy Studio workspace. */
export const INTERNAL_ACCESS_EMAILS = [
  "laila@beebizy.com",
  "mary@beebizy.com",
  "tarang@beebizy.com",
] as const;

const internalAccessEmailSet = new Set<string>(INTERNAL_ACCESS_EMAILS);

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
  return internalAccessEmailSet.has(normalized) || configuredBetaAccessEmails(configuredEmails).has(normalized);
}
