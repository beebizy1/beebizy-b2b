/**
 * Events index.
 *
 * One flat table of every event: title, when, what state it is in, its category and how
 * many people have registered. Filtering is by venue, which is the cut an operator
 * running several rooms actually needs.
 *
 * Readiness, risk and grouping live in the event workspace rather than here — this page
 * answers "what is on" and hands off.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarSearch, MapPin, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  PageHeader,
  Panel,
} from "@/components/primitives";
import { useEvents, useLocations } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { ALL_LOCATIONS, eventLocationLabel, filterEventsByLocation, UNASSIGNED_LOCATION } from "./calendar";

export default function EventsIndex() {
  const { date: formatDate } = usePreferences();
  const [locationId, setLocationId] = useState<string>(ALL_LOCATIONS);
  const [search, setSearch] = useState("");

  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const {
    data: locations,
    isError: locationsAreUnavailable,
    error: locationsError,
    refetch: refetchLocations,
  } = useLocations();

  // Filtered here rather than through the query so typing doesn't refetch per keystroke.
  const visible = useMemo(() => {
    const atVenue = filterEventsByLocation(events ?? [], locationId);
    const term = search.trim().toLowerCase();
    if (!term) return atVenue;
    return atVenue.filter(
      (event) =>
        event.title.toLowerCase().includes(term) ||
        event.category.toLowerCase().includes(term) ||
        eventLocationLabel(event).toLowerCase().includes(term),
    );
  }, [events, locationId, search]);

  const filtered = locationId !== ALL_LOCATIONS || search.trim() !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        actions={
          <>
            <div className="relative w-[220px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(inputEvent) => setSearch(inputEvent.target.value)}
                placeholder="Search title, venue or category"
                aria-label="Search events"
                className="pl-9"
              />
            </div>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-[200px]" aria-label="Filter by location">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LOCATIONS}>All Locations</SelectItem>
                {(locations ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
                <SelectItem value={UNASSIGNED_LOCATION}>No saved venue</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild>
              <Link href="/app/events/new">
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Create Event
              </Link>
            </Button>
          </>
        }
      />

      {isError ? <ErrorNotice error={error} title="Couldn't load events" onRetry={() => void refetch()} /> : null}
      {locationsAreUnavailable ? (
        <ErrorNotice error={locationsError} title="Couldn't load venues" onRetry={() => void refetchLocations()} />
      ) : null}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Registrations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }, (_, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={CalendarSearch}
                      title={filtered ? "No events match those filters" : "Nothing here yet"}
                      description={
                        filtered
                          ? "Try a different venue or search term, or clear the filters to see everything."
                          : "Create your first event, or start from a template."
                      }
                      action={
                        filtered ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setLocationId(ALL_LOCATIONS);
                              setSearch("");
                            }}
                          >
                            Clear filters
                          </Button>
                        ) : (
                          <Button asChild size="sm">
                            <Link href="/app/events/new">
                              <Plus className="mr-1.5 size-4" aria-hidden="true" />
                              Create Event
                            </Link>
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Link
                        href={`/app/events/${event.id}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {event.title}
                      </Link>
                      {event.location ? (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3 shrink-0" aria-hidden="true" />
                          {event.location}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(event.date, "dayMonthYear")}
                    </TableCell>
                    <TableCell>
                      <EventStatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.category}</TableCell>
                    <TableCell data-numeric className="text-right">
                      {event.capacity
                        ? `${event.registrationCount} / ${event.capacity}`
                        : event.registrationCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon" aria-label={`Edit ${event.title}`}>
                        <Link href={`/app/events/${event.id}/edit`}>
                          <Pencil className="size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
