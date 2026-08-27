/** The only email addresses permitted to use the private Beebizy Studio workspace. */
export const INTERNAL_ACCESS_EMAILS = [
  "laila@beebizy.com",
  "mary@beebizy.com",
  "tarang@beebizy.com",
] as const;

const internalAccessEmailSet = new Set<string>(INTERNAL_ACCESS_EMAILS);

export const BETA_TRIAL_DAYS = 90;

export type StudioAccessKind = "internal" | "beta" | "subscriber" | "expired" | "denied";

export interface StudioAccessResult {
  allowed: boolean;
  kind: StudioAccessKind;
  trialEndsAt: string | null;
}

export function hasInternalAccess(email: string | null | undefined): boolean {
  return typeof email === "string" && internalAccessEmailSet.has(email.trim().toLowerCase());
}

function timestamp(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getStudioAccess(
  profile: {
    email: string | null | undefined;
    createdAt?: Date | string | number | null;
    publicMetadata?: Record<string, unknown> | null;
  },
  now: Date = new Date(),
): StudioAccessResult {
  if (hasInternalAccess(profile.email)) return { allowed: true, kind: "internal", trialEndsAt: null };

  const metadata = profile.publicMetadata ?? {};
  if (metadata.subscriptionStatus === "active") {
    return { allowed: true, kind: "subscriber", trialEndsAt: null };
  }
  if (metadata.beebizyBeta !== true) return { allowed: false, kind: "denied", trialEndsAt: null };

  const created = timestamp(profile.createdAt);
  if (created === null) return { allowed: false, kind: "denied", trialEndsAt: null };
  const trialEnds = created + BETA_TRIAL_DAYS * 24 * 60 * 60 * 1_000;
  const trialEndsAt = new Date(trialEnds).toISOString();
  return now.getTime() < trialEnds
    ? { allowed: true, kind: "beta", trialEndsAt }
    : { allowed: false, kind: "expired", trialEndsAt };
}
