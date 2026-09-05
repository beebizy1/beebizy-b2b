/**
 * Application chrome.
 *
 * The rail is the whole chrome: a 256px white sidebar carrying the brand lockup, the
 * workspace it is customised for, twelve flat destinations, and sign-out. There is no
 * top bar — no search field, no avatar menu — so the content canvas starts at the top
 * of the viewport and every screen owns its own header.
 *
 * Two things survive from the previous shell because they were fixes, not taste:
 *   - `SidebarContent` stays a module-level component. Declared inline it remounted on
 *     every render and lost focus and scroll position.
 *   - The auth gate runs during render via `RequireSession`, not in an effect, so the
 *     dashboard never flashes before redirecting.
 *
 * The demo and beta notices moved into the content column. They used to sit in the
 * header, which no longer exists.
 */

import { useState, type ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Clock3, LockKeyhole, LogOut, Menu, Settings, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLogo, BrandLogoLink } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { useMe } from "@/data/hooks";
import { useDataMode } from "@/data/provider";
import type { Identity } from "@/data/adapter";
import { useSession } from "@/app/session";
import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { isNavActive, NAV_ITEMS, type NavItem } from "./nav";

/**
 * The workspace a signed-in rail is customised for.
 *
 * Two named workspaces have their own artwork; everything else renders its name in the
 * same slot rather than borrowing another customer's logo.
 */
function WorkspaceMark({ label }: { label: string }) {
  const key = label.toLowerCase();

  if (key.includes("hwood")) {
    return <img src="/hwood-group-logo.png" alt="Hwood Group" className="max-h-10 max-w-[180px] object-contain object-left" />;
  }

  if (key.includes("campbell")) {
    return (
      <div className="flex items-center gap-2">
        <img src="/campbell-hall-seal.png" alt="" aria-hidden="true" className="size-8 object-contain" />
        <img
          src="/campbell-hall-logo.png"
          alt="Campbell Hall"
          className="h-6 w-auto object-contain"
          style={{ filter: "invert(1) brightness(0.2)" }}
        />
      </div>
    );
  }

  return <p className="truncate text-base font-semibold text-foreground">{label}</p>;
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <item.icon
        className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [pathname] = useLocation();
  const { user, signOut } = useSession();

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
      <div className="mb-4 flex flex-col gap-3 p-4">
        <BrandLogoLink to="/app" size="sm" />
        <div className="border-t border-sidebar-border pt-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customized for
          </p>
          <WorkspaceMark label={user?.name ?? "Beebizy Studio"} />
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} active={isNavActive(item.href, pathname)} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-4">
        {/* Settings used to live in the account menu. Removing the top bar took that
            menu with it, so the only way in is the footer. */}
        <Link
          href="/app/settings"
          onClick={onNavigate}
          className="flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground transition-colors hover:text-destructive"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
        <Link
          href="/marketing-preview"
          onClick={onNavigate}
          className="flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to site
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

export function AppShell({ children }: { children: ReactNode }) {
  const { open, setOpen } = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode } = useDataMode();
  const { data: identity, isLoading: identityLoading, error: identityError } = useMe();

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

  /*
   * The server refused. That is the only authority on whether this account may be here —
   * it is the side that can see both the operator allowlist and any outstanding invite.
   */
  if (mode === "live" && identityError) {
    return <Redirect to="/access-denied" replace />;
  }

  if (mode === "live" && identity && !["beta", "active"].includes(identity.access.status)) {
    return <AccessEnded access={identity.access} />;
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 md:block">
        <SidebarContent />
      </aside>

      <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center border-b border-border bg-background px-4 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2" aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <BrandLogo size="sm" />
      </div>

      <main id="main" className="flex min-h-dvh min-w-0 flex-1 flex-col pt-16 md:ml-64 md:pt-0">
        <DemoBanner />
        {mode === "live" ? <BetaBanner access={identity?.access} /> : null}
        {/* Screens return bare content; the canvas inset lives here, uncapped, so the
            page fills the width left of the rail the way the reference design does. */}
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
