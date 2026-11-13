import { describe, expect, it } from "vitest";
import { parseHubSpotEventSourceMessage } from "./hubspotEventSource";

const job = { eventId: "test-event", generation: "2296ea1b-d5f6-490b-8b84-b4fadfa89268", tick: 0 };
const scheduled = { scheduleId: "sch_demo", executionId: "schx_demo", name: "qa-hubspot-event-sync", namespace: "default", scheduledAt: "2026-11-13T23:00:00.000Z", source: "dynamic", payload: job };
describe("HubSpot registration queue messages", () => {
  it("accepts normal app-generated queue jobs", () => {
    expect(parseHubSpotEventSourceMessage(job)).toEqual(job);
  });
  it("reads the documented Vercel Schedules envelope", () => {
    expect(parseHubSpotEventSourceMessage(scheduled)).toEqual(job);
  });
  it("rejects invalid nested jobs and unrecognized payload wrappers", () => {
    expect(() => parseHubSpotEventSourceMessage({ ...scheduled, payload: { ...job, generation: "invalid" } })).toThrow();
    expect(() => parseHubSpotEventSourceMessage({ payload: job })).toThrow();
    expect(() => parseHubSpotEventSourceMessage({ ...scheduled, payload: undefined })).toThrow();
  });
});
