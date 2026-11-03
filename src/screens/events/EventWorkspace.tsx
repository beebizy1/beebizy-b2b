/**
 * Event workspace.
 *
 * The old event page stacked fourteen tabs — Analytics, Budget, Checklist, Floorplan,
 * Fundraising, Inspiration, LiveAuction, Menu, Raffle, Registrations, RunOfShow,
 * SilentAuction, Tickets, Vendors — in a single row, which is a filing cabinet rather
 * than a workflow. Six sections replace them, and the header carries the one thing the
 * old page never said: how ready this event is and what is wrong with it.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GripVertical,
  Link2,
  MailCheck,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  Panel,
  RiskPill,
} from "@/components/primitives";
import {
  useAddChecklistItem,
  useChecklist,
  useDeleteEvent,
  useEvent,
  useEventHealth,
  useInviteMember,
  useMe,
  useMembers,
  useSendAssignmentSummaries,
  useUpdateEvent,
} from "@/data/hooks";
import { usePreferences, type Preferences } from "@/app/preferences";
import { eventSectionHref, eventSectionLabel, eventTabHref, eventTabsForEvent, orderedEventTabs, tabFromSlug, visibleEventTabs, type EventTab, type EventTabId } from "@/app/shell/nav";
import { DEFAULT_EVENT_NAVIGATION, type EventNavigationSettings, type EventNavigationTabId, type HideableEventTabId } from "@/data/eventNavigation";
import type { Event, EventHealth } from "@/data/entities";
import { effectivePlan, type PlanId } from "@/data/plans";
import type { AccountExperience } from "@/data/accountExperience";
import { endAfterAddingEventDay, eventDayOptions, formatEventDayLabel, selectedEventDay } from "@/data/eventDays";
import { useAccountExperience } from "@/app/useAccountExperience";
import { eventDetailsReturnTarget, eventLaunchStepHref, type EventLaunchStepId } from "@/data/eventLaunchGuide";
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
import EventLiveUpdates from "./EventLiveUpdates";
import EventSpreadsheetImportDialog from "./EventSpreadsheetImportDialog";
import EventLaunchContextBar from "./EventLaunchContextBar";
import { useEventLaunchProgress } from "./useEventLaunchProgress";
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

function SortableEventTab({
  tab,
  eventId,
  dayNumber,
  isActive,
  activeRef,
}: {
  tab: EventTab;
  eventId: string;
  dayNumber: number;
  isActive: boolean;
  activeRef: RefObject<HTMLAnchorElement | null>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={cn(
        "group flex shrink-0 snap-start items-stretch overflow-hidden rounded-lg border bg-card transition-[background-color,border-color,box-shadow,color]",
        isActive
          ? "border-primary/50 bg-primary-muted font-semibold text-foreground shadow-xs"
          : "border-transparent font-medium text-muted-foreground hover:border-card-border hover:text-foreground",
        isDragging && "cursor-grabbing shadow-lg ring-2 ring-primary/30",
      )}
    >
      <button
        type="button"
        className="touch-none cursor-grab border-r border-transparent px-1.5 text-muted-foreground/50 transition-colors hover:border-hairline hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Drag ${tab.label} to rearrange`}
        title={`Drag ${tab.label} to rearrange`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Link
        ref={isActive ? activeRef : undefined}
        href={`${eventTabHref(eventId, tab.id)}?day=${dayNumber}`}
        aria-current={isActive ? "page" : undefined}
        className="flex items-center gap-2 whitespace-nowrap px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {tab.icon ? (
          <tab.icon className={cn("size-3.5 shrink-0", isActive && "text-primary-text")} aria-hidden="true" />
        ) : null}
        {tab.label}
      </Link>
    </div>
  );
}

function SectionTabs({
  eventId,
  active,
  plan,
  experience,
  dayNumber,
  navigation,
  onNavigationChange,
}: {
  eventId: string;
  active: EventTabId;
  plan: PlanId;
  experience: AccountExperience;
  dayNumber: number;
  navigation: EventNavigationSettings;
  onNavigationChange(navigation: EventNavigationSettings): void;
}) {
  const [, navigate] = useLocation();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const baseTabs = visibleEventTabs(plan, experience);
  const [order, setOrder] = useState<EventNavigationTabId[]>([...navigation.tabOrder]);
  const [hidden, setHidden] = useState<HideableEventTabId[]>([...navigation.hiddenTabIds]);
  const allTabs = orderedEventTabs(baseTabs, order);
  const tabs = eventTabsForEvent(allTabs, hidden);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => setHidden([...navigation.hiddenTabIds]), [navigation.hiddenTabIds]);
  useEffect(() => setOrder([...navigation.tabOrder]), [navigation.tabOrder]);

  const saveOrder = (next: EventNavigationTabId[]) => {
    setOrder(next);
    onNavigationChange({ hiddenTabIds: hidden, tabOrder: next });
  };

  const move = (id: EventNavigationTabId, direction: -1 | 1) => {
    const ids = allTabs.map((tab) => tab.id as EventNavigationTabId);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    saveOrder(ids);
  };

  const setTabHidden = (id: EventTabId, nextHidden: boolean) => {
    if (id === "overview" || id === "share") return;
    const next = nextHidden
      ? [...new Set([...hidden, id as HideableEventTabId])]
      : hidden.filter((tabId) => tabId !== id);
    setHidden(next);
    onNavigationChange({ hiddenTabIds: next, tabOrder: order });
    if (nextHidden && active === id) navigate(eventTabHref(eventId, "overview"));
  };

  const finishDrag = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return;
    const ids = allTabs.map((tab) => tab.id as EventNavigationTabId);
    const from = ids.indexOf(dragged.id as EventNavigationTabId);
    const to = ids.indexOf(over.id as EventNavigationTabId);
    if (from < 0 || to < 0) return;
    saveOrder(arrayMove(ids, from, to));
  };

  // Seventeen tabs do not fit on one row, so the bar scrolls. Without this, landing on
  // a late tab like Deposits shows a bar that does not contain the tab you are on.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  return (
    <div className="flex items-center gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
        <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
          <nav
            aria-label="Event sections. Drag the handles to rearrange."
            className="workspace-scrollbar flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto py-2"
          >
            {tabs.map((tab) => (
              <SortableEventTab
                key={tab.id}
                tab={tab}
                eventId={eventId}
                dayNumber={dayNumber}
                isActive={tab.id === active}
                activeRef={activeRef}
              />
            ))}
          </nav>
        </SortableContext>
      </DndContext>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0" aria-label="Arrange event tabs">
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            Arrange
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Arrange event tabs</DialogTitle>
            <DialogDescription>Drag the handles in the tab bar, use these move buttons from the keyboard, or hide anything this event does not need. Changes save to this event for everyone.</DialogDescription>
          </DialogHeader>
          <ol className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {allTabs.map((tab, index) => {
              const isHidden = hidden.includes(tab.id as HideableEventTabId);
              return (
              <li key={tab.id} className={cn("flex items-center gap-2 rounded-lg border border-hairline px-3 py-2", isHidden && "bg-surface-sunken text-muted-foreground")}>
                <span className="w-6 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{tab.label}</span>
                {tab.id === "overview" ? <span className="text-[11px] text-muted-foreground">Always shown</span> : <Button type="button" variant="ghost" size="sm" aria-label={`${isHidden ? "Show" : "Hide"} ${tab.label}`} onClick={() => setTabHidden(tab.id, !isHidden)}>{isHidden ? <Eye className="mr-1.5 size-4" /> : <EyeOff className="mr-1.5 size-4" />}{isHidden ? "Show" : "Hide"}</Button>}
                <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={`Move ${tab.label} up`} onClick={() => move(tab.id as EventNavigationTabId, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={index === allTabs.length - 1} aria-label={`Move ${tab.label} down`} onClick={() => move(tab.id as EventNavigationTabId, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
              </li>
            );})}
          </ol>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => saveOrder([])}>Reset default order</Button><Button type="button" variant="outline" onClick={() => { setHidden([]); onNavigationChange({ hiddenTabIds: [], tabOrder: order }); }}>Show all sections</Button></div>
        </DialogContent>
      </Dialog>
    </div>
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

function EventAccessDialog({
  event,
  trigger,
  open,
  onOpenChange,
}: {
  event: Event;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}) {
  const invite = useInviteMember();
  const { data: members, isLoading } = useMembers();
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = open ?? internalOpen;
  const setDialogOpen = onOpenChange ?? setInternalOpen;
  const [email, setEmail] = useState("");
  const peopleWithAccess = (members ?? []).filter(
    (member) => !member.eventScopeId || member.eventScopeId === event.id,
  );

  const submit = () => {
    const invitedAddress = email.trim().toLowerCase();
    if (!invitedAddress) return;
    invite.mutate(
      { email: invitedAddress, role: "member", eventId: event.id },
      {
        onSuccess: (result) => {
          setEmail("");
          toast(
            result.emailSent
              ? {
                  title: "Event invitation sent",
                  description: `${invitedAddress} can open ${event.title} after signing in with this address.`,
                }
              : {
                  title: "Event access added",
                  description: `${invitedAddress} can sign in with this address. The invitation email was not delivered, so send them the Beebizy login link directly.`,
                },
          );
        },
        onError: (error) => toast({ title: "Couldn't add event access", description: error.message }),
      },
    );
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {open === undefined || trigger ? <DialogTrigger asChild>
        {trigger ?? <Button type="button" variant="outline" size="sm">
          <UserPlus className="mr-1.5 size-3.5" />
          Event access
        </Button>}
      </DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who can open this event?</DialogTitle>
          <DialogDescription>
            Assigning a checklist item sends a private task link. Add someone here when they need to sign in and work across this event.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            submit();
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="event-access-email">Email address</Label>
            <Input
              id="event-access-email"
              type="email"
              value={email}
              onChange={(inputEvent) => setEmail(inputEvent.target.value)}
              placeholder="colleague@company.com"
            />
          </div>
          <Button type="submit" size="sm" disabled={!email.trim() || invite.isPending}>
            {invite.isPending ? "Adding..." : "Add to event"}
          </Button>
        </form>

        <div className="rounded-xl border border-hairline">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Current access</p>
            <p className="text-xs text-muted-foreground">Workspace owners and team members can also open this event.</p>
          </div>
          {isLoading ? (
            <LoadingRows rows={2} className="p-4" />
          ) : peopleWithAccess.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">No one else has access yet.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-hairline overflow-y-auto">
              {peopleWithAccess.map((member) => {
                const label = member.name ?? member.email ?? "Team member";
                return (
                  <li key={`${member.userId ?? member.email}-${member.eventScopeId ?? "workspace"}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.status === "invited"
                            ? `Invitation pending - must sign in as ${member.email}`
                            : member.email ?? "Active team member"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                        {member.eventScopeId ? "This event" : "All events"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceHeader({
  event,
  health,
  active,
  plan,
  experience,
  canManageAccess,
}: {
  event: Event;
  health: EventHealth | null | undefined;
  active: EventTabId;
  plan: PlanId;
  experience: AccountExperience;
  canManageAccess: boolean;
}) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const prefs = usePreferences(event.timeZone);
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const sendAssignmentSummaries = useSendAssignmentSummaries();
  const [importOpen, setImportOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const days = eventDayOptions(event.date, event.endDate, prefs.timeZone);
  const selectedDay = selectedEventDay(search, days);
  const currentPath = location;
  const selectDay = (dayNumber: number) => navigate(`${currentPath}?day=${dayNumber}`);
  const addDay = () => {
    const nextDay = days.length + 1;
    updateEvent.mutate(
      { id: event.id, patch: { endDate: endAfterAddingEventDay(event.date, event.endDate) } },
      {
        onSuccess: () => {
          selectDay(nextDay);
          toast({ title: `Day ${nextDay} added`, description: "The new date is available throughout this event workspace." });
        },
        onError: (error) => toast({ title: "Couldn't add another event day", description: error.message }),
      },
    );
  };
  const emailResponsibilities = () => {
    sendAssignmentSummaries.mutate(event.id, {
      onSuccess: (result) => {
        const missing = result.missingEmail
          ? ` ${result.missingEmail} assigned item${result.missingEmail === 1 ? " has" : "s have"} no email address.`
          : "";
        const failed = result.failed
          ? ` ${result.failed} email${result.failed === 1 ? "" : "s"} could not be delivered.`
          : "";
        toast({
          title: result.sent > 0
            ? "Responsibility summaries sent"
            : result.failed > 0 ? "Responsibility emails could not be delivered" : "No summaries were sent",
          description: result.sent > 0
            ? `${result.assignments} open assignment${result.assignments === 1 ? "" : "s"} consolidated into ${result.sent} email${result.sent === 1 ? "" : "s"}.${failed}${missing}`
            : result.failed > 0
              ? `Beebizy prepared ${result.recipients} consolidated email${result.recipients === 1 ? "" : "s"}, but delivery failed. Check the email configuration and try again.${missing}`
              : result.missingEmail > 0
                ? `${result.missingEmail} assigned item${result.missingEmail === 1 ? " has" : "s have"} no email address.`
                : "Assign an open checklist item, run-of-show cue or volunteer shift to an email address first.",
        });
      },
      onError: (error) => toast({ title: "Couldn't send summaries", description: error.message }),
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
      <Link
        href="/app/events"
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All events
      </Link>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="display-md text-foreground">{event.title}</h1>
            <EventStatusBadge status={event.status} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/app/events/${event.id}/edit`}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit Event
              </Link>
            </Button>
            {experience === "standard" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={active === "share" ? `/app/events/${event.id}` : eventSectionHref(event.id, "share")}>
                  <Upload className="mr-1.5 size-3.5" />
                  {active === "share" ? "Back to Event" : "Share"}
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-primary/80 bg-white hover:bg-primary-muted">
                  <MoreHorizontal className="mr-1.5 size-4" />
                  More Actions
                  <ChevronDown className="ml-1.5 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {experience === "standard" ? <DropdownMenuItem asChild>
                  <Link href={eventSectionHref(event.id, "share")}>
                    <Link2 className="size-4" />
                    Registration Site
                  </Link>
                </DropdownMenuItem> : null}
                <DropdownMenuItem asChild>
                  <Link href={`/app/events/${event.id}/summary`}>
                    <Users className="size-4" />
                    Attendance Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <FileSpreadsheet className="size-4" />
                  Import Spreadsheet
                </DropdownMenuItem>
                {canManageAccess ? <DropdownMenuItem onSelect={() => setAccessOpen(true)}>
                  <UserPlus className="size-4" />
                  Manage Event Access
                </DropdownMenuItem> : null}
                <DropdownMenuItem disabled={sendAssignmentSummaries.isPending} onSelect={emailResponsibilities}>
                  <MailCheck className="size-4" />
                  {sendAssignmentSummaries.isPending ? "Sending Assignments..." : "Email Assignments"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger-text focus:text-danger-text" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  Delete Event
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <EventSpreadsheetImportDialog event={event} open={importOpen} onOpenChange={setImportOpen} />
            {canManageAccess ? <EventAccessDialog event={event} open={accessOpen} onOpenChange={setAccessOpen} /> : null}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 text-foreground/70" aria-hidden="true" />
            <dt className="sr-only">When</dt>
            <dd className="text-foreground">{formatRange(event, prefs)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-foreground/70" aria-hidden="true" />
            <dt className="sr-only">Where</dt>
            <dd className="text-foreground">{event.locationRecord?.name ?? event.location ?? "No venue"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="size-3.5 text-foreground/70" aria-hidden="true" />
            <dt className="sr-only">Registrations</dt>
            <dd data-numeric className="text-foreground">{event.registrationCount} registered</dd>
          </div>
        </dl>
      </div>

      {health && experience === "standard" ? <RiskStrip health={health} eventId={event.id} /> : null}
      </div>

      {active !== "share" ? <div className="border-t border-hairline bg-surface-sunken/40 px-3 sm:px-4">
        <SectionTabs eventId={event.id} active={active} plan={plan} experience={experience} dayNumber={selectedDay} navigation={event.navigation ?? DEFAULT_EVENT_NAVIGATION} onNavigationChange={(navigation) => updateEvent.mutate({ id: event.id, patch: { navigation } }, { onError: (error) => toast({ title: "Couldn't update event tabs", description: error.message }) })} />
        <div className="flex items-center gap-2 overflow-x-auto border-t border-hairline py-2" aria-label="Event days">
          {days.map((day) => (
            <Button
              key={day.dayNumber}
              type="button"
              size="sm"
              variant={selectedDay === day.dayNumber ? "secondary" : "ghost"}
              className="shrink-0"
              aria-pressed={selectedDay === day.dayNumber}
              onClick={() => selectDay(day.dayNumber)}
            >
              {formatEventDayLabel(day)}
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={addDay} disabled={updateEvent.isPending}>
            <Plus className="mr-1.5 size-3.5" />
            Add day
          </Button>
          <span className="shrink-0 text-xs text-muted-foreground">Event-wide sections stay shared. Schedules and shifts follow the selected day.</span>
        </div>
      </div> : null}
    </section>
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
  const [, navigate] = useLocation();
  const search = useSearch();
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const launchProgress = useEventLaunchProgress(event);
  const { data: health } = useEventHealth(id);
  const { data: identity } = useMe();
  const { experience } = useAccountExperience();
  const { timeZone } = usePreferences(event?.timeZone);
  const active = tabFromSlug(slug);
  const plan = effectivePlan(identity?.access);
  const returnTarget = eventDetailsReturnTarget(id, search);
  const selectLaunchStep = (step: EventLaunchStepId) => {
    if (!launchProgress.unlocked[step]) return;
    navigate(eventLaunchStepHref(id, step));
  };

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

  if (!identity?.eventScope && (event.experience ?? "standard") !== experience) {
    return <Redirect to="/app" replace />;
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

  const days = eventDayOptions(event.date, event.endDate, timeZone);
  const selectedDay = selectedEventDay(search, days);
  const guidedInviteList = active === "registrations" && returnTarget.label === "Back to launch guide";
  const launchWorkspace = active === "share";

  return (
    <div className={cn("space-y-6", (guidedInviteList || launchWorkspace) && "mx-auto max-w-6xl")}>
      {guidedInviteList ? (
        <EventLaunchContextBar
          activeStep={2}
          eventTitle={event.title}
          backHref={returnTarget.href}
          completion={launchProgress.completion}
          unlocked={launchProgress.unlocked}
          onStepSelect={selectLaunchStep}
        />
      ) : !launchWorkspace ? (
        <WorkspaceHeader
          event={event}
          health={health}
          active={active}
          plan={plan}
          experience={experience}
          canManageAccess={identity?.role === "owner"}
        />
      ) : null}
      {!guidedInviteList && !launchWorkspace && active !== "overview" ? <EventLiveUpdates event={event} /> : null}
      {active === "overview" ? <OverviewSection event={event} health={health} /> : null}
      {active === "registrations" ? <GuestsSection event={event} /> : null}
      {active === "check-in" ? <CheckInPanel event={event} /> : null}
      {active === "run-of-show" ? <RunOfShowPanel event={event} selectedDay={selectedDay} /> : null}
      {active === "checklist" ? <ChecklistWorkspace key={event.id} event={event} /> : null}
      {active === "volunteers" ? <VolunteersPanel event={event} allowSpreadsheetImport selectedDay={selectedDay} /> : null}
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
      {active === "share" ? <ShareSection key={event.id} event={event} /> : null}
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
