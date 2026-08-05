/**
 * 404. The old version hardcoded `bg-gray-50` and `text-gray-900`, so in dark mode it
 * rendered near-black text on a dark card and the heading was unreadable. It also asked
 * the user "did you forget to add the page to the router?", which is a note to a
 * developer, not a message to a person who clicked a stale link.
 */

import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-card-border bg-card p-6 text-center shadow-xs">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-surface-sunken text-muted-foreground">
          <Compass className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">This page doesn't exist</h1>
          <p className="text-sm text-muted-foreground">
            The link may be out of date. Everything is reachable from Today, or with ⌘K.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/app">Go to Today</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/app/events">All events</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
