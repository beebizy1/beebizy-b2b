import type { Event } from "@/data/entities";

export const ALL_LOCATIONS = "__all_locations__";
export const UNASSIGNED_LOCATION = "__unassigned_location__";

export function filterEventsByLocation(events: Event[], locationId: string): Event[] {
  if (locationId === ALL_LOCATIONS) return events;
  if (locationId === UNASSIGNED_LOCATION) return events.filter((event) => event.locationId === null);
  return events.filter((event) => event.locationId === locationId);
}

export function eventLocationLabel(event: Event): string {
  return event.locationRecord?.name ?? event.location ?? "No venue";
}
