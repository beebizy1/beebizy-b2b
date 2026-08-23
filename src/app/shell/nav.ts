/**
 * Navigation model.
 *
 * The old sidebar was fourteen flat items — Dashboard, Calendar, Events, Templates,
 * Locations, Vendors, Messages, Guests, Registrations, Reporting, Financial Data,
 * Checklists, Inspiration Card, Settings — with no hierarchy and no answer to "where
 * do I start?". Six destinations replace them, grouped by the question each answers.
 * Everything else moved inside the event it belongs to.
 */

import {
  BookMarked,
  CalendarDays,
  Coins,
  LayoutDashboard,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { EventSectionId } from "@/data/entities";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line, shown in the command palette. */
  hint: string;
  /** Which badge counter, if any, belongs on this item. */
  badge?: "attention" | "unread";
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: "/app",
    icon: LayoutDashboard,
    hint: "What needs you now, across every event",
    badge: "attention",
  },
  {
    label: "Events",
    href: "/app/events",
    icon: CalendarDays,
    hint: "Every event, its readiness and its workspace",
  },
  {
    label: "Guests",
    href: "/app/guests",
    icon: Users,
    hint: "Guests and their registrations",
  },
  {
    label: "Vendors",
    href: "/app/vendors",
    icon: Store,
    hint: "Vendors, bookings and conversations",
    badge: "unread",
  },
  {
    label: "Budget",
    href: "/app/budget",
    icon: Coins,
    hint: "Spend, ticket sales, fundraising and ROI",
  },
  {
    label: "Library",
    href: "/app/library",
    icon: BookMarked,
    hint: "Templates, venues and boards",
  },
];

export interface EventSection {
  id: EventSectionId;
  label: string;
  /** Appended to `/app/events/:id`. Empty for the default section. */
  slug: string;
  hint: string;
}

/**
 * Six sections instead of fourteen tabs. Menu, floorplan and the mood board live under
 * Vendors and Plan rather than competing for top-level attention, and fundraising
 * sits with the rest of the money.
 */
export const EVENT_SECTIONS: EventSection[] = [
  { id: "overview", label: "Overview", slug: "", hint: "Readiness, risks and the shape of the day" },
  { id: "plan", label: "Plan", slug: "plan", hint: "Checklist, run of show and mood board" },
  { id: "guests", label: "Guests", slug: "guests", hint: "Registrations and capacity" },
  { id: "vendors", label: "Vendors", slug: "vendors", hint: "Bookings, catering and the floorplan" },
  { id: "budget", label: "Budget", slug: "budget", hint: "Spend, tickets, fundraising and ROI" },
  { id: "share", label: "Share", slug: "share", hint: "Public event page and ticket link" },
];

export function eventSectionHref(eventId: string, section: EventSectionId): string {
  const match = EVENT_SECTIONS.find((s) => s.id === section);
  const slug = match?.slug ?? "";
  return slug ? `/app/events/${eventId}/${slug}` : `/app/events/${eventId}`;
}

export function sectionFromSlug(slug: string | undefined): EventSectionId {
  if (!slug) return "overview";
  return EVENT_SECTIONS.find((s) => s.slug === slug)?.id ?? "overview";
}

/** True when `href` is the active destination for `pathname`. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app" || pathname === "/app/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
