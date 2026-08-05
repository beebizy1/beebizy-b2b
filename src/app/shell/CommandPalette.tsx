/**
 * ⌘K palette.
 *
 * With six destinations and an event workspace behind each event, typing beats
 * clicking for anyone who runs more than a couple of events. Search covers every
 * event by title, category and venue, so "gala" reaches the workspace in two
 * keystrokes instead of Events → scroll → click.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CalendarDays, ListChecks, Plus, Search, Store, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useEvents } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { NAV_ITEMS } from "./nav";

export function useCommandPalette(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

/**
 * Ranking that matches how people actually search.
 *
 * cmdk's default filter scores subsequences, so typing "atlas" ranked "Library ·
 * Templates, venues and inspiration" above the event literally called "Atlas Launch"
 * — the letters a-t-l-a-s appear in order across that string. Substring and
 * word-prefix matches win here, and non-matches score 0 so they disappear entirely.
 */
function score(value: string, search: string): number {
  const haystack = value.toLowerCase();
  const needle = search.trim().toLowerCase();
  if (!needle) return 1;

  const index = haystack.indexOf(needle);
  if (index === 0) return 1;
  if (index > 0) {
    // A match at a word boundary beats one buried mid-word.
    const atWordStart = /[\s·—-]/.test(haystack[index - 1] ?? "");
    return (atWordStart ? 0.9 : 0.7) - Math.min(index, 60) / 600;
  }

  // Multi-word queries ("gala tick") match if every word appears somewhere.
  const words = needle.split(/\s+/);
  if (words.length > 1 && words.every((word) => haystack.includes(word))) return 0.5;

  return 0;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { when } = usePreferences();
  const [, navigate] = useLocation();
  const { data: events } = useEvents();

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  // Upcoming first — that is what people are almost always looking for.
  const orderedEvents = useMemo(() => {
    if (!events) return [];
    const now = Date.now();
    return events
      .slice()
      .sort((a, b) => {
        const aFuture = new Date(a.date).getTime() >= now;
        const bFuture = new Date(b.date).getTime() >= now;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      })
      .slice(0, 40);
  }, [events]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <Command loop filter={score}>
          <CommandInput placeholder="Search events, jump to a section, or start something new…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No matches.</CommandEmpty>

            <CommandGroup heading="Create">
              <CommandItem value="new event create" onSelect={() => go("/app/events/new")}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                New event
              </CommandItem>
              <CommandItem value="new vendor supplier create" onSelect={() => go("/app/vendors/new")}>
                <Store className="mr-2 size-4" aria-hidden="true" />
                New vendor
              </CommandItem>
              <CommandItem value="new attendee person create" onSelect={() => go("/app/people/new")}>
                <UserPlus className="mr-2 size-4" aria-hidden="true" />
                New attendee
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Go to">
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.href} value={`${item.label} ${item.hint}`} onSelect={() => go(item.href)}>
                  <item.icon className="mr-2 size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {orderedEvents.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Events">
                  {orderedEvents.map((event) => (
                    <CommandItem
                      key={event.id}
                      value={`${event.title} ${event.category} ${event.locationRecord?.name ?? event.location ?? ""}`}
                      onSelect={() => go(`/app/events/${event.id}`)}
                    >
                      <CalendarDays className="mr-2 size-4" aria-hidden="true" />
                      <span className="truncate">{event.title}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{when(event.date)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            <CommandSeparator />

            <CommandGroup heading="Preferences">
              <CommandItem value="tasks open checklist todo" onSelect={() => go("/app/tasks")}>
                <ListChecks className="mr-2 size-4" aria-hidden="true" />
                All open tasks
              </CommandItem>
              <CommandItem value="settings preferences" onSelect={() => go("/app/settings")}>
                <Search className="mr-2 size-4" aria-hidden="true" />
                Settings
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
