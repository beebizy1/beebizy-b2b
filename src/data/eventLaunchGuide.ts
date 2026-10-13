export interface EventLaunchProgressInput {
  inviteeCount: number;
  invitationDesigned: boolean;
  activeTicketCount: number;
  stripeReady: boolean;
  invitationsSent: boolean;
}

export const EVENT_LAUNCH_STEP_IDS = ["event", "invite-list", "invite-design", "tickets", "payments", "send"] as const;
export type EventLaunchStepId = (typeof EVENT_LAUNCH_STEP_IDS)[number];
export type EventLaunchCompletion = Record<EventLaunchStepId, boolean>;

export interface EventDetailsReturnTarget {
  href: string;
  label: "Back to event" | "Back to launch guide";
}

export function eventLaunchPath(eventId: string): string {
  return `/app/events/${eventId}/share`;
}

/** Keeps Step 1 edits connected to the launch guide instead of stranding the organizer in the workspace. */
export function eventLaunchDetailsHref(eventId: string): string {
  return `/app/events/${eventId}/edit?returnTo=${encodeURIComponent(eventLaunchPath(eventId))}`;
}

export function eventLaunchRegistrationsHref(eventId: string): string {
  return `/app/events/${eventId}/registrations?returnTo=${encodeURIComponent(eventLaunchPath(eventId))}`;
}

export function eventDetailsReturnTarget(eventId: string, search: string): EventDetailsReturnTarget {
  const launchGuide = eventLaunchPath(eventId);
  return new URLSearchParams(search).get("returnTo") === launchGuide
    ? { href: launchGuide, label: "Back to launch guide" }
    : { href: `/app/events/${eventId}`, label: "Back to event" };
}

/** Six named checkpoints shared by the launch guide's progress and next-step logic. */
export function eventLaunchCompletion(input: EventLaunchProgressInput): EventLaunchCompletion {
  return {
    event: true,
    "invite-list": input.inviteeCount > 0,
    "invite-design": input.invitationDesigned,
    tickets: input.activeTicketCount > 0,
    payments: input.stripeReady,
    send: input.invitationsSent,
  };
}

export function nextEventLaunchStep(completion: EventLaunchCompletion): EventLaunchStepId | null {
  return EVENT_LAUNCH_STEP_IDS.find((step) => !completion[step]) ?? null;
}

/** Keeps deliberate review of a completed step open, but advances once an unfinished step becomes complete. */
export function openEventLaunchStep(
  selectedStep: EventLaunchStepId | null,
  selectedWasComplete: boolean,
  completion: EventLaunchCompletion,
): EventLaunchStepId {
  if (selectedStep && (selectedWasComplete || !completion[selectedStep])) return selectedStep;
  return nextEventLaunchStep(completion) ?? "send";
}
