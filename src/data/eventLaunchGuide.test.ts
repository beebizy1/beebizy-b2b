import { describe, expect, it } from "vitest";
import {
  eventDetailsReturnTarget,
  eventLaunchCompletion,
  eventLaunchDetailsHref,
  eventLaunchRegistrationsHref,
  eventLaunchStepHref,
  eventLaunchUnlocks,
  nextEventLaunchStep,
  openEventLaunchStep,
} from "./eventLaunchGuide";

describe("event launch guide", () => {
  it("keeps the organizer on the first unfinished step even when later work is already done", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 10,
      invitationDesigned: false,
      activeTicketCount: 4,
      paymentsRequired: true,
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
      paymentsRequired: true,
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

  it("brings the invite-list editor back to the master launch guide", () => {
    expect(eventLaunchRegistrationsHref("evt-123")).toBe(
      "/app/events/evt-123/registrations?returnTo=%2Fapp%2Fevents%2Fevt-123%2Fshare",
    );
  });

  it("builds direct links for every launch step", () => {
    expect(eventLaunchStepHref("evt-123", "event")).toContain("/edit?returnTo=");
    expect(eventLaunchStepHref("evt-123", "invite-list")).toContain("/registrations?returnTo=");
    expect(eventLaunchStepHref("evt-123", "invite-design")).toBe("/app/events/evt-123/share?step=invite-design");
    expect(eventLaunchStepHref("evt-123", "payments")).toBe("/app/events/evt-123/share?step=payments");
  });

  it("locks future steps until every earlier requirement is complete", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 0,
      invitationDesigned: false,
      activeTicketCount: 0,
      paymentsRequired: false,
      stripeReady: false,
      invitationsSent: false,
    });
    expect(eventLaunchUnlocks(completion)).toEqual({
      event: true,
      "invite-list": true,
      "invite-design": false,
      tickets: true,
      payments: true,
      send: false,
    });
  });

  it("keeps completed later work clickable without unlocking unfinished steps around it", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 0,
      invitationDesigned: true,
      activeTicketCount: 0,
      paymentsRequired: false,
      stripeReady: false,
      invitationsSent: false,
    });
    expect(eventLaunchUnlocks(completion)["invite-design"]).toBe(true);
    expect(eventLaunchUnlocks(completion).tickets).toBe(true);
  });

  it("advances from a completed selected step to the next unfinished step", () => {
    const completion = eventLaunchCompletion({
      inviteeCount: 10,
      invitationDesigned: true,
      activeTicketCount: 0,
      paymentsRequired: false,
      stripeReady: false,
      invitationsSent: false,
    });
    expect(openEventLaunchStep("invite-design", false, completion)).toBe("send");
    expect(openEventLaunchStep("tickets", false, completion)).toBe("send");
    expect(openEventLaunchStep("invite-design", true, completion)).toBe("invite-design");
  });
});
