import { useCallback, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ErrorNotice, LoadingRows, PageHeader } from "@/components/primitives";
import { useEvents, useGoogleCalendarEvents } from "@/data/hooks";
import EventsCalendar from "@/screens/events/EventsCalendar";

export default function CalendarView() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const [visibleRange, setVisibleRange] = useState(() => {
    const now = new Date();
    const endsAfter = new Date(now.getFullYear(), now.getMonth(), -7).toISOString();
    const startsBefore = new Date(now.getFullYear(), now.getMonth() + 2, 8).toISOString();
    return { startsBefore, endsAfter };
  });
  const googleEvents = useGoogleCalendarEvents(visibleRange.startsBefore, visibleRange.endsAfter);
  const updateVisibleRange = useCallback((startsBefore: string, endsAfter: string) => {
    setVisibleRange((current) => current.startsBefore === startsBefore && current.endsAfter === endsAfter
      ? current
      : { startsBefore, endsAfter });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your full event calendar"
        description="See every draft, live event and multi-day program in one operating view."
        actions={
          <Button asChild>
            <Link href="/app/events/new">
              <CalendarPlus className="mr-1.5 size-4" />
              New event
            </Link>
          </Button>
        }
      />

      {isError ? <ErrorNotice error={error} title="Couldn't load the calendar" onRetry={() => void refetch()} /> : null}
      {googleEvents.isError ? (
        <ErrorNotice
          error={googleEvents.error}
          title="Couldn't load your Google Calendar"
          onRetry={() => void googleEvents.refetch()}
        />
      ) : null}
      {isLoading ? (
        <LoadingRows rows={6} />
      ) : (
        <EventsCalendar
          events={events ?? []}
          googleEvents={googleEvents.data ?? []}
          onVisibleRangeChange={updateVisibleRange}
        />
      )}
    </div>
  );
}
