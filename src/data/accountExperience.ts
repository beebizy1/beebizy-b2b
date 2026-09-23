import { PRODUCT_OPERATOR_EMAILS } from "../lib/internalAccess.ts";

/**
 * Reversible account-specific product profiles.
 *
 * The profile changes presentation only. It never grants access or weakens server-side
 * plan checks. The email reaching this function has already been verified by Clerk.
 */
export const ACCOUNT_EXPERIENCES = ["standard", "santa-clara"] as const;
export type AccountExperience = (typeof ACCOUNT_EXPERIENCES)[number];

/** The only accounts that receive the focused Santa Clara presentation. */
export const SANTA_CLARA_PILOT_EMAILS = [
  "ccismasflorea@scu.edu",
  "dchakarevski@scu.edu",
  "poorvishukla27@gmail.com",
] as const;

/** Product owners who may preview customer-specific presentations after signing in. */
export const ACCOUNT_EXPERIENCE_SWITCHER_EMAILS = PRODUCT_OPERATOR_EMAILS;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function parseAccountExperience(value: string | null | undefined): AccountExperience | null {
  return ACCOUNT_EXPERIENCES.includes(value as AccountExperience) ? (value as AccountExperience) : null;
}

export function accountExperienceForEmail(email: string | null | undefined): AccountExperience {
  if (typeof email !== "string") return "standard";
  const normalized = normalizeEmail(email);
  return SANTA_CLARA_PILOT_EMAILS.includes(normalized as (typeof SANTA_CLARA_PILOT_EMAILS)[number])
    ? "santa-clara"
    : "standard";
}

export function canSwitchAccountExperience(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const normalized = normalizeEmail(email);
  return ACCOUNT_EXPERIENCE_SWITCHER_EMAILS.includes(
    normalized as (typeof ACCOUNT_EXPERIENCE_SWITCHER_EMAILS)[number],
  );
}

export function resolveAccountExperience(
  assigned: AccountExperience,
  canSwitch: boolean,
  savedPreview: AccountExperience | null,
): AccountExperience {
  if (!canSwitch) return assigned;
  return savedPreview ?? assigned;
}
