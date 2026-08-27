import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Coins,
  Loader2,
  Palette,
  PencilLine,
  Sparkles,
  Store,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, PanelHeader, Pill } from "@/components/primitives";
import {
  useAddBudgetItem,
  useAddChecklistItem,
  useAddRunOfShowItem,
  useCreateEvent,
} from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";
import type { BudgetItemDraft, ChecklistItemDraft, EventCategory, RunOfShowItemDraft } from "@/data/entities";

type PlannerMode = "choose" | "agent" | "plan";

const eventTypes = ["Conference", "Gala", "Workshop", "Fundraiser", "Product launch", "Company offsite"];

const themeDirections = {
  "Modern garden": {
    description: "Natural materials, sculptural greenery and warm candlelight.",
    variations: [
      { name: "Botanical minimal", note: "Airy greens, linen and restrained florals", colors: ["#1f5138", "#b9d6b5", "#f4efe2"] },
      { name: "Golden hour garden", note: "Amber light, meadow flowers and oak", colors: ["#9f5f2e", "#f2c66d", "#efe6d2"] },
      { name: "Midnight conservatory", note: "Deep foliage, black accents and glass", colors: ["#102d25", "#365f4d", "#c8b989"] },
    ],
  },
  "Bold brand launch": {
    description: "High-energy staging, graphic moments and camera-ready reveals.",
    variations: [
      { name: "Color field", note: "Oversized brand blocks and clean typography", colors: ["#f8d810", "#111111", "#ffffff"] },
      { name: "Future studio", note: "Chrome, projection and electric highlights", colors: ["#24263b", "#765cff", "#d8f6ff"] },
      { name: "Editorial reveal", note: "Monochrome sets with one sharp accent", colors: ["#171717", "#dedede", "#ff5a36"] },
    ],
  },
  "Black tie": {
    description: "Formal pacing, cinematic lighting and elevated table details.",
    variations: [
      { name: "Classic gala", note: "Black, ivory and polished gold", colors: ["#111111", "#f5f0e6", "#b9954e"] },
      { name: "Jewel box", note: "Emerald velvet, brass and dramatic florals", colors: ["#123d32", "#8f1e3b", "#c5a25d"] },
      { name: "Moonlit modern", note: "Ink blue, silver and architectural light", colors: ["#111d36", "#8995a8", "#eef1f5"] },
    ],
  },
  "Community celebration": {
    description: "Welcoming, flexible and built around shared participation.",
    variations: [
      { name: "Neighborhood table", note: "Long tables, local color and handmade signs", colors: ["#e67451", "#f2c14e", "#4d9078"] },
      { name: "Bright commons", note: "Playful wayfinding and modular gathering zones", colors: ["#2e6f9e", "#f7d84b", "#f7f2e8"] },
      { name: "Evening block party", note: "String lights, deep blue and festive patterns", colors: ["#183153", "#df6c4f", "#f0c75e"] },
    ],
  },
} as const;

type ThemeName = keyof typeof themeDirections;

const marketplaceSuggestions = [
  { name: "Golden Gate Catering", category: "Catering", city: "San Francisco", why: "Strong large-format service and dietary coverage" },
  { name: "Northstar Production", category: "AV", city: "Los Angeles", why: "Integrated staging, lighting and show calling" },
  { name: "Field & Form", category: "Florals", city: "New York", why: "Theme-led installations with reusable materials" },
  { name: "Signal House", category: "Entertainment", city: "Chicago", why: "Curated talent and event-specific music direction" },
];

const budgetWeights = [
  { name: "Venue", category: "Venue", units: 30 },
  { name: "Catering", category: "Catering", units: 10 },
  { name: "Entertainment", category: "Entertainment", units: 5 },
  { name: "Production & AV", category: "AV", units: 10 },
  { name: "Staffing & logistics", category: "Staffing", units: 6 },
  { name: "Design & decor", category: "Decor", units: 4 },
  { name: "Contingency", category: "General", units: 5 },
] as const;

function isoDateIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function suggestedBudget(headcount: number): BudgetItemDraft[] {
  const totalCents = Math.max(1, headcount) * 28_000;
  let allocated = 0;
  return budgetWeights.map((line, index) => {
    const estimatedCents =
      index === budgetWeights.length - 1 ? totalCents - allocated : Math.round((totalCents * line.units) / 70);
    allocated += estimatedCents;
    return {
      name: line.name,
      category: line.category,
      type: "expense",
      estimatedCents,
      notes: "Bee AI starting point based on headcount. Review before booking.",
      sortOrder: index,
    };
  });
}

const checklistDraft: ChecklistItemDraft[] = [
  { title: "Confirm venue hold and capacity", category: "Venue", sortOrder: 0 },
  { title: "Approve catering direction and dietary plan", category: "Catering", sortOrder: 1 },
  { title: "Send guest invitations", category: "Marketing", sortOrder: 2 },
  { title: "Confirm AV, staging and show caller", category: "AV", sortOrder: 3 },
  { title: "Review final run of show with every vendor", category: "Programme", sortOrder: 4 },
  { title: "Prepare weather and contingency plan", category: "Logistics", sortOrder: 5 },
];

const runOfShowDraft: RunOfShowItemDraft[] = [
  { startTime: "15:00", duration: 90, title: "Vendor load-in and room set", responsible: "Production", sortOrder: 0 },
  { startTime: "16:30", duration: 45, title: "Technical rehearsal", responsible: "AV lead", sortOrder: 1 },
  { startTime: "17:30", duration: 60, title: "Guest arrival and welcome", responsible: "Guest experience", sortOrder: 2 },
  { startTime: "18:30", duration: 15, title: "Opening remarks", responsible: "Host", sortOrder: 3 },
  { startTime: "18:45", duration: 90, title: "Main programme", responsible: "Programme lead", sortOrder: 4 },
  { startTime: "20:15", duration: 75, title: "Reception and entertainment", responsible: "Event lead", sortOrder: 5 },
  { startTime: "21:30", duration: 60, title: "Guest departure and strike", responsible: "Production", sortOrder: 6 },
];

export default function AIPlanner() {
  const [, navigate] = useLocation();
  const createEvent = useCreateEvent();
  const addBudget = useAddBudgetItem();
  const addChecklist = useAddChecklistItem();
  const addRunOfShow = useAddRunOfShowItem();
  const [mode, setMode] = useState<PlannerMode>("choose");
  const [eventType, setEventType] = useState(eventTypes[0]);
  const [headcount, setHeadcount] = useState("250");
  const [theme, setTheme] = useState<ThemeName>("Modern garden");
  const [city, setCity] = useState("San Francisco");
  const [eventDate, setEventDate] = useState(() => isoDateIn(45));
  const [isSaving, setIsSaving] = useState(false);

  const guests = Math.max(1, Number.parseInt(headcount, 10) || 1);
  const budget = useMemo(() => suggestedBudget(guests), [guests]);
  const totalBudget = budget.reduce((sum, line) => sum + line.estimatedCents, 0);
  const direction = themeDirections[theme];

  const createWorkingEvent = async () => {
    setIsSaving(true);
    try {
      const created = await createEvent.mutateAsync({
        title: `${eventType} in ${city}`,
        description: `${theme} direction. Initial plan drafted with Bee AI for ${guests} guests.`,
        date: new Date(`${eventDate}T17:30:00`).toISOString(),
        location: city,
        capacity: guests,
        status: "draft",
        category: eventType as EventCategory,
      });

      const writes = await Promise.allSettled([
        ...budget.map((draft) => addBudget.mutateAsync({ eventId: created.id, draft })),
        ...checklistDraft.map((draft) => addChecklist.mutateAsync({ eventId: created.id, draft })),
        ...runOfShowDraft.map((draft) => addRunOfShow.mutateAsync({ eventId: created.id, draft })),
      ]);
      const failed = writes.filter((result) => result.status === "rejected").length;
      toast({
        title: failed ? "Event created with a partial plan" : "Working event created",
        description: failed
          ? `${writes.length - failed} suggestions were added. Review the event workspace for anything missing.`
          : "Budget, checklist and run of show are ready to edit.",
      });
      navigate(`/app/events/${created.id}/plan`);
    } catch (error) {
      toast({ title: "Couldn't create the event", description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your planning workspace"
        title="How would you like to plan?"
        description="Use Bee as a planning partner, or start with the regular tools. You can switch approaches at any time."
      />

      {mode === "choose" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("agent")}
            className="group rounded-2xl border border-primary/45 bg-card p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-primary-muted text-primary-text">
              <WandSparkles className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-foreground">Plan with the AI agent</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tell Bee about the event and get an editable budget, checklist, run of show, theme directions and vendor shortlist.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-foreground">
              {["Budget based on headcount", "Theme and mood board variations", "Working event plan in one click"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success-text" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold text-primary-text">
              Open Bee AI <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          <Link
            href="/app/events/new"
            className="group rounded-2xl border border-card-border bg-card p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-muted text-foreground">
              <PencilLine className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-foreground">Plan it yourself</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Start blank or choose a template, then add vendors, budgets, invitations and schedules at your own pace.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-foreground">
              {["Create a blank event in minutes", "Use your own budget and vendors", "Keep control of every decision"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success-text" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold text-foreground">
              Create manually <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      ) : null}

      {mode === "agent" ? (
        <Panel>
          <PanelHeader
            title="Give Bee the shape of the event"
            description="These answers create the first draft. Everything remains editable."
            actions={<Pill tone="warning">Draft only</Pill>}
          />
          <form
            className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              setMode("plan");
            }}
          >
            <div className="space-y-2">
              <Label>Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{eventTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="planner-headcount">Headcount</Label>
              <Input id="planner-headcount" type="number" min={1} value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Theme direction</Label>
              <Select value={theme} onValueChange={(value) => setTheme(value as ThemeName)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(themeDirections).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="planner-city">City</Label>
              <Input id="planner-city" value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planner-date">Event date</Label>
              <Input id="planner-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
              <Button type="submit"><Sparkles className="mr-1.5 size-4" />Build my plan</Button>
              <Button type="button" variant="outline" onClick={() => setMode("choose")}>Back</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {mode === "plan" ? (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-brand-hairline bg-brand-surface text-brand-foreground shadow-sm">
            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end sm:p-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Bee AI working plan</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight">{eventType} for {guests} guests</h2>
                <p className="mt-2 max-w-2xl text-sm text-brand-muted">{theme} in {city}. {direction.description}</p>
              </div>
              <Button onClick={() => void createWorkingEvent()} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Sparkles className="mr-1.5 size-4" />}
                Create working event
              </Button>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Panel>
              <PanelHeader title="Suggested budget" description={`Based on ${guests} guests · ${formatMoney(28_000)} per guest`} actions={<Coins className="size-5 text-primary-text" />} />
              <div className="border-b border-hairline bg-primary-wash px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-text">Suggested total</p>
                <p data-numeric className="mt-1 text-3xl font-extrabold text-foreground">{formatMoney(totalBudget)}</p>
              </div>
              <dl className="divide-y divide-hairline">
                {budget.map((line) => (
                  <div key={line.name} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{line.name}</dt>
                    <dd data-numeric className="font-semibold text-foreground">{formatMoney(line.estimatedCents)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel>
              <PanelHeader title="Run of show" description="A practical first pass for the event day" actions={<Clock3 className="size-5 text-primary-text" />} />
              <ol className="divide-y divide-hairline">
                {runOfShowDraft.map((cue) => (
                  <li key={cue.startTime} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5">
                    <span data-numeric className="font-mono text-xs font-semibold text-primary-text">{cue.startTime}</span>
                    <span className="text-sm font-medium text-foreground">{cue.title}</span>
                    <span className="text-xs text-muted-foreground">{cue.duration} min</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="Mood board directions" description={`Three variations on “${theme}”`} actions={<Palette className="size-5 text-primary-text" />} />
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {direction.variations.map((variation) => (
                <article key={variation.name} className="overflow-hidden rounded-xl border border-hairline bg-card">
                  <div className="grid h-28 grid-cols-3" aria-label={`${variation.name} colour palette`}>
                    {variation.colors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground">{variation.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{variation.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Checklist starter" description={`${checklistDraft.length} recommended actions`} />
              <ul className="divide-y divide-hairline">
                {checklistDraft.map((item) => (
                  <li key={item.title} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden="true" />
                    <span className="flex-1 text-foreground">{item.title}</span>
                    <Pill>{item.category}</Pill>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Marketplace vendor suggestions" description="Curated from the Beebizy marketplace" actions={<Store className="size-5 text-primary-text" />} />
              <ul className="divide-y divide-hairline">
                {marketplaceSuggestions.map((vendor) => (
                  <li key={vendor.name} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{vendor.name}</span>
                      <Pill tone="info">{vendor.category}</Pill>
                      <span className="text-xs text-muted-foreground">{vendor.city}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{vendor.why}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void createWorkingEvent()} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Sparkles className="mr-1.5 size-4" />}
              Create working event
            </Button>
            <Button variant="outline" onClick={() => setMode("agent")}>Adjust answers</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
