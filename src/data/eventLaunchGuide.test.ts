import { describe, expect, it } from "vitest";
import { eventLaunchCompletion, nextEventLaunchStep } from "./eventLaunchGuide";

describe("event launch guide", () => {
  it("keeps the organizer on the first unfinished step even when later work is already done", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 10,
      invitationDesigned: false,
      activeTicketCount: 4,
      stripeReady: true,
      invitationsSent: false,
    });
    expect(completion).toEqual({ event: true, "invite-list": true, "invite-design": false, tickets: true, payments: true, send: false });
    expect(nextEventLaunchStep(completion)).toBe("invite-design");
  });

  it("finishes on step six when every checkpoint is complete", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 1,
      invitationDesigned: true,
      activeTicketCount: 1,
      stripeReady: true,
      invitationsSent: true,
    });
    expect(nextEventLaunchStep(completion)).toBeNull();
  });
});
