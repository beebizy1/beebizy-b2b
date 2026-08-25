/** The only email addresses permitted to use the private Beebizy Studio workspace. */
export const INTERNAL_ACCESS_EMAILS = ["laila@beebizy.com", "mary@beebizy.com"] as const;

const internalAccessEmailSet = new Set<string>(INTERNAL_ACCESS_EMAILS);

export function hasInternalAccess(email: string | null | undefined): boolean {
  return typeof email === "string" && internalAccessEmailSet.has(email.trim().toLowerCase());
}
