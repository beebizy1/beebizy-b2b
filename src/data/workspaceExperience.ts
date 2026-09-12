/**
 * Reversible customer-specific product profiles.
 *
 * The profile changes presentation only. It never grants access or weakens server-side
 * plan checks. The email reaching this function has already been verified by Clerk.
 */
export const WORKSPACE_EXPERIENCES = ["standard", "santa-clara"] as const;
export type WorkspaceExperience = (typeof WORKSPACE_EXPERIENCES)[number];

/** Current Santa Clara pilot domains, kept in one place for a clean rollback. */
export const SANTA_CLARA_PILOT_DOMAINS = ["scu.edu", "santaclaraventures.com"] as const;

export function workspaceExperienceForEmail(email: string | null | undefined): WorkspaceExperience {
  if (typeof email !== "string") return "standard";
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at === -1) return "standard";
  const domain = normalized.slice(at + 1);
  return SANTA_CLARA_PILOT_DOMAINS.includes(domain as (typeof SANTA_CLARA_PILOT_DOMAINS)[number])
    ? "santa-clara"
    : "standard";
}
