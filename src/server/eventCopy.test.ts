import { describe, expect, it, vi } from "vitest";

vi.mock("./model", () => ({ plannerModel: vi.fn(() => null) }));

const { generatePostEventCopy, generateRegistrationCopy } = await import("./eventCopy");

const event = {
  id: "event-1",
  title: "Community Gala",
  category: "Fundraiser",
  description: "Celebrating our community.",
  date: "2027-01-05T18:00:00.000Z",
  endDate: null,
  location: "Main Hall",
  capacity: 300,
};

describe("event copy generation without a configured model", () => {
  it("returns the deterministic registration copy fallback", async () => {
    await expect(generateRegistrationCopy({
      event: event as never,
      agenda: [{ dayNumber: 1, startTime: "18:00", sortOrder: 0, title: "Welcome" }] as never,
      current: {},
      userId: "user-1",
    })).resolves.toMatchObject({ source: "fallback", aboutBody: "Celebrating our community." });
  });

  it("returns the guest-safe post-event fallback", async () => {
    await expect(generatePostEventCopy({
      event: event as never,
      facts: { uniqueRegistered: 20, uniqueCheckedIn: 0, attendanceRate: 0, checklistDone: 1, checklistTotal: 2, revenueCents: 0 },
      userId: "user-1",
    })).resolves.toMatchObject({
      source: "fallback",
      thankYouMessage: expect.not.stringContaining("0 guests"),
      wrapUp: expect.stringContaining("does not have any attendee check-ins recorded yet"),
    });
  });
});
