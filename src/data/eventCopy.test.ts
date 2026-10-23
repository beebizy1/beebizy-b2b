import { describe, expect, it } from "vitest";
import { buildPostEventCopyFallback, buildRegistrationCopyFallback } from "./eventCopy";

describe("event copy fallbacks", () => {
  it("drafts editable about and agenda copy without inventing schedule details", () => {
    expect(buildRegistrationCopyFallback(
      { title: "Community Gala", category: "Fundraiser", description: "Celebrating our school community.", location: "Main Hall" },
      [{ title: "Doors open", startTime: "17:30" }, { title: "Closing remarks", startTime: "21:00" }],
    )).toMatchObject({
      aboutHeading: "Why we’re gathering",
      aboutBody: "Celebrating our school community.",
      agendaIntroduction: expect.stringContaining("Doors open at 17:30"),
      source: "fallback",
    });
  });

  it("drafts a factual thank-you and wrap-up from unique attendance", () => {
    const result = buildPostEventCopyFallback({ title: "Demo Day" }, {
      uniqueRegistered: 900,
      uniqueCheckedIn: 700,
      attendanceRate: 78,
      checklistDone: 18,
      checklistTotal: 20,
      revenueCents: 0,
    });
    expect(result.subject).toBe("Thank you for joining Demo Day");
    expect(result.thankYouMessage).toContain("700 guests");
    expect(result.wrapUp).toContain("78% attendance rate");
    expect(result.wrapUp).toContain("18 of 20");
  });

  it("does not tell guests that zero people attended when check-in is not recorded", () => {
    const result = buildPostEventCopyFallback({ title: "Demo Day" }, {
      uniqueRegistered: 20,
      uniqueCheckedIn: 0,
      attendanceRate: 0,
      checklistDone: 2,
      checklistTotal: 4,
      revenueCents: 0,
    });
    expect(result.thankYouMessage).not.toContain("0 guests");
    expect(result.thankYouMessage).not.toContain("check-in");
    expect(result.wrapUp).toContain("does not have any attendee check-ins recorded yet");
  });
});
