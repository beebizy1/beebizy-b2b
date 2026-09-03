/**
 * One venue: how to reach it, and every event booked into it.
 *
 * The event list is the reason this page exists — a venue on its own is an address,
 * a venue with its bookings is a schedule.
 */

import { Link, useLocation as useRoute } from "wouter";
import { ArrowLeft, CalendarRange, MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  KeyValue,
  LoadingRows,
  PageHeader,
  Panel,
  PanelHeader,
} from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { useDeleteLocation, useEvents, useLocation } from "@/data/hooks";

export default function LocationDetail({ id }: { id: string }) {
  const [, navigate] = useRoute();
  const { date: formatDate } = usePreferences();
  const { data: location, isLoading, isError, error, refetch } = useLocation(id);
  const { data: events, isLoading: eventsLoading } = useEvents({ locationId: id });
  const deleteLocation = useDeleteLocation();

  if (isError) return <ErrorNotice error={error} onRetry={() => void refetch()} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (!location) {
    return (
      <Panel>
        <EmptyState
          icon={MapPin}
          title="That location doesn't exist"
          description="It may have been removed."
          action={
            <Button asChild variant="outline">
              <Link href="/app/locations">Back to Locations</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const place = [location.city, location.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <Link
        href="/app/locations"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Locations
      </Link>

      <PageHeader
        title={location.name}
        description={location.corporationName}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/app/locations/${location.id}/edit`}>
                <Pencil className="mr-1.5 size-4" aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {location.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {location.eventCount > 0
                      ? `${location.eventCount} ${location.eventCount === 1 ? "event is" : "events are"} booked here. They are kept, but lose their venue.`
                      : "This location has no events booked into it."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      deleteLocation.mutate(
                        { id: location.id },
                        {
                          onSuccess: () => {
                            toast({ title: "Location deleted", description: `${location.name} is gone.` });
                            navigate("/app/locations");
                          },
                          onError: (mutationError) =>
                            toast({ title: "Couldn't delete location", description: mutationError.message }),
                        },
                      )
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <PanelHeader title="Details" />
          <div className="space-y-3 p-5">
            <KeyValue label="Address">{location.address ?? "—"}</KeyValue>
            <KeyValue label="City">{place || "—"}</KeyValue>
            <KeyValue label="Country">{location.country}</KeyValue>
            <KeyValue label="Phone">{location.phone ?? "—"}</KeyValue>
            <KeyValue label="Events Hosted">
              <span data-numeric>{location.eventCount}</span>
            </KeyValue>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Events at this location" />
          {eventsLoading ? (
            <div className="p-5">
              <LoadingRows rows={3} />
            </div>
          ) : (events?.length ?? 0) === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No events booked here yet"
              description="Pick this venue when you create an event and it will show up in this list."
              action={
                <Button asChild>
                  <Link href="/app/events/new">New event</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {events?.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/app/events/${event.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(event.date, "dayMonthYear")} · {event.category}
                      </p>
                    </div>
                    <EventStatusBadge status={event.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
