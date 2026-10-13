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
