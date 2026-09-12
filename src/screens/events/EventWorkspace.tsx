/**
 * Event workspace.
 *
 * The old event page stacked fourteen tabs — Analytics, Budget, Checklist, Floorplan,
 * Fundraising, Inspiration, LiveAuction, Menu, Raffle, Registrations, RunOfShow,
 * SilentAuction, Tickets, Vendors — in a single row, which is a filing cabinet rather
 * than a workflow. Six sections replace them, and the header carries the one thing the
 * old page never said: how ready this event is and what is wrong with it.
 */

import { useEffect, useRef, useState } from "react";
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
import {
  useAddChecklistItem,
  useChecklist,
  useDeleteEvent,
  useEvent,
  useEventHealth,
  useMe,
  useSaveEventAsTemplate,
} from "@/data/hooks";
import { usePreferences, type Preferences } from "@/app/preferences";
import { eventSectionHref, eventSectionLabel, eventTabHref, tabFromSlug, visibleEventTabs, type EventTabId } from "@/app/shell/nav";
import type { Event, EventHealth } from "@/data/entities";
import { effectivePlan, type PlanId } from "@/data/plans";
import type { WorkspaceExperience } from "@/data/workspaceExperience";
import OverviewSection from "./sections/OverviewSection";
import GuestsSection from "./sections/GuestsSection";
import ShareSection from "./sections/ShareSection";
import FloorplanPanel from "./sections/FloorplanPanel";
import RfpPanel from "./sections/RfpPanel";
import DepositsPanel from "./sections/DepositsPanel";
import AnalyticsPanel from "./sections/AnalyticsPanel";
import { CheckInPanel } from "./sections/CheckInPanel";
import VolunteersPanel from "./sections/VolunteersPanel";
import FundraisingPanel from "./sections/FundraisingPanel";
import LiveAuctionPanel from "./sections/LiveAuctionPanel";
import PlanningAssistantPanel from "./sections/PlanningAssistantPanel";
import { ChecklistPanel, MoodBoardPanel, RunOfShowPanel } from "./sections/PlanSection";
import { MenuPanel, VendorCoveragePanel, VendorsPanel } from "./sections/VendorsSection";
import {
  AuctionPanel,
  BudgetPanel,
  BudgetRoiSummary,
  BudgetTotals,
  RafflePanel,
  RoiPanel,
  TicketsPanel,
} from "./sections/BudgetSection";

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

function SectionTabs({
  eventId,
  active,
  plan,
  experience,
}: {
  eventId: string;
  active: EventTabId;
  plan: PlanId;
  experience: WorkspaceExperience;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Seventeen tabs do not fit on one row, so the bar scrolls. Without this, landing on
  // a late tab like Deposits shows a bar that does not contain the tab you are on.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label="Event sections" className="-mb-px flex gap-1 overflow-x-auto">
      {visibleEventTabs(plan, experience).map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            href={eventTabHref(eventId, tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-hairline hover:text-foreground",
            )}
          >
            {tab.icon ? <tab.icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {tab.label}
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
              Fix in {eventSectionLabel(risk.section)}
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
  plan,
  experience,
}: {
  event: Event;
  health: EventHealth | null | undefined;
  active: EventTabId;
  plan: PlanId;
  experience: WorkspaceExperience;
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
            {experience === "standard" ? (
              <Button asChild size="sm">
                <Link href={eventSectionHref(event.id, "share")}>
                  <Share2 className="mr-1.5 size-3.5" />
                  Share
                </Link>
              </Button>
            ) : null}

            {experience === "standard" ? <DropdownMenu>
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
            </DropdownMenu> : null}

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
                    This also deletes its checklist, run of show, volunteers, budget, vendors, tickets, fundraising and{" "}
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

      {health && experience === "standard" ? <RiskStrip health={health} eventId={event.id} /> : null}

      <div className="border-b border-hairline">
        <SectionTabs eventId={event.id} active={active} plan={plan} experience={experience} />
      </div>
    </div>
  );
}

function ChecklistWorkspace({ event }: { event: Event }) {
  const { data: checklist } = useChecklist(event.id);
  const [showPlanningAssistant, setShowPlanningAssistant] = useState<boolean | null>(null);

  useEffect(() => {
    if (checklist === undefined) return;
    setShowPlanningAssistant((current) => current ?? checklist.length === 0);
  }, [checklist]);

  return (
    <div className="space-y-6">
      {showPlanningAssistant ? (
        <PlanningAssistantPanel event={event} />
      ) : showPlanningAssistant === false ? (
        <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Need a new AI draft?</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Your saved checklist stays below. Open Bee only when you want new suggestions.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPlanningAssistant(true)}>
            Open AI planner
          </Button>
        </Panel>
      ) : null}
      <ChecklistPanel event={event} />
    </div>
  );
}

const CONTINGENCY_STARTER = [
  {
    title: "Set the weather decision deadline",
    description: "Choose the exact time and owner for the final go, modify or move decision.",
  },
  {
    title: "Confirm the backup venue or indoor layout",
    description: "Document capacity, access, power and vendor load-in changes for the fallback space.",
  },
  {
    title: "Write guest and vendor weather messages",
    description: "Prepare the email, text and on-site wording before a fast decision is needed.",
  },
  {
    title: "Review safety, transport and accessibility impacts",
    description: "Cover heat, rain, wind, parking, mobility routes and emergency responsibilities.",
  },
] as const;

function ContingencyWorkspace({ event }: { event: Event }) {
  const { data: checklist } = useChecklist(event.id);
  const add = useAddChecklistItem();
  const existing = new Set((checklist ?? []).map((item) => item.title.trim().toLowerCase()));
  const missing = CONTINGENCY_STARTER.filter((item) => !existing.has(item.title.toLowerCase()));

  const addStarter = async () => {
    const results = await Promise.allSettled(
      missing.map((item, index) =>
        add.mutateAsync({
          eventId: event.id,
          draft: { ...item, category: "Contingency", sortOrder: (checklist?.length ?? 0) + index + 1 },
        }),
      ),
    );
    const added = results.filter((result) => result.status === "fulfilled").length;
    toast({
      title: added === missing.length ? "Contingency plan started" : "Some contingency tasks could not be added",
      description: `${added} editable task${added === 1 ? "" : "s"} added to the event checklist.`,
    });
  };

  return (
    <div className="space-y-6">
      <Panel className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-text">Team planning</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Weather and contingency plan</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Turn backup decisions into owned, editable tasks before weather, access or safety conditions change.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => void addStarter()} disabled={missing.length === 0 || add.isPending}>
            {missing.length === 0 ? "Starter added" : `Add ${missing.length} starter tasks`}
          </Button>
        </div>
      </Panel>
      <ChecklistPanel event={event} />
    </div>
  );
}

export default function EventWorkspace({ id, section: slug }: { id: string; section?: string }) {
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const { data: health } = useEventHealth(id);
  const { data: identity } = useMe();
  const active = tabFromSlug(slug);
  const plan = effectivePlan(identity?.access);
  const experience = identity?.experience ?? "standard";

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
  if (active === null) {
    return <Redirect to={`/app/events/${id}`} replace />;
  }

  if (experience === "santa-clara" && active === "overview") {
    return <Redirect to={eventTabHref(id, "run-of-show")} replace />;
  }

  if (!visibleEventTabs(plan, experience).some((tab) => tab.id === active) && (active !== "share" || experience !== "standard")) {
    return <Redirect to={experience === "santa-clara" ? eventTabHref(id, "run-of-show") : "/pricing"} replace />;
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader event={event} health={health} active={active} plan={plan} experience={experience} />
      {active === "overview" ? <OverviewSection event={event} health={health} /> : null}
      {active === "registrations" ? <GuestsSection event={event} /> : null}
      {active === "check-in" ? <CheckInPanel event={event} /> : null}
      {active === "run-of-show" ? <RunOfShowPanel event={event} /> : null}
      {active === "checklist" ? <ChecklistWorkspace key={event.id} event={event} /> : null}
      {active === "volunteers" ? <VolunteersPanel event={event} /> : null}
      {active === "contingency" ? <ContingencyWorkspace key={event.id} event={event} /> : null}
      {active === "vendors" ? (
        <div className="space-y-6">
          <VendorsPanel event={event} />
          <VendorCoveragePanel event={event} />
        </div>
      ) : null}
      {active === "budget" ? (
        experience === "santa-clara" ? (
          <BudgetPanel event={event} />
        ) : (
          <div className="space-y-6">
            <BudgetTotals event={event} />
            <BudgetPanel event={event} />
            <BudgetRoiSummary event={event} />
            <RoiPanel event={event} />
          </div>
        )
      ) : null}
      {active === "floorplan" ? <FloorplanPanel event={event} /> : null}
      {active === "inspiration" ? <MoodBoardPanel event={event} /> : null}
      {active === "fundraising" ? <FundraisingPanel event={event} /> : null}
      {active === "analytics" ? <AnalyticsPanel event={event} /> : null}
      {active === "share" ? <ShareSection event={event} /> : null}
      {active === "menu" ? <MenuPanel event={event} /> : null}
      {active === "tickets" ? <TicketsPanel event={event} /> : null}
      {active === "raffle" ? <RafflePanel event={event} /> : null}
      {active === "silent-auction" ? <AuctionPanel event={event} only="silent" /> : null}
      {active === "live-auction" ? <LiveAuctionPanel event={event} /> : null}
      {active === "rfp" ? <RfpPanel event={event} /> : null}
      {active === "deposits" ? <DepositsPanel event={event} /> : null}
    </div>
  );
}
