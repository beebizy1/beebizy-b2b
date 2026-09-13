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
  "poorvishukla27@gmail.com",
] as const;

export function accountExperienceForEmail(email: string | null | undefined): AccountExperience {
  if (typeof email !== "string") return "standard";
  const normalized = email.trim().toLowerCase();
  return SANTA_CLARA_PILOT_EMAILS.includes(normalized as (typeof SANTA_CLARA_PILOT_EMAILS)[number])
    ? "santa-clara"
    : "standard";
}
