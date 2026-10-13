import { describe, expect, it } from "vitest";
import {
  eventDetailsReturnTarget,
  eventLaunchCompletion,
  eventLaunchDetailsHref,
  nextEventLaunchStep,
} from "./eventLaunchGuide";

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

  it("round-trips event detail edits back to the launch guide", () => {
    const href = eventLaunchDetailsHref("evt-123");
    expect(href).toBe("/app/events/evt-123/edit?returnTo=%2Fapp%2Fevents%2Fevt-123%2Fshare");
    expect(eventDetailsReturnTarget("evt-123", "returnTo=%2Fapp%2Fevents%2Fevt-123%2Fshare")).toEqual({
      href: "/app/events/evt-123/share",
      label: "Back to launch guide",
    });
  });

  it("ignores unrelated return paths and falls back to the event workspace", () => {
    expect(eventDetailsReturnTarget("evt-123", "returnTo=https%3A%2F%2Fevil.example")).toEqual({
      href: "/app/events/evt-123",
      label: "Back to event",
    });
  });
});
