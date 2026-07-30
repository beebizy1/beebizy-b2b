import { useMemo } from "react";
import { useListEvents } from "./events";
import { useListLocations } from "./locations";
import { useListAttendees } from "./attendees";
import { useListRegistrations } from "./registrations";
import type { DashboardStats } from "./types";

/** Computed client-side by reducing over already-queried collections — no separate aggregation query/index needed. */
export function useGetStats() {
  const events = useListEvents();
  const locations = useListLocations();
  const attendees = useListAttendees();
  const registrations = useListRegistrations();

  const isLoading = events.isLoading || locations.isLoading || attendees.isLoading || registrations.isLoading;
  const isError = events.isError || locations.isError || attendees.isError || registrations.isError;
  const error = events.error ?? locations.error ?? attendees.error ?? registrations.error;

  const data = useMemo<DashboardStats | undefined>(() => {
    if (!events.data || !locations.data || !attendees.data || !registrations.data) return undefined;
    const now = new Date();

    const eventsByCategory = new Map<string, number>();
    const eventsByLocation = new Map<string, number>();
    for (const e of events.data) {
      eventsByCategory.set(e.category, (eventsByCategory.get(e.category) ?? 0) + 1);
      const locName = e.locationRecord?.name ?? "Unassigned";
      eventsByLocation.set(locName, (eventsByLocation.get(locName) ?? 0) + 1);
    }

    return {
      totalEvents: events.data.length,
      totalLocations: locations.data.length,
      totalAttendees: attendees.data.length,
      totalRegistrations: registrations.data.length,
      confirmedRegistrations: registrations.data.filter((r) => r.status === "confirmed").length,
      upcomingEvents: events.data.filter((e) => new Date(e.date) >= now).length,
      publishedEvents: events.data.filter((e) => e.status === "published").length,
      eventsByCategory: Array.from(eventsByCategory.entries()).map(([category, count]) => ({ category, count })),
      eventsByLocation: Array.from(eventsByLocation.entries()).map(([locationName, count]) => ({ locationName, count })),
    };
  }, [events.data, locations.data, attendees.data, registrations.data]);

  return { data, isLoading, isError, error };
}
