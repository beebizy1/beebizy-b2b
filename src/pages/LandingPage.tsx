import { useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Zap,
  Heart,
  LayoutDashboard,
  Users,
  CalendarCheck,
  BarChart3,
  Building2,
  Layers,
  Trophy,
  Megaphone,
  PartyPopper,
  Briefcase,
  X,
} from "lucide-react";

const personas = [
  {
    icon: Globe2,
    tag: "Distributed Enterprise Teams",
    headline: "Coordinate events across every time zone — without losing the thread.",
    description:
      "Large organizations need more than a scheduling tool. Beebizy gives enterprise teams a single source of truth for every event: who owns it, who's attending, and what's happening next — across every region and department.",
    proof: [
      "Centralized event registry across all business units",
      "Acts as a centralized system for franchises",
      "Real-time attendance visibility for stakeholders",
      "Structured categories and status workflows at scale",
      "Capacity planning that keeps ops teams aligned",
    ],
    panel: "from-violet-600 via-purple-600 to-indigo-700",
    pill: "from-violet-500 to-indigo-600",
    check: "text-violet-500",
    stats: [
      { label: "Active Events", value: "42" },
      { label: "Confirmed Attendees", value: "1,840" },
      { label: "Upcoming (30d)", value: "8" },
    ],
  },
  {
    icon: Zap,
    tag: "Lean Operating Teams",
    headline: "Ship events fast. Skip the overhead.",
    description:
      "Small teams move at startup speed. Beebizy was built for organizers who can't afford 3-week onboarding or a 40-tab dashboard. Create an event, add attendees, and go — in under two minutes.",
    proof: [
      "Event live in under 2 minutes from blank slate",
      "No complex setup, no training required",
      "Attendee and registration management in one view",
      "Built-in stats so you never need a spreadsheet",
    ],
    panel: "from-amber-500 via-orange-500 to-rose-500",
    pill: "from-amber-500 to-orange-500",
    check: "text-orange-500",
    stats: [
      { label: "Active Events", value: "7" },
      { label: "Confirmed Attendees", value: "94" },
      { label: "Upcoming (30d)", value: "3" },
    ],
  },
  {
    icon: Heart,
    tag: "Mission-Driven Organizations",
    headline: "Run events that reflect your values — not your budget constraints.",
    description:
      "Nonprofits, advocacy groups, and community organizations don't have dedicated event ops staff. Beebizy handles the logistics so your team can focus on impact, outreach, and the people who show up.",
    proof: [
      "Simple volunteer and attendee tracking",
      "Clear registration status for community planning",
      "Lightweight enough for a two-person operations team",
      "No per-seat pricing or bloated feature tiers",
    ],
    panel: "from-teal-500 via-emerald-500 to-green-600",
    pill: "from-teal-500 to-emerald-600",
    check: "text-teal-500",
    stats: [
      { label: "Active Events", value: "12" },
      { label: "Confirmed Attendees", value: "318" },
      { label: "Upcoming (30d)", value: "4" },
    ],
  },
];

const features = [
  {
    icon: LayoutDashboard,
    title: "One Dashboard",
    desc: "All events, all teams, all statuses — visible in a single view. No tab-switching, no exports needed.",
  },
  {
    icon: Users,
    title: "Attendee CRM",
    desc: "Know exactly who's registered, confirmed, or cancelled for every event across your organization.",
  },
  {
    icon: CalendarCheck,
    title: "Registration Engine",
    desc: "Manage registrations with a click. Confirm, cancel, or reassign attendees without touching a spreadsheet.",
  },
  {
    icon: BarChart3,
    title: "Live Analytics",
    desc: "Capacity utilization, category breakdowns, confirmed vs pending — updated the moment data changes.",
  },
];

function HexShape({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  const w = size;
  const h = size * 0.866;
  const pts = [
    [w * 0.5, 0], [w, h * 0.25], [w, h * 0.75],
    [w * 0.5, h], [0, h * 0.75], [0, h * 0.25],
  ].map((p) => p.join(",")).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style}>
      <polygon points={pts} fill="currentColor" />
    </svg>
  );
}

const corpPackages = [
  {
    name: "Essential",
    price: "$2,000",
    note: "starting at · 25–75 attendees",
    bestFor: "Lean teams & startups",
    description: "Everything you need to run a polished team offsite or small corporate gathering — with vetted vendors pre-matched and ready to go.",
    highlight: false,
    borderColor: "border-amber-500/30",
    accent: "text-amber-400",
    accentBg: "bg-amber-50",
    accentSolid: "text-amber-600",
    pillGradient: "from-amber-500 to-orange-400",
    includes: [
      "Venue sourcing & coordination",
      "AV & tech setup",
      "Catering coordination",
      "Run of show template",
      "2 curated vendor slots",
    ],
    vendorCategories: [
      { category: "Venue", examples: "Hotel meeting rooms, co-working event spaces" },
      { category: "AV & Tech", examples: "Microphones, screens, basic livestream" },
      { category: "Catering", examples: "Box lunches, coffee service & snacks" },
    ],
    vendors: ["Venue", "AV", "Catering"],
  },
  {
    name: "Professional",
    price: "$5,000",
    note: "starting at · 75–200 attendees",
    bestFor: "Mid-size corporate teams",
    description: "A full-service package for corporate events that need to impress — every vendor category covered, plus a live Beebizy workspace with floorplan and budget tools.",
    highlight: true,
    borderColor: "border-primary",
    accent: "text-primary",
    accentBg: "bg-primary/5",
    accentSolid: "text-primary",
    pillGradient: "from-primary to-orange-400",
    includes: [
      "Everything in Essential",
      "Photography & videography",
      "Custom floorplan editor",
      "Budget tracker + ROI report",
      "Full checklist library",
    ],
    vendorCategories: [
      { category: "Venue", examples: "Conference hotels, ballrooms, rooftops" },
      { category: "AV & Tech", examples: "Full A/V crews, hybrid livestream, LED walls" },
      { category: "Catering", examples: "Plated dinner, cocktail reception, dietary tracking" },
      { category: "Photography", examples: "Event photographer + highlight reel" },
    ],
    vendors: ["Venue", "AV", "Catering", "Photo"],
  },
  {
    name: "Enterprise",
    price: "$12,000",
    note: "starting at · 200+ attendees",
    bestFor: "Distributed enterprise teams",
    description: "The full Beebizy experience — a dedicated coordinator, multi-location vendor mapping, fundraising tools, and every ops feature for a large-scale corporate event.",
    highlight: false,
    borderColor: "border-violet-500/30",
    accent: "text-violet-400",
    accentBg: "bg-violet-50",
    accentSolid: "text-violet-600",
    pillGradient: "from-violet-600 to-indigo-600",
    includes: [
      "Everything in Professional",
      "Multi-location vendor mapping",
      "Fundraising & auction tools",
      "Sponsorship management",
      "Dedicated Beebizy coordinator",
    ],
    vendorCategories: [
      { category: "Venue", examples: "Convention centers, multi-room hotels" },
      { category: "AV & Tech", examples: "Enterprise A/V, multi-camera, hybrid streaming" },
      { category: "Catering", examples: "Multi-day catering, dietary & allergen tracking" },
      { category: "Photography", examples: "Multi-photographer coverage + videography team" },
      { category: "Fundraising", examples: "Auction setup, sponsorship tier management" },
    ],
    vendors: ["Venue", "AV", "Catering", "Photo", "+more"],
  },
] as const;

export function LandingPage() {
  const [openPkg, setOpenPkg] = useState<number | null>(null);
  const activePkg = openPkg !== null ? corpPackages[openPkg] : null;
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 bg-background/80 backdrop-blur-md z-50 border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <img src="/beebizy-logo.png" alt="Beebizy" className="h-9 w-auto" />
          <nav className="flex items-center gap-6">
            <a href="#who" className="text-sm font-medium text-muted-foreground hover:text-foreground hidden md:block transition-colors">Who it's for</a>
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground hidden md:block transition-colors">Features</a>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground hidden md:block transition-colors">Log In</Link>
            <Link href="/dashboard">
              <Button className="font-semibold shadow-md shadow-primary/20 hover:scale-105 transition-transform active:scale-95">My Dashboard</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center overflow-x-hidden">

        {/* Hero */}
        <section className="w-full pt-40 pb-28 flex flex-col items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />

          {/* Floating honeycomb hexagons */}
          <HexShape size={90}  className="hex-drift      absolute top-24  left-[6%]  text-primary pointer-events-none hidden md:block" style={{ animationDelay: "0s"   }} />
          <HexShape size={56}  className="hex-drift-slow absolute top-40  left-[18%] text-amber-400 pointer-events-none hidden md:block" style={{ animationDelay: "1.2s" }} />
          <HexShape size={72}  className="hex-drift      absolute top-16  right-[8%] text-primary pointer-events-none hidden md:block" style={{ animationDelay: "0.8s" }} />
          <HexShape size={44}  className="hex-drift-slow absolute top-52  right-[22%] text-amber-300 pointer-events-none hidden md:block" style={{ animationDelay: "2s"  }} />
          <HexShape size={110} className="hex-drift-slow absolute bottom-8 left-[12%] text-primary pointer-events-none hidden lg:block" style={{ animationDelay: "1.5s" }} />
          <HexShape size={60}  className="hex-drift      absolute bottom-16 right-[14%] text-amber-400 pointer-events-none hidden lg:block" style={{ animationDelay: "0.4s" }} />

          <div className="container mx-auto px-6 max-w-4xl text-center">
            <div className="flex flex-col items-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-black font-bold text-sm tracking-wide border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Event management software built for how teams actually work
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.05]">
                Every team runs events.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary via-orange-400 to-red-500">
                  Beebizy makes it effortless.
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl font-medium leading-relaxed">
                Whether you're coordinating a global enterprise summit, moving fast with a lean ops team,
                or rallying a community around a cause — Beebizy gives you the control room you need.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <Link href="/dashboard">
                  <Button size="lg" className="h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-all group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <a href="#who">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold border-2">
                    See who it's for
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Personas */}
        <section id="who" className="w-full py-28 bg-white">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Who it's for</p>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight">
                Your team. Your workflow.
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed">
                Three very different teams. One platform that gets out of their way.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-7 max-w-6xl mx-auto">
              {personas.map((p, i) => {
                const Icon = p.icon;
                return (
                  <div
                    key={i}
                    className="group rounded-3xl border border-gray-100 bg-white p-9 hover:shadow-2xl hover:shadow-black/8 hover:-translate-y-2 transition-all duration-300 flex flex-col gap-6"
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.pill} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${p.check}`}>{p.tag}</p>
                      <h3 className="text-2xl font-extrabold text-gray-900 leading-snug">{p.headline}</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed flex-1 text-base">{p.description}</p>
                    <ul className="space-y-2.5">
                      {p.proof.slice(0, 3).map((item, j) => (
                        <li key={j} className="flex items-start gap-2.5">
                          <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${p.check}`} />
                          <span className="text-sm text-gray-600 font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/dashboard" className={`inline-flex items-center gap-1.5 text-sm font-bold ${p.check} group-hover:gap-3 transition-all`}>
                      See it in action <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* What event are you planning? */}
        <section className="w-full py-28 bg-white">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center mb-14">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Corporate Trends</p>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight">
                What are you planning?
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed">
                See what corporate teams are running right now — and jump straight into a template.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {[
                { icon: Globe2,        label: "Annual Summit",        tag: "Most popular", tagColor: "bg-amber-100 text-amber-700" },
                { icon: Users,         label: "Team Offsite",         tag: "Trending",     tagColor: "bg-teal-100 text-teal-700"  },
                { icon: Zap,           label: "Product Launch",       tag: "Trending",     tagColor: "bg-teal-100 text-teal-700"  },
                { icon: Trophy,        label: "Awards Ceremony",      tag: null,           tagColor: ""                            },
                { icon: Building2,     label: "Customer Conference",  tag: "Rising",       tagColor: "bg-blue-100 text-blue-700"  },
                { icon: Megaphone,     label: "Town Hall",            tag: null,           tagColor: ""                            },
                { icon: Heart,         label: "Fundraising Gala",     tag: "Popular",      tagColor: "bg-rose-100 text-rose-700"  },
                { icon: PartyPopper,   label: "Holiday Party",        tag: null,           tagColor: ""                            },
                { icon: Briefcase,     label: "Sales Kickoff",        tag: "Trending",     tagColor: "bg-teal-100 text-teal-700"  },
                { icon: CalendarCheck, label: "Training Day",         tag: null,           tagColor: ""                            },
                { icon: BarChart3,     label: "Investor Day",         tag: "Rising",       tagColor: "bg-blue-100 text-blue-700"  },
                { icon: Layers,        label: "Multi-City Roadshow",  tag: null,           tagColor: ""                            },
              ].map(({ icon: Icon, label, tag, tagColor }, i) => (
                <Link href="/dashboard" key={i}>
                  <div className="group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <Icon className="w-6 h-6 text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-bold text-gray-800 leading-snug">{label}</span>
                    {tag ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tagColor}`}>{tag}</span>
                    ) : (
                      <span className="h-4" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Vendor invite */}
        <section className="w-full py-28 bg-violet-50">
          <div className="container mx-auto px-6">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16">

              {/* Text */}
              <div className="flex-1 flex flex-col gap-7">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-3">Vendor Network</p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                    Bring your vendors<br />into the hive.
                  </h2>
                  <p className="text-xl text-gray-500 leading-relaxed">
                    Send a link. Your AV company, caterer, or venue joins Beebizy in seconds — no account setup required on their end. They appear in your vendor marketplace, filtered by city, ready to assign to your next event.
                  </p>
                </div>
                <ul className="space-y-3">
                  {[
                    "One link gets any vendor into your marketplace",
                    "Filter vendors by city when planning multi-location events",
                    "Track which vendors are confirmed per event",
                    "Build a reusable vendor list across your whole team",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-violet-500" />
                      <span className="text-base text-gray-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard">
                  <Button className="w-fit font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:scale-105 transition-all">
                    See vendors in action
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>

              {/* Mock invite card */}
              <div className="flex-1 flex items-center justify-center w-full">
                <div className="bg-white rounded-3xl shadow-xl shadow-violet-100 border border-violet-100 p-8 w-full max-w-sm flex flex-col gap-6">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-extrabold text-gray-900 text-sm">Invite a Vendor</div>
                      <div className="text-xs text-gray-400">They join your marketplace instantly</div>
                    </div>
                  </div>

                  {/* Vendor avatars already in */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Already in your network</p>
                    <div className="space-y-2">
                      {[
                        { name: "Apex AV & Sound",     city: "New York, NY",    color: "bg-violet-100 text-violet-700" },
                        { name: "Golden Gate Catering", city: "San Francisco, CA", color: "bg-amber-100 text-amber-700"  },
                        { name: "Windy City Venues",   city: "Chicago, IL",     color: "bg-teal-100 text-teal-700"    },
                      ].map((v, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${v.color} flex items-center justify-center text-xs font-black shrink-0`}>
                            {v.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{v.name}</div>
                            <div className="text-xs text-gray-400">{v.city}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite link row */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Share invite link</p>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-500 font-mono truncate flex-1">beebizy.app/join/acme-events</span>
                      <button className="text-xs font-bold text-violet-600 bg-violet-100 px-2.5 py-1 rounded-lg hover:bg-violet-200 transition-colors shrink-0">
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="w-full py-28 bg-gray-50">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Features</p>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight">
                One platform. Every event type.
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed">
                The same tools that power a 2,000-person summit work for a 20-person offsite.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 max-w-6xl mx-auto">
              {features.map((feat, i) => {
                const Icon = feat.icon;
                const palettes: { bg: string; icon: string }[] = [
                  { bg: "bg-violet-100", icon: "text-violet-600" },
                  { bg: "bg-amber-100",  icon: "text-amber-600"  },
                  { bg: "bg-teal-100",   icon: "text-teal-600"   },
                  { bg: "bg-rose-100",   icon: "text-rose-600"   },
                ];
                const pal = palettes[i % 4];
                return (
                  <div key={i} className="flex flex-col gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${pal.bg} flex items-center justify-center`}>
                      <Icon className={`w-7 h-7 ${pal.icon}`} />
                    </div>
                    <h3 className="text-lg font-extrabold text-gray-900">{feat.title}</h3>
                    <p className="text-gray-400 leading-relaxed text-sm">{feat.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Corp packages */}
        <section className="w-full py-28 bg-gray-900">
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Corp Packages</p>
              <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-5 leading-tight">
                Pre-built packages.<br />Curated vendors. Done.
              </h2>
              <p className="text-xl text-white/50 leading-relaxed">
                Pick a package and we match you with vetted vendors — starting at $2,000.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {corpPackages.map((pkg, i) => (
                <div
                  key={i}
                  className={`relative rounded-3xl border-2 ${pkg.borderColor} p-8 flex flex-col gap-6 ${pkg.highlight ? "bg-white/10" : "bg-white/5"}`}
                >
                  {pkg.highlight && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                      Most popular
                    </div>
                  )}
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${pkg.accent}`}>{pkg.name}</p>
                    <div className="text-4xl font-black text-white">{pkg.price}</div>
                    <p className="text-xs text-white/35 mt-1">{pkg.note}</p>
                  </div>
                  <p className={`text-sm font-bold ${pkg.accent}`}>Best for: {pkg.bestFor}</p>
                  <ul className="space-y-2.5 flex-1">
                    {pkg.includes.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${pkg.accent}`} />
                        <span className="text-sm text-white/65 font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-2">Curated vendors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.vendors.map((v, j) => (
                        <span key={j} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white/60">{v}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenPkg(i)}
                    className={`w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 ${pkg.highlight ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20 border border-white/15"}`}
                  >
                    Explore package <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why switch */}
        <section className="w-full py-28 bg-amber-50">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-14">
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Why teams switch</p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
                  Stop patching three tools together.
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-5 mb-12">
                {[
                  { value: "200+", label: "Hours saved annually per team" },
                  { value: "40%",  label: "Lower vendor costs on average"  },
                  { value: "3×",   label: "Faster event setup than before"  },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-3xl p-8 text-center border border-amber-100">
                    <div className="text-5xl font-black text-gray-900 mb-2 tabular-nums">{s.value}</div>
                    <div className="text-sm text-gray-400 font-medium leading-snug">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: Building2, text: "Enterprise teams: one registry, not a dozen spreadsheets." },
                  { icon: Zap,       text: "Lean teams: live in two minutes, not two weeks."           },
                  { icon: Heart,     text: "Nonprofits: simple enough for a two-person volunteer team." },
                  { icon: Layers,    text: "Everyone: real data, live — not static exports."            },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-4 bg-white rounded-2xl p-5 border border-amber-100">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-base text-gray-700 font-medium leading-snug">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="w-full py-28 bg-gray-900 text-white text-center px-6">
          <div className="container mx-auto max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight leading-tight">
              Which team are you?
            </h2>
            <p className="text-lg md:text-xl mb-12 text-white/50 font-medium leading-relaxed">
              Enterprise, lean, or mission-driven — try the working demo. No sign-up. No credit card.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="h-14 px-10 text-lg font-bold bg-primary text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-105 transition-transform">
                Launch the Demo
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Package detail modal */}
      {activePkg && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setOpenPkg(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className={`p-8 pb-6 border-b border-gray-100 ${activePkg.accentBg}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${activePkg.accentSolid}`}>{activePkg.name} Package</p>
                  <div className="text-4xl font-black text-gray-900">{activePkg.price}</div>
                  <p className="text-sm text-gray-400 mt-1">{activePkg.note}</p>
                </div>
                <button
                  onClick={() => setOpenPkg(null)}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors shrink-0"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{activePkg.description}</p>
            </div>

            {/* Modal body */}
            <div className="p-8 space-y-7">
              {/* Best for */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-widest ${activePkg.accentSolid}`}>Best for</span>
                <span className="text-sm font-semibold text-gray-700">{activePkg.bestFor}</span>
              </div>

              {/* What's included */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">What's included</p>
                <ul className="space-y-2.5">
                  {activePkg.includes.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${activePkg.accentSolid}`} />
                      <span className="text-sm text-gray-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Curated vendors breakdown */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Curated vendor categories</p>
                <div className="space-y-3">
                  {activePkg.vendorCategories.map((vc, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${activePkg.accentBg} ${activePkg.accentSolid} min-w-[80px] text-center`}>
                        {vc.category}
                      </span>
                      <p className="text-sm text-gray-500 pt-0.5">{vc.examples}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link href="/dashboard" className="flex-1">
                  <Button className={`w-full font-bold bg-gradient-to-r ${activePkg.pillGradient} border-0 text-white hover:opacity-90 shadow-lg`}>
                    Try it in the demo
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Button variant="outline" className="flex-1 font-bold" onClick={() => setOpenPkg(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-card border-t py-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/beebizy-logo.png" alt="Beebizy" className="h-8 w-auto" />
          <div className="flex gap-6 text-sm font-medium text-muted-foreground">
            <a href="#who" className="hover:text-foreground transition-colors">Who it's for</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Demo</Link>
          </div>
          <p className="text-sm text-muted-foreground font-medium">© {new Date().getFullYear()} Beebizy Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
