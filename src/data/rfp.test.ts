import { describe, expect, it } from "vitest";
import { rfpDraftSchema, validHotelRfp } from "./rfp";

const hotelRfp = {
  title: "Three-day hotel conference",
  vendorCategory: "Venue",
  targetType: "venue" as const,
  eventType: "Conference with room block" as const,
  eventDate: "2026-12-01T12:00:00.000Z",
  startTime: "09:00",
  endTime: "17:00",
  headcount: 200,
  city: "Santa Clara",
  location: "Convention hotel",
  roomBlockRequired: true,
  roomsRequired: 100,
  checkInDate: "2026-11-30T12:00:00.000Z",
  checkOutDate: "2026-12-03T12:00:00.000Z",
  foodBeverageSpendCents: 3_500_000,
  ancillarySpendCents: 1_000_000,
  spaceRequirements: [
    { id: "registration", purpose: "Registration", date: "2026-11-30T12:00:00.000Z", startTime: "15:00", endTime: "18:00", capacity: 200, notes: "Foyer" },
    { id: "breakfast", purpose: "Breakfast", date: "2026-12-01T12:00:00.000Z", startTime: "07:30", endTime: "09:00", capacity: 200, notes: null },
    { id: "meeting", purpose: "Meeting", date: "2026-12-01T12:00:00.000Z", startTime: "09:00", endTime: "12:00", capacity: 200, notes: null },
    { id: "lunch", purpose: "Lunch", date: "2026-12-01T12:00:00.000Z", startTime: "12:00", endTime: "13:30", capacity: 200, notes: null },
  ],
};

describe("hotel RFP validation", () => {
  it("accepts a structured room block and function-space schedule", () => {
    expect(rfpDraftSchema.parse(hotelRfp)).toMatchObject({ roomsRequired: 100, headcount: 200 });
    expect(validHotelRfp(hotelRfp)).toBe(true);
  });

  it("requires room count and a check-out date after check-in", () => {
    expect(validHotelRfp({ ...hotelRfp, roomsRequired: null })).toBe(false);
    expect(validHotelRfp({ ...hotelRfp, checkOutDate: hotelRfp.checkInDate })).toBe(false);
  });

  it("requires the complete venue brief and hotel schedule", () => {
    expect(() => rfpDraftSchema.parse({ ...hotelRfp, city: null })).toThrow("City is required");
    expect(() => rfpDraftSchema.parse({ ...hotelRfp, ancillarySpendCents: null })).toThrow("Other property spend is required");
    expect(() => rfpDraftSchema.parse({ ...hotelRfp, spaceRequirements: hotelRfp.spaceRequirements.slice(0, 3) })).toThrow("Add a lunch space requirement");
  });

  it("rejects malformed function-space entries", () => {
    expect(() => rfpDraftSchema.parse({ ...hotelRfp, spaceRequirements: [{ id: "x", purpose: "", date: null }] })).toThrow();
    expect(() => rfpDraftSchema.parse({
      ...hotelRfp,
      spaceRequirements: hotelRfp.spaceRequirements.map((space) => space.purpose === "Meeting" ? { ...space, endTime: null } : space),
    })).toThrow("Meeting needs a date, start, end and capacity");
  });
});
