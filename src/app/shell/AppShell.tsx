/**
 * Application chrome.
 *
 * Fixes from the previous shell, all of which were real bugs rather than taste:
 *   - `Sidebar` was declared inside the layout component, so it remounted on every
 *     render and lost focus and scroll position. It is a module-level component now.
 *   - The auth gate lived in an effect, which flashed the dashboard before redirecting.
 *     `RequireSession` handles it during render instead.
 *   - Fourteen flat nav items became six grouped destinations with live counters, so
 *     the sidebar tells you where the work is rather than just listing tables.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BookOpen, Clock3, LockKeyhole, LogOut, Menu, Search, Settings, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLogoLink } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { useAttention, useMe, useVendors } from "@/data/hooks";
import { useDataMode } from "@/data/provider";
import type { Identity } from "@/data/adapter";
import { useSession } from "@/app/session";
import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { isNavActive, NAV_ITEMS, type NavItem } from "./nav";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

function NavRow({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
          : "font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon
        className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span
          data-numeric
          className={cn(
            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold",
            item.badge === "attention" ? "bg-danger text-danger-foreground" : "bg-info text-info-foreground",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [pathname] = useLocation();
  const { user } = useSession();
  const { data: attention } = useAttention();
  const { data: vendors } = useVendors();

  const counts = useMemo(() => {
    const urgent = attention?.filter((item) => item.level === "urgent").length ?? 0;
    const unread = vendors?.reduce((sum, vendor) => sum + vendor.unreadCount, 0) ?? 0;
    return { attention: urgent, unread };
  }, [attention, vendors]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-5 py-5">
        <BrandLogoLink to="/app" size="lg" />
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Private beta workspace</p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{user?.name ?? "Beebizy Studio"}</p>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            active={isNavActive(item.href, pathname)}
            count={item.badge ? counts[item.badge] : 0}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/about"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <BookOpen className="size-4" aria-hidden="true" />
          About Beebizy
        </Link>
      </div>
    </div>
  );
}

function DemoBanner() {
  const { mode, demoReason } = useDataMode();
  const [dismissed, setDismissed] = useState(false);
  if (mode !== "demo" || dismissed || !demoReason) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning-tint px-4 py-2 text-xs sm:px-6">
      <TriangleAlert className="size-3.5 shrink-0 text-warning-text" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-warning-text">
        <span className="font-semibold">Demo data.</span> {demoReason}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="font-semibold text-warning-text underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}

function BetaBanner({ access }: { access: Identity["access"] | undefined }) {
  if (!access || access.status !== "beta") return null;
  const end = new Date(access.betaEndsAt);
  const remaining = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/25 bg-primary/8 px-4 py-2 text-xs sm:px-6">
      <Clock3 className="size-3.5 shrink-0 text-primary-text" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-foreground">
        <span className="font-semibold">Private beta.</span>{" "}
        <span data-numeric>{remaining} {remaining === 1 ? "day" : "days"}</span> remaining. Free access ends{" "}
        <span data-numeric>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(end)}</span>.
      </p>
      <a href="mailto:hello@beebizy.com?subject=Beebizy%20Studio%20beta%20feedback" className="font-semibold text-primary-text underline underline-offset-2">
        Send feedback
      </a>
    </div>
  );
}

function AccessEnded({ access }: { access: Identity["access"] }) {
  const { signOut } = useSession();
  const ended = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(access.betaEndsAt));
  const copy = access.status === "past_due"
    ? {
        title: "Your Studio payment is past due",
        description: "Your workspace and event history are preserved. Update the subscription to restore access.",
        subject: "Update Beebizy Studio subscription",
      }
    : access.status === "cancelled"
      ? {
          title: "Your Studio subscription is cancelled",
          description: "Your workspace and event history are preserved. Contact Beebizy to reactivate access.",
          subject: "Reactivate Beebizy Studio",
        }
      : {
          title: "Your Studio beta has ended",
          description: `Your three-month beta period ended on ${ended}. Your workspace and event history are preserved. Contact Beebizy to activate paid access.`,
          subject: "Activate Beebizy Studio",
        };

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-lg space-y-6 text-center">
        <div className="flex justify-center"><BrandLogoLink to="/" size="lg" /></div>
        <div className="rounded-2xl border border-hairline bg-surface p-8 shadow-sm">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary-text">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <a href={`mailto:hello@beebizy.com?subject=${encodeURIComponent(copy.subject)}`}>Manage subscription</a>
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, isDemo, signOut } = useSession();
  const name = user?.name ?? "Signed out";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8 border border-hairline">
            {user?.photoURL ? <AvatarImage src={user.photoURL} alt="" /> : null}
            <AvatarFallback className="text-xs font-semibold">{initials(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          {user?.email ? <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p> : null}
          {isDemo ? <p className="text-xs font-normal text-warning-text">Demo session</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="mr-2 size-4" />
          {isDemo ? "Exit demo" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { open, setOpen } = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode } = useDataMode();
  const { data: identity, isLoading: identityLoading } = useMe();

  if (mode === "live" && identityLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading your Studio access…</p>
        </div>
      </div>
    );
  }

  if (mode === "live" && identity && !["beta", "active"].includes(identity.access.status)) {
    return <AccessEnded access={identity.access} />;
  }

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border lg:block xl:w-72 2xl:w-80">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64 xl:pl-72 2xl:pl-80">
        <header className="sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="lg:hidden">
              <BrandLogoLink to="/app" size="md" />
            </div>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground lg:ml-0 lg:w-72"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden truncate lg:inline">Search or jump to…</span>
              <kbd className="ml-auto hidden rounded border border-hairline bg-surface-sunken px-1.5 font-mono text-[10px] font-semibold lg:inline">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:flex-1 lg:justify-end">
              <UserMenu />
            </div>
          </div>
          <DemoBanner />
          {mode === "live" ? <BetaBanner access={identity?.access} /> : null}
        </header>

        <main id="main" className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:py-8 xl:px-8">
          {children}
        </main>
      </div>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
