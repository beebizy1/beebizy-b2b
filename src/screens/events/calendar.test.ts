import { describe, expect, it } from "vitest";
import {
  ALL_LOCATIONS,
  UNASSIGNED_LOCATION,
  eventLocationLabel,
  filterEventsByLocation,
} from "./calendar";
import type { Event } from "@/data/entities";

const makeEvent = (id: string, locationId: string | null): Event => ({
  id,
  ownerId: "workspace-1",
  title: id,
  description: null,
  date: "2026-08-22T17:00:00.000Z",
  endDate: null,
  location: null,
  locationId,
  locationRecord: null,
  capacity: null,
  status: "published",
  category: "Conference",
  imageUrl: null,
  registrationCount: 0,
  shareToken: null,
  createdAt: "2026-08-01T00:00:00.000Z",
});

describe("filterEventsByLocation", () => {
  it("scopes the calendar to one saved location", () => {
    const events = [makeEvent("LA", "location-la"), makeEvent("NYC", "location-nyc")];
    expect(filterEventsByLocation(events, "location-la").map((event) => event.id)).toEqual(["LA"]);
  });

  it("supports all venues and events without a saved venue", () => {
    const events = [makeEvent("LA", "location-la"), makeEvent("TBD", null)];
    expect(filterEventsByLocation(events, ALL_LOCATIONS)).toEqual(events);
    expect(filterEventsByLocation(events, UNASSIGNED_LOCATION).map((event) => event.id)).toEqual(["TBD"]);
  });

  it("prefers the structured location name", () => {
    const event = makeEvent("LA", "location-la");
    event.location = "Legacy venue";
    event.locationRecord = {
      id: "location-la",
      ownerId: "workspace-1",
      name: "The Broad",
      corporationName: "The Broad",
      address: null,
      city: "Los Angeles",
      state: "CA",
      country: "US",
      phone: null,
      eventCount: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    expect(eventLocationLabel(event)).toBe("The Broad");
  });
});
