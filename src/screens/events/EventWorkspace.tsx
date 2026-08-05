/**
 * Event workspace.
 *
 * The old event page stacked fourteen tabs — Analytics, Budget, Checklist, Floorplan,
 * Fundraising, Inspiration, LiveAuction, Menu, Raffle, Registrations, RunOfShow,
 * SilentAuction, Tickets, Vendors — in a single row, which is a filing cabinet rather
 * than a workflow. Six sections replace them, and the header carries the one thing the
 * old page never said: how ready this event is and what is wrong with it.
 */

import { Link, Redirect, useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  MapPin,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  Panel,
  ReadinessRing,
  RiskPill,
} from "@/components/primitives";
import { useDeleteEvent, useEvent, useEventHealth, useSaveEventAsTemplate } from "@/data/hooks";
import { usePreferences, type Preferences } from "@/app/preferences";
import { EVENT_SECTIONS, eventSectionHref, sectionFromSlug } from "@/app/shell/nav";
import type { Event, EventHealth, EventSectionId } from "@/data/entities";
import OverviewSection from "./sections/OverviewSection";
import PlanSection from "./sections/PlanSection";
import GuestsSection from "./sections/GuestsSection";
import VendorsSection from "./sections/VendorsSection";
import BudgetSection from "./sections/BudgetSection";
import ShareSection from "./sections/ShareSection";

/**
 * "12 Mar 2026, 6:00 PM – 11:00 PM" for a single day, "– 13 Mar, 2:00 AM" when it runs
 * over. Whether it runs over is itself a question about the zone: an event ending at
 * 1am Portland is the next day there and the same day in Honolulu.
 */
function formatRange(event: Event, prefs: Preferences): string {
  const startText = prefs.date(event.date, "dayMonthYearTime");
  if (!event.endDate) return startText;
  const sameDay = prefs.daysUntil(event.endDate) === prefs.daysUntil(event.date);
  const endText = prefs.date(event.endDate, sameDay ? "time" : "dayMonthTime");
  return `${startText} – ${endText}`;
}

function SectionTabs({ eventId, active }: { eventId: string; active: EventSectionId }) {
  return (
    <nav aria-label="Event sections" className="-mb-px flex gap-1 overflow-x-auto">
      {EVENT_SECTIONS.map((section) => {
        const isActive = section.id === active;
        return (
          <Link
            key={section.id}
            href={eventSectionHref(eventId, section.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
              isActive
                ? "border-primary font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:border-hairline hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RiskStrip({ health, eventId }: { health: EventHealth; eventId: string }) {
  if (health.risks.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {health.risks.map((risk, index) => (
        <li key={`${risk.section}-${index}`}>
          <Link
            href={eventSectionHref(eventId, risk.section)}
            className="flex items-center gap-2.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm transition-colors hover:bg-accent/60"
          >
            <RiskPill level={risk.level} />
            <span className="min-w-0 flex-1 truncate text-foreground">{risk.message}</span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              Fix in {EVENT_SECTIONS.find((s) => s.id === risk.section)?.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceHeader({
  event,
  health,
  active,
}: {
  event: Event;
  health: EventHealth | null | undefined;
  active: EventSectionId;
}) {
  const [, navigate] = useLocation();
  const prefs = usePreferences();
  const deleteEvent = useDeleteEvent();
  const saveAsTemplate = useSaveEventAsTemplate();

  return (
    <div className="space-y-5">
      <Link
        href="/app/events"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All events
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display-md text-foreground">{event.title}</h1>
            <EventStatusBadge status={event.status} />
          </div>

          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden="true" />
              <dt className="sr-only">When</dt>
              <dd>
                {formatRange(event, prefs)} <span className="text-muted-foreground/70">· {prefs.when(event.date)}</span>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              <dt className="sr-only">Where</dt>
              <dd className="truncate">{event.locationRecord?.name ?? event.location ?? "No venue"}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              <dt className="sr-only">Registrations</dt>
              <dd data-numeric>
                {event.registrationCount}
                {event.capacity ? ` of ${event.capacity}` : ""} registered
              </dd>
            </div>
          </dl>

          {event.description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{event.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-4">
          {health ? (
            <div className="hidden text-center sm:block">
              <ReadinessRing value={health.readiness} size={64} label={`${event.title} readiness`} />
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ready</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/events/${event.id}/edit`}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={eventSectionHref(event.id, "share")}>
                <Share2 className="mr-1.5 size-3.5" />
                Share
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  ···
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    saveAsTemplate.mutate(
                      { eventId: event.id, name: `${event.title} template` },
                      {
                        onSuccess: () =>
                          toast({
                            title: "Saved as template",
                            description: "Checklist, run of show and budget were copied into your library.",
                          }),
                        onError: (error) => toast({ title: "Couldn't save template", description: error.message }),
                      },
                    );
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  Save as template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Delete event">
                  <Trash2 className="size-3.5 text-danger-text" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{event.title}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This also deletes its checklist, run of show, budget, vendors, tickets, fundraising and{" "}
                    {event.registrationCount} registration{event.registrationCount === 1 ? "" : "s"}. It cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      deleteEvent.mutate(
                        { id: event.id },
                        {
                          onSuccess: () => {
                            toast({ title: "Event deleted", description: `“${event.title}” and everything in it.` });
                            navigate("/app/events");
                          },
                          onError: (error) => toast({ title: "Couldn't delete", description: error.message }),
                        },
                      )
                    }
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {health ? <RiskStrip health={health} eventId={event.id} /> : null}

      <div className="border-b border-hairline">
        <SectionTabs eventId={event.id} active={active} />
      </div>
    </div>
  );
}

export default function EventWorkspace({ id, section: slug }: { id: string; section?: string }) {
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const { data: health } = useEventHealth(id);
  const active = sectionFromSlug(slug);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingRows rows={2} />
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (isError) {
    return <ErrorNotice error={error} title="Couldn't load this event" onRetry={() => void refetch()} />;
  }

  if (!event) {
    return (
      <Panel className="p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">That event doesn't exist</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Button asChild className="mt-4" size="sm">
          <Link href="/app/events">Back to events</Link>
        </Button>
      </Panel>
    );
  }

  // An unknown slug lands on Overview rather than a blank pane.
  if (slug && !EVENT_SECTIONS.some((s) => s.slug === slug)) {
    return <Redirect to={`/app/events/${id}`} replace />;
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader event={event} health={health} active={active} />
      {active === "overview" ? <OverviewSection event={event} health={health} /> : null}
      {active === "plan" ? <PlanSection event={event} /> : null}
      {active === "guests" ? <GuestsSection event={event} /> : null}
      {active === "vendors" ? <VendorsSection event={event} /> : null}
      {active === "budget" ? <BudgetSection event={event} /> : null}
      {active === "share" ? <ShareSection event={event} /> : null}
    </div>
  );
}
