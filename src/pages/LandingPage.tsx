/**
 * Marketing page.
 *
 * Rewritten for two reasons beyond looks:
 *
 * 1. The previous version invented its proof — "200+ hours saved annually per team",
 *    "40% lower vendor costs on average", "3× faster event setup" — alongside a fake
 *    copy-link and fictional vendor names presented as an existing network. None of it
 *    was measured. Every claim here is something you can check by opening the demo, and
 *    the demo is real: no sign-up, seeded data, every screen works.
 *
 * 2. It hardcoded `bg-white`, `bg-gray-900` and `text-gray-400`, so dark mode was dead
 *    on this page and body copy sat at 3.1:1 contrast. Tokens only now.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  FileStack,
  Heart,
  LayoutDashboard,
  Store,
  Ticket,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo, BrandLogoLink } from "@/components/BrandLogo";
import { Pill } from "@/components/primitives";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------------- pieces */

function HexShape({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  const width = size;
  const height = size * 0.866;
  const points = [
    [width * 0.5, 0],
    [width, height * 0.25],
    [width, height * 0.75],
    [width * 0.5, height],
    [0, height * 0.75],
    [0, height * 0.25],
  ]
    .map((point) => point.join(","))
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lede,
  onYellow = false,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  /** True inside a brand-yellow section, where the ink goes black. */
  onYellow?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <p className={cn("eyebrow", onYellow && "text-primary-foreground/70")}>{eyebrow}</p>
      <h2 className={cn("display-lg", onYellow ? "text-primary-foreground" : "text-foreground")}>{title}</h2>
      {lede ? (
        <p className={cn("text-lg leading-relaxed", onYellow ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- content */

const capabilities = [
  {
    icon: BellRing,
    title: "It tells you what needs deciding",
    body:
      "Today opens with a ranked worklist, not a wall of counters. “Catering and Print still unconfirmed, in 6 days.” Each line links straight to the screen that fixes it.",
  },
  {
    icon: LayoutDashboard,
    title: "One workspace per event",
    body:
      "Overview, Plan, Guests, Vendors, Budget, Share. Readiness combines checklist progress, vendor confirmation and registrations, weighted by what actually applies.",
  },
  {
    icon: Store,
    title: "Vendors and their replies together",
    body:
      "Your directory, filterable by city for multi-location work, with each vendor's conversation on their own page. Unread replies sit on the sidebar until you deal with them.",
  },
  {
    icon: Ticket,
    title: "Tickets with a public checkout",
    body:
      "Set price and allocation, turn sharing on, send one link. Buyers see live remaining counts; you get a confirmed registration and the buyer in your people list.",
  },
  {
    icon: Coins,
    title: "Money that reconciles",
    body:
      "Budget lines with estimate against actual and variance, ticket revenue, sponsorships, auctions and raffles. Amounts are integer cents end to end, so totals add up exactly.",
  },
  {
    icon: FileStack,
    title: "The next event starts at 80%",
    body:
      "Save any event as a template and its checklist, run of show and budget come with it. Create from a template and they land in the new event in one step.",
  },
] as const;

const replaces = [
  { instead: "A spreadsheet per event, and a different one per business unit", now: "One registry, grouped by venue, category or status" },
  { instead: "Fourteen tabs on a single event page", now: "Six sections, in the order you actually work" },
  { instead: "Chasing vendors through your inbox", now: "A thread per vendor, with unread counts that clear" },
  { instead: "Finding out you overspent after the event", now: "Estimate against actual per line, flagged while it matters" },
  { instead: "A separate ticketing tool and a manual guest list", now: "Checkout that writes straight into your registrations" },
  { instead: "Rebuilding the same plan from scratch", now: "Templates carrying checklist, run of show and budget" },
] as const;

const audiences = [
  {
    icon: Zap,
    tag: "Lean operating teams",
    headline: "Two people running what looks like a ten-person operation",
    points: [
      "An event live in minutes from a company template",
      "No implementation project before it is useful",
      "One screen that says what is at risk today",
    ],
  },
  {
    icon: Building2,
    tag: "Distributed and franchise operators",
    headline: "Every business unit's events in one registry",
    points: [
      "Group the portfolio by venue, category or status",
      "Saved venues keep their own event history",
      "Filter the vendor network by city across locations",
    ],
  },
  {
    icon: Heart,
    tag: "Nonprofits and associations",
    headline: "Fundraising built in, not bolted on",
    points: [
      "Silent and live auction lots with current bids",
      "Raffles drawn fairly, weighted by tickets bought",
      "Sponsorship tiers, confirmed against pipeline",
    ],
  },
] as const;

const packages = [
  {
    name: "Essential",
    price: "$2,000",
    note: "starting at · 25–75 guests",
    bestFor: "Lean teams and startups",
    description:
      "Everything needed to run a polished team offsite or a small corporate gathering, with vendors pre-matched and ready to go.",
    featured: false,
    includes: [
      "Venue sourcing and coordination",
      "AV and tech setup",
      "Catering coordination",
      "Run of show template",
      "2 curated vendor slots",
    ],
    categories: [
      { category: "Venue", examples: "Hotel meeting rooms, co-working event spaces" },
      { category: "AV & Tech", examples: "Microphones, screens, basic livestream" },
      { category: "Catering", examples: "Box lunches, coffee service and snacks" },
    ],
  },
  {
    name: "Professional",
    price: "$5,000",
    note: "starting at · 75–200 guests",
    bestFor: "Mid-size corporate teams",
    description:
      "Full service for corporate events that need to impress: every vendor category covered, plus a live Beebizy workspace with budget and floorplan tools.",
    featured: true,
    includes: [
      "Everything in Essential",
      "Photography and videography",
      "Floorplan editor",
      "Budget tracker and ROI report",
      "Full checklist library",
    ],
    categories: [
      { category: "Venue", examples: "Conference hotels, ballrooms, rooftops" },
      { category: "AV & Tech", examples: "Full crews, hybrid livestream, LED walls" },
      { category: "Catering", examples: "Plated dinner, cocktail reception, dietary tracking" },
      { category: "Photography", examples: "Event photographer plus highlight reel" },
    ],
  },
  {
    name: "Enterprise",
    price: "$12,000",
    note: "starting at · 200+ guests",
    bestFor: "Distributed enterprise teams",
    description:
      "The full experience: a dedicated coordinator, multi-location vendor mapping, fundraising tools and every operations feature for a large-scale event.",
    featured: false,
    includes: [
      "Everything in Professional",
      "Multi-location vendor mapping",
      "Fundraising and auction tools",
      "Sponsorship management",
      "Dedicated Beebizy coordinator",
    ],
    categories: [
      { category: "Venue", examples: "Convention centers, multi-room hotels" },
      { category: "AV & Tech", examples: "Enterprise AV, multi-camera, hybrid streaming" },
      { category: "Catering", examples: "Multi-day catering, allergen tracking" },
      { category: "Photography", examples: "Multi-photographer coverage and video team" },
      { category: "Fundraising", examples: "Auction setup, sponsorship tier management" },
    ],
  },
] as const;

/**
 * A still of the product's own Today screen, built from the same tokens as the app.
 * It illustrates our own UI rather than standing in for a customer — the demo one click
 * away shows exactly this, with this data.
 */
function TodayPreview() {
  const rows = [
    { level: "urgent", message: "“Confirm final headcount with catering” is overdue", event: "Global Sales Kickoff" },
    { level: "urgent", message: "Catering and Print still unconfirmed, in 6 days", event: "Global Sales Kickoff" },
    { level: "watch", message: "Print and Catering still unconfirmed, in 3 weeks", event: "Atlas Launch — Press & Analyst Day" },
    { level: "watch", message: "Still a draft and it starts in 6 weeks", event: "Platform Engineering Offsite" },
  ] as const;

  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-card shadow-lg">
      <div className="flex items-baseline justify-between border-b border-hairline px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Needs you</p>
          <p className="text-xs text-muted-foreground">2 urgent items across your events</p>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Today</span>
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((row) => (
          <li key={row.message} className="flex items-start gap-3 px-5 py-3">
            <Pill tone={row.level === "urgent" ? "danger" : "warning"}>{row.level}</Pill>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{row.message}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.event}</span>
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline bg-surface-sunken px-5 py-2.5 text-xs text-muted-foreground">
        Every line links to the section that fixes it.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ page */

export function LandingPage() {
  const [openPackage, setOpenPackage] = useState<number | null>(null);
  const active = openPackage === null ? null : packages[openPackage]!;

  return (
    <div className="min-h-dvh bg-background font-sans">
      <header className="sticky top-0 z-50 border-b border-hairline bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <BrandLogoLink size="lg" />
          <nav className="flex items-center gap-1 sm:gap-3">
            <a
              href="#capabilities"
              className="hidden rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              What it does
            </a>
            <a
              href="#who"
              className="hidden rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              Who it's for
            </a>
            <a
              href="#packages"
              className="hidden rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              Packages
            </a>
            <Link
              href="/login"
              className="hidden rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Log in
            </Link>
            <Button asChild className="font-semibold">
              <Link href="/app">Open the demo</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="honeycomb relative overflow-hidden bg-primary text-primary-foreground">
          {/*
            Decoration is confined to the right half and sits behind everything. Scattered
            across the whole hero, the drifting hexagons landed on top of the headline.
          */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-40 md:block" aria-hidden="true">
            <HexShape size={104} className="hex-drift absolute right-[6%] top-10 text-primary-foreground" style={{ animationDelay: "0s" }} />
            <HexShape size={62} className="hex-drift-slow absolute right-[38%] top-28 text-primary-foreground" style={{ animationDelay: "1.2s" }} />
            <HexShape size={78} className="hex-drift absolute bottom-14 right-[24%] text-primary-foreground" style={{ animationDelay: "0.8s" }} />
            <HexShape size={44} className="hex-drift-slow absolute bottom-28 right-[4%] text-primary-foreground" style={{ animationDelay: "1.9s" }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 lg:pb-16 lg:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <div className="space-y-7">
                <p className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3.5 py-1.5 text-sm font-semibold text-primary-foreground">
                  <span className="size-2 rounded-full bg-primary-foreground" aria-hidden="true" />
                  B2B event management software
                </p>

                <h1 className="display-xl max-w-2xl text-primary-foreground">
                  Giving teams of 2 the manpower of 10
                </h1>

                <p className="max-w-xl text-lg leading-relaxed text-primary-foreground/80 sm:text-xl">
                  Beebizy is the event operations layer for companies: the plan, the vendors, the
                  guest list, the ticketing, the fundraising and the money in one system — and it
                  tells your team what needs deciding before it becomes a problem.
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg" variant="secondary" className="h-12 px-7 text-base font-bold">
                    <Link href="/app">
                      Open the demo
                      <ArrowRight className="ml-2 size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 border-2 border-primary-foreground/25 bg-transparent px-7 text-base font-bold text-primary-foreground"
                  >
                    <a href="#capabilities">See what it does</a>
                  </Button>
                </div>

                <p className="text-sm text-primary-foreground/75">
                  No sign-up, no credit card. The demo is the real product loaded with a sample
                  portfolio — create, edit and delete anything in it.
                </p>
              </div>

              <TodayPreview />
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="border-b border-hairline py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              eyebrow="What it does"
              title="Six things, done properly"
              lede="Each of these is a screen you can open in the demo right now."
            />
            <div className="mt-14 grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <div key={capability.title} className="space-y-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                    <capability.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="title-sm text-foreground">{capability.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{capability.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it replaces */}
        <section className="honey-band border-b border-hairline py-20 lg:py-24">
          <div className="mx-auto max-w-4xl px-6">
            <SectionHeading
              eyebrow="Why teams switch"
              title="Stop patching three tools together"
              lede="No invented percentages — just what changes on day one."
            />
            <ul className="mt-12 space-y-3">
              {replaces.map((row) => (
                <li
                  key={row.instead}
                  className="grid gap-3 rounded-xl border border-hairline bg-surface p-4 sm:grid-cols-2 sm:gap-6"
                >
                  <div className="flex items-start gap-2.5">
                    <X className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">{row.instead}</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{row.now}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Audiences */}
        <section id="who" className="border-b border-hairline py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              eyebrow="Who it's for"
              title="Three kinds of organization. One system that gets out of the way."
            />
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {audiences.map((audience) => (
                <div
                  key={audience.tag}
                  className="flex flex-col gap-5 rounded-2xl border border-card-border bg-card p-7 shadow-xs transition-shadow hover:shadow-md"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                    <audience.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {audience.tag}
                    </p>
                    <h3 className="headline text-foreground">{audience.headline}</h3>
                  </div>
                  <ul className="flex-1 space-y-2.5">
                    {audience.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                        <span className="text-sm text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/app"
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground hover:gap-2.5 focus-visible:gap-2.5"
                  >
                    See it in the demo <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Event types */}
        <section className="honey-band border-b border-hairline py-20 lg:py-24">
          <div className="mx-auto max-w-5xl px-6">
            <SectionHeading
              eyebrow="Event types"
              title="Built for the events companies actually run"
              lede="The same tools run a 20-person offsite and a 2,000-person summit."
            />
            <div className="mt-12 flex flex-wrap justify-center gap-2.5">
              {[
                "Annual summit",
                "Team offsite",
                "Product launch",
                "Awards ceremony",
                "Customer conference",
                "Town hall",
                "Fundraising gala",
                "Company party",
                "Sales kickoff",
                "Training day",
                "Investor day",
                "Multi-city roadshow",
              ].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Packages */}
        <section id="packages" className="border-b border-hairline py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              eyebrow="Corp packages"
              title="Or hand the whole thing over"
              lede="For teams who would rather buy the outcome: we match the vendors and run it in Beebizy alongside you."
            />
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {packages.map((pkg, index) => (
                <div
                  key={pkg.name}
                  className={cn(
                    "relative flex flex-col gap-5 rounded-2xl border bg-card p-7",
                    pkg.featured ? "border-primary shadow-md" : "border-card-border shadow-xs",
                  )}
                >
                  {pkg.featured ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                      Most popular
                    </span>
                  ) : null}

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{pkg.name}</p>
                    <p data-numeric className="display-md text-foreground">
                      {pkg.price}
                    </p>
                    <p className="text-xs text-muted-foreground">{pkg.note}</p>
                  </div>

                  <p className="text-sm text-muted-foreground">{pkg.description}</p>

                  <ul className="flex-1 space-y-2.5">
                    {pkg.includes.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                        <span className="text-sm text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Vendor categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.categories.map((entry) => (
                        <Pill key={entry.category}>{entry.category}</Pill>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant={pkg.featured ? "default" : "outline"}
                    className="w-full font-bold"
                    onClick={() => setOpenPackage(index)}
                  >
                    What's included
                    <ArrowRight className="ml-1.5 size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="honeycomb bg-primary py-20 lg:py-24 text-primary-foreground">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <SectionHeading
              onYellow
              eyebrow="Try it"
              title="Open it and look at the worklist."
              lede="A sample company portfolio: an event six days out with a caterer who never confirmed, a gala mid-fundraise, and two that already happened. Nothing to set up."
            />
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="h-12 px-8 text-base font-bold">
                <Link href="/app">
                  Open the demo
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-2 border-primary-foreground/25 bg-transparent px-8 text-base font-bold text-primary-foreground"
              >
                <Link href="/signup">Talk to us</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Package detail */}
      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${active.name} package`}
          onClick={() => setOpenPackage(null)}
        >
          <div
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-border bg-card shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline p-6">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {active.name} package
                </p>
                <p data-numeric className="display-md text-foreground">
                  {active.price}
                </p>
                <p className="text-xs text-muted-foreground">{active.note}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpenPackage(null)} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-6 p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">{active.description}</p>

              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Best for</p>
                <p className="text-sm font-medium text-foreground">{active.bestFor}</p>
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  What's included
                </p>
                <ul className="space-y-2">
                  {active.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Vendor categories we cover
                </p>
                <ul className="space-y-2.5">
                  {active.categories.map((entry) => (
                    <li key={entry.category} className="flex items-start gap-3">
                      <span className="w-24 shrink-0">
                        <Pill>{entry.category}</Pill>
                      </span>
                      <span className="text-sm text-muted-foreground">{entry.examples}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2 border-t border-hairline pt-5 sm:flex-row">
                <Button asChild className="flex-1 font-bold">
                  <Link href="/app">
                    Try it in the demo
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button variant="outline" className="flex-1 font-bold" onClick={() => setOpenPackage(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 sm:flex-row">
          <BrandLogo size="sm" />
          <nav className="flex flex-wrap items-center justify-center gap-5 text-sm font-medium text-muted-foreground">
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              What it does
            </a>
            <a href="#who" className="transition-colors hover:text-foreground">
              Who it's for
            </a>
            <a href="#packages" className="transition-colors hover:text-foreground">
              Packages
            </a>
            <Link href="/app" className="transition-colors hover:text-foreground">
              Demo
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Log in
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Beebizy Inc.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
