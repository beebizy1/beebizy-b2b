/**
 * Reversible customer-specific product profiles.
 *
 * The profile changes presentation only. It never grants access or weakens server-side
 * plan checks. The email reaching this function has already been verified by Clerk.
 */
export const WORKSPACE_EXPERIENCES = ["standard", "santa-clara"] as const;
export type WorkspaceExperience = (typeof WORKSPACE_EXPERIENCES)[number];

/** Known pilot anchors, kept in one place for a clean rollback. */
export const SANTA_CLARA_PILOT_EMAILS = [
  "ccismasflorea@scu.edu",
  "poorvi@santaclaraventures.com",
] as const;

export function workspaceExperienceForEmail(email: string | null | undefined): WorkspaceExperience {
  if (typeof email !== "string") return "standard";
  const normalized = email.trim().toLowerCase();
  return SANTA_CLARA_PILOT_EMAILS.includes(normalized as (typeof SANTA_CLARA_PILOT_EMAILS)[number])
    ? "santa-clara"
    : "standard";
}
