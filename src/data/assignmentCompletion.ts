import type { VolunteerStatus } from "./entities";

export type AssignmentCompletionAction = "complete" | "reopen";

type VolunteerCompletionTransition = {
  status: VolunteerStatus;
  previousStatus: VolunteerStatus | null;
};

const RESTORABLE_VOLUNTEER_STATUSES = new Set<VolunteerStatus>(["scheduled", "confirmed", "checked_in"]);

/** Keeps the status that existed before completion so an accidental click is reversible. */
export function volunteerCompletionTransition(
  action: AssignmentCompletionAction,
  currentStatus: VolunteerStatus,
  previousStatus: VolunteerStatus | null,
): VolunteerCompletionTransition | null {
  if (action === "complete") {
    if (currentStatus === "cancelled") return null;
    if (currentStatus === "completed") return { status: currentStatus, previousStatus };
    return { status: "completed", previousStatus: currentStatus };
  }

  if (currentStatus !== "completed") return null;
  return {
    status: previousStatus && RESTORABLE_VOLUNTEER_STATUSES.has(previousStatus) ? previousStatus : "confirmed",
    previousStatus: null,
  };
}
