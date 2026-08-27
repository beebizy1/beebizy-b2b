import { CalendarPlus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ErrorNotice, LoadingRows, PageHeader } from "@/components/primitives";
import { useEvents } from "@/data/hooks";
import EventsCalendar from "@/screens/events/EventsCalendar";

export default function CalendarView() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
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
      {isLoading ? <LoadingRows rows={6} /> : <EventsCalendar events={events ?? []} />}
    </div>
  );
}
