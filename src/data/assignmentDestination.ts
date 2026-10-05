import type { PublicAssignmentPayload } from "./entities";

/**
 * Counter volunteers should land on the guest list, not the intermediate shift page.
 * Other assignment links keep their normal task view.
 */
export function directPublicAssignmentDestination(assignment: PublicAssignmentPayload): string | null {
  if (assignment.kind !== "volunteer" || !assignment.checkInStation) return null;
  return assignment.checkInPath ?? null;
}
