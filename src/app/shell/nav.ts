/**
 * Navigation model.
 *
 * Twelve flat destinations, in the order and wording the Studio design uses. Every
 * table the product owns is reachable from the rail — Locations, Attendees and
 * Registrations are top-level rather than folded into an event, because that is how
 * the reference design lists them.
 */

import {
  BarChart2,
  Banknote,
  Calendar,
  CalendarDays,
  ClipboardList,
  CloudRain,
  Clock,
  DollarSign,
  FileText,
  Gavel,
  HandCoins,
  LayoutGrid,
  History as HistoryIcon,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  MessagesSquare,
  ScanLine,
  PieChart,
  Sparkles,
  Store,
  Ticket,
  Trophy,
  UtensilsCrossed,
  Users,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";
import { FEEDBACK_INBOX_PATH, type EventSectionId } from "@/data/entities";
import { planHasCapability, type PlanCapability, type PlanId } from "@/data/plans";
import type { WorkspaceExperience } from "@/data/workspaceExperience";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line, shown in the command palette. */
  hint: string;
  capability?: PlanCapability;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app",
    icon: LayoutDashboard,
    hint: "Portfolio health, decisions and AI planning suggestions",
  },
  {
    label: "Plan an event",
    href: "/app/plan",
    icon: Sparkles,
    hint: "Plan with Bee AI or start manually",
  },
  {
    label: "Calendar",
    href: "/app/calendar",
    icon: CalendarDays,
    hint: "Every event on one operating calendar",
  },
  {
    label: "Events",
    href: "/app/events",
    icon: Calendar,
    hint: "Every event, its readiness and its workspace",
  },
  {
    label: "Templates",
    href: "/app/templates",
    icon: FileText,
    hint: "Reusable events, checklists, run of show and boards",
  },
  {
    label: "Locations",
    href: "/app/locations",
    icon: MapPin,
    hint: "Venues and the events booked into them",
    capability: "multiLocation",
  },
  {
    label: "Vendors",
    href: "/app/vendors",
    icon: Store,
    hint: "Your vendors and Beebizy marketplace suggestions",
    capability: "vendorManagement",
  },
  {
    label: "Messages",
    href: "/app/messages",
    icon: MessageSquare,
    hint: "All vendor conversations in one inbox",
    capability: "vendorManagement",
  },
  {
    label: "Attendees",
    href: "/app/attendees",
    icon: Users,
    hint: "Everyone in your address book, across every event",
  },
  {
    label: "Registrations",
    href: "/app/registrations",
    icon: Ticket,
    hint: "Every registration and its status",
  },
  {
    label: "Reporting",
    href: "/app/reporting",
    icon: PieChart,
    hint: "Portfolio spend, revenue, attendance and ROI",
    capability: "customReporting",
  },
  {
    label: "Historical Data",
    href: "/app/history",
    icon: HistoryIcon,
    hint: "Past events, spend and planning decisions",
  },
];

const FEEDBACK_REVIEW_NAV_ITEM: NavItem = {
  label: "Pilot feedback",
  href: FEEDBACK_INBOX_PATH,
  icon: MessagesSquare,
  hint: "Private feedback inbox for the Beebizy product team",
};

const SANTA_CLARA_NAV_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter((item) => item.href === "/app" || item.href === "/app/events"),
  {
    label: "Import spreadsheet",
    href: "/app/plan",
    icon: FileText,
    hint: "Turn an Excel, CSV or Google Sheet plan into an event",
  },
];

export function visibleNavItems(
  canReviewFeedback: boolean,
  plan: PlanId = "enterprise",
  experience: WorkspaceExperience = "standard",
): NavItem[] {
  if (experience === "santa-clara") return SANTA_CLARA_NAV_ITEMS;
  const planItems = NAV_ITEMS.filter((item) => !item.capability || planHasCapability(plan, item.capability));
  return canReviewFeedback ? [...planItems, FEEDBACK_REVIEW_NAV_ITEM] : planItems;
}

export interface EventTab {
  id: EventTabId;
  label: string;
  /** Appended to `/app/events/:id`. Empty for the default tab. */
  slug: string;
  icon: LucideIcon | null;
  hint: string;
  capability?: PlanCapability;
}

export type EventTabId =
  | "overview"
  | "registrations"
  | "check-in"
  | "run-of-show"
  | "checklist"
  | "volunteers"
  | "contingency"
  | "vendors"
  | "budget"
  | "floorplan"
  | "inspiration"
  | "fundraising"
  | "analytics"
  | "menu"
  | "tickets"
  | "raffle"
  | "silent-auction"
  | "live-auction"
  | "rfp"
  | "deposits"
  /** Reachable by URL and from the header's Share button, but not a tab in the bar. */
  | "share";

/**
 * The event workspace, one tab per area of the work.
 *
 * Tab state lives in the URL rather than in component state, so a tab can be linked to
 * from the risk strip, a task list or a bookmark. The slugs are the tab ids, except
 * Overview, which is the bare event URL.
 */
export const EVENT_TABS: EventTab[] = [
  { id: "overview", label: "Overview", slug: "", icon: null, hint: "Readiness, risks and the event at a glance" },
  { id: "registrations", label: "Registrations", slug: "registrations", icon: Users, hint: "Invitations, registrations and capacity" },
  { id: "check-in", label: "Check-in", slug: "check-in", icon: ScanLine, hint: "Guest arrivals, entry stations and front-door notes" },
  { id: "run-of-show", label: "Run of Show", slug: "run-of-show", icon: Clock, hint: "Cue-by-cue schedule for the day" },
  { id: "checklist", label: "Checklist", slug: "checklist", icon: ClipboardList, hint: "Everything still to do, and who owns it" },
  { id: "volunteers", label: "Volunteers", slug: "volunteers", icon: HeartHandshake, hint: "Roles, shift times, attendance and volunteer notes" },
  {
    id: "contingency",
    label: "Contingency",
    slug: "contingency",
    icon: CloudRain,
    hint: "Weather triggers, backup plans and communications",
    capability: "contingencyPlanning",
  },
  { id: "vendors", label: "Vendors", slug: "vendors", icon: Store, hint: "Bookings and confirmations", capability: "vendorManagement" },
  { id: "budget", label: "Budget & ROI", slug: "budget", icon: DollarSign, hint: "Planned against actual, and the return" },
  { id: "floorplan", label: "Floorplan", slug: "floorplan", icon: LayoutGrid, hint: "Room layout, tables and zones" },
  { id: "inspiration", label: "Inspiration", slug: "inspiration", icon: Sparkles, hint: "Mood board for decor, staging and lighting", capability: "inspirationBoards" },
  { id: "fundraising", label: "Fundraising", slug: "fundraising", icon: HandCoins, hint: "Sponsorships and what they brought in" },
  { id: "analytics", label: "Analytics", slug: "analytics", icon: BarChart2, hint: "How the event performed", capability: "customReporting" },
  { id: "menu", label: "Menu", slug: "menu", icon: UtensilsCrossed, hint: "Courses, dietary requirements and covers" },
  { id: "tickets", label: "Tickets", slug: "tickets", icon: Ticket, hint: "Ticket types, allocation and sales" },
  { id: "raffle", label: "Raffle", slug: "raffle", icon: Trophy, hint: "Raffle prizes, tickets sold and the draw" },
  { id: "silent-auction", label: "Silent Auction", slug: "silent-auction", icon: Gavel, hint: "Silent lots and current bids" },
  { id: "live-auction", label: "Live Auction", slug: "live-auction", icon: Gavel, hint: "Live lots run from the stage" },
  { id: "rfp", label: "RFP", slug: "rfp", icon: FileText, hint: "Briefs out to vendors and the quotes back" },
  { id: "deposits", label: "Deposits", slug: "deposits", icon: Banknote, hint: "Money committed to vendors before the day" },
];

const SANTA_CLARA_EVENT_TAB_IDS: readonly EventTabId[] = [
  "run-of-show",
  "checklist",
  "budget",
  "floorplan",
  "registrations",
  "check-in",
  "volunteers",
];

const SANTA_CLARA_EVENT_HINTS: Partial<Record<EventTabId, string>> = {
  "run-of-show": "Build the minute-by-minute event schedule",
  checklist: "Assign every task, owner and due date",
  budget: "Track planned and actual line-item spend",
  floorplan: "Place fixed trees, chairs, tables and event zones",
  registrations: "Group guests as investor, company or general",
  "check-in": "Import lists, record arrivals and print badges",
  volunteers: "Assign roles, shift times and operating notes",
};

export function visibleEventTabs(
  plan: PlanId = "enterprise",
  experience: WorkspaceExperience = "standard",
): EventTab[] {
  if (experience === "santa-clara") {
    return SANTA_CLARA_EVENT_TAB_IDS.map((id) => {
      const tab = EVENT_TABS.find((item) => item.id === id)!;
      return {
        ...tab,
        label: id === "budget" ? "Budget" : tab.label,
        hint: SANTA_CLARA_EVENT_HINTS[id] ?? tab.hint,
      };
    });
  }
  return EVENT_TABS.filter((tab) => !tab.capability || planHasCapability(plan, tab.capability));
}

/**
 * Publishing is an action taken from the header, not a tab someone browses to, so it
 * has a route and a slug but no place in the bar.
 */
const HIDDEN_TABS: EventTab[] = [
  { id: "share", label: "Publish", slug: "share", icon: null, hint: "Public event page and invitation link" },
];

/**
 * Where a computed risk should send someone.
 *
 * `derive` reasons in six broad sections; the rail has seventeen tabs. This maps one
 * onto the other so a risk link lands on the tab that can actually fix it.
 */
const SECTION_TAB: Record<EventSectionId, EventTabId> = {
  overview: "overview",
  plan: "checklist",
  guests: "registrations",
  vendors: "vendors",
  budget: "budget",
  share: "share",
};

export function eventTabHref(eventId: string, tab: EventTabId): string {
  const slug = [...EVENT_TABS, ...HIDDEN_TABS].find((t) => t.id === tab)?.slug ?? "";
  return slug ? `/app/events/${eventId}/${slug}` : `/app/events/${eventId}`;
}

/** Href for a risk or task that was computed against a broad section. */
export function eventSectionHref(eventId: string, section: EventSectionId): string {
  return eventTabHref(eventId, SECTION_TAB[section]);
}

export function eventSectionLabel(section: EventSectionId): string {
  const tab = SECTION_TAB[section];
  return [...EVENT_TABS, ...HIDDEN_TABS].find((t) => t.id === tab)?.label ?? "Overview";
}

export function tabFromSlug(slug: string | undefined): EventTabId | null {
  if (!slug) return "overview";
  return [...EVENT_TABS, ...HIDDEN_TABS].find((t) => t.slug === slug)?.id ?? null;
}

/** True when `href` is the active destination for `pathname`. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app" || pathname === "/app/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Routes retained for the focused pilot. Event section access is narrowed separately. */
export function isAppPathAllowed(pathname: string, experience: WorkspaceExperience): boolean {
  if (experience === "standard") return true;
  return (
    pathname === "/app" ||
    pathname === "/app/" ||
    pathname === "/app/plan" ||
    pathname === "/app/settings" ||
    pathname === "/app/events" ||
    pathname.startsWith("/app/events/")
  );
}
