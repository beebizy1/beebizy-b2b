import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, ExternalLink, ListChecks, Palette, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import { toast } from "@/hooks/use-toast";
import {
  useAddBudgetItem,
  useAddChecklistItem,
  useAddMoodBoardImage,
  useAddRunOfShowItem,
  useBudget,
  useChecklist,
  useMoodBoard,
  usePlanningSuggestions,
  useRunOfShow,
} from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney } from "@/data/money";
import { moodConceptDataUrl, PLANNING_LIMITS, suggestedTotalBudgetCents, type PlanningSuggestions } from "@/data/planner";
import type { Event } from "@/data/entities";
import { formatClockTime } from "@/lib/datetime";

type AppliedSection = "budget" | "checklist" | "runOfShow" | "mood";

function dueDateFor(eventDate: string, daysBefore: number): string | null {
  const due = new Date(eventDate);
  if (Number.isNaN(due.getTime())) return null;
  due.setDate(due.getDate() - daysBefore);
  return due.toISOString();
}
function ApplyButton({
  applied,
  busy,
  onClick,
}: {
  applied: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant={applied ? "outline" : "default"} disabled={applied || busy} onClick={onClick}>
      {applied ? <CheckCircle2 className="mr-1.5 size-3.5" /> : <Sparkles className="mr-1.5 size-3.5" />}
      {applied ? "Added" : "Add to event"}
    </Button>
  );
}

export default function PlanningAssistantPanel({ event }: { event: Event }) {
  const initialHeadcount = event.capacity ?? 200;
  const [headcount, setHeadcount] = useState(String(initialHeadcount));
  const [budget, setBudget] = useState(centsToInput(suggestedTotalBudgetCents(initialHeadcount)));
  const [theme, setTheme] = useState("");
  const [budgetEdited, setBudgetEdited] = useState(false);
  const [suggestions, setSuggestions] = useState<PlanningSuggestions | null>(null);
  const [applied, setApplied] = useState<Set<AppliedSection>>(() => new Set());
  const [applying, setApplying] = useState<AppliedSection | null>(null);

  const generate = usePlanningSuggestions();
  const addBudget = useAddBudgetItem();
  const addChecklist = useAddChecklistItem();
  const addCue = useAddRunOfShowItem();
  const addMood = useAddMoodBoardImage();
  const { data: existingBudget } = useBudget(event.id);
  const { data: existingChecklist } = useChecklist(event.id);
  const { data: existingCues } = useRunOfShow(event.id);
  const { data: existingMood } = useMoodBoard(event.id);

  const parsedHeadcount = Number.parseInt(headcount, 10);
  const parsedBudget = centsFromInput(budget);

  useEffect(() => {
    if (budgetEdited || !Number.isFinite(parsedHeadcount) || parsedHeadcount < 1) return;
    setBudget(centsToInput(suggestedTotalBudgetCents(parsedHeadcount)));
  }, [budgetEdited, parsedHeadcount]);

  const existing = useMemo(
    () => ({
      budget: new Set((existingBudget ?? []).map((item) => item.name.trim().toLowerCase())),
      checklist: new Set((existingChecklist ?? []).map((item) => item.title.trim().toLowerCase())),
      runOfShow: new Set((existingCues ?? []).map((item) => `${item.startTime}|${item.title.trim().toLowerCase()}`)),
      mood: new Set((existingMood ?? []).map((item) => item.caption?.split(" · ")[0]?.trim().toLowerCase())),
    }),
    [existingBudget, existingChecklist, existingCues, existingMood],
  );

  const markApplied = (section: AppliedSection) => {
    setApplied((current) => new Set(current).add(section));
    setApplying(null);
  };

  const applyBudget = async () => {
    if (!suggestions) return;
    setApplying("budget");
    const pending = suggestions.budget.filter((item) => !existing.budget.has(item.name.trim().toLowerCase()));
    try {
      await Promise.all(pending.map((draft) => addBudget.mutateAsync({ eventId: event.id, draft })));
      markApplied("budget");
      toast({ title: "Budget added", description: `${pending.length} new budget lines are ready for review.` });
    } catch (error) {
      setApplying(null);
      toast({ title: "Couldn't add the budget", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const applyChecklist = async () => {
    if (!suggestions) return;
    setApplying("checklist");
    const pending = suggestions.checklist.filter((item) => !existing.checklist.has(item.title.trim().toLowerCase()));
    try {
      await Promise.all(
        pending.map(({ dueDaysBefore, ...draft }) =>
          addChecklist.mutateAsync({
            eventId: event.id,
            draft: { ...draft, dueDate: dueDateFor(event.date, dueDaysBefore) },
          }),
        ),
      );
      markApplied("checklist");
      toast({ title: "Checklist added", description: `${pending.length} new tasks were added.` });
    } catch (error) {
      setApplying(null);
      toast({ title: "Couldn't add the checklist", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const applyRunOfShow = async () => {
    if (!suggestions) return;
    setApplying("runOfShow");
    const pending = suggestions.runOfShow.filter(
      (item) => !existing.runOfShow.has(`${item.startTime}|${item.title.trim().toLowerCase()}`),
    );
    try {
      await Promise.all(pending.map((draft) => addCue.mutateAsync({ eventId: event.id, draft })));
      markApplied("runOfShow");
      toast({ title: "Run of show added", description: `${pending.length} new cues were added.` });
    } catch (error) {
      setApplying(null);
      toast({ title: "Couldn't add the run of show", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const applyMood = async () => {
    if (!suggestions) return;
    setApplying("mood");
    const pending = suggestions.moodConcepts.filter((concept) => !existing.mood.has(concept.name.trim().toLowerCase()));
    try {
      await Promise.all(
        pending.map((concept) =>
          addMood.mutateAsync({
            eventId: event.id,
            url: moodConceptDataUrl(concept),
            caption: `${concept.name} · ${concept.description}`,
          }),
        ),
      );
      markApplied("mood");
      toast({ title: "Mood directions added", description: `${pending.length} visual directions are on the mood board.` });
    } catch (error) {
      setApplying(null);
      toast({ title: "Couldn't add the mood directions", description: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Panel className="overflow-hidden border-primary/30 bg-linear-to-br from-primary/8 via-surface to-surface">
      <PanelHeader
        title="Beebizy AI planner"
        description="Build a budget, checklist, run of show, mood directions and marketplace searches from one brief. Nothing is added until you approve it."
        actions={<Pill tone="info">Beta</Pill>}
      />

      <form
        className="grid gap-4 border-b border-hairline p-5 lg:grid-cols-[160px_190px_minmax(0,1fr)_auto] lg:items-end"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (!Number.isFinite(parsedHeadcount) || parsedHeadcount < 1 || parsedBudget === null || parsedBudget < 100) return;
          generate.mutate(
            { eventId: event.id, headcount: parsedHeadcount, totalBudgetCents: parsedBudget, theme: theme.trim() },
            {
              onSuccess: (result) => {
                setSuggestions(result);
                setApplied(new Set());
              },
              onError: (error) => toast({ title: "Couldn't build the plan", description: error.message }),
            },
          );
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ai-headcount">Headcount</Label>
          <Input
            id="ai-headcount"
            type="number"
            min={PLANNING_LIMITS.minHeadcount}
            max={PLANNING_LIMITS.maxHeadcount}
            value={headcount}
            onChange={(inputEvent) => setHeadcount(inputEvent.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-budget">Total budget</Label>
          <Input
            id="ai-budget"
            inputMode="decimal"
            value={budget}
            onChange={(inputEvent) => {
              setBudgetEdited(true);
              setBudget(inputEvent.target.value);
            }}
            placeholder="70000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-theme">Theme or direction</Label>
          <Textarea
            id="ai-theme"
            value={theme}
            onChange={(inputEvent) => setTheme(inputEvent.target.value)}
            placeholder="Future of community, warm modern, premium but approachable…"
            rows={1}
            className="min-h-9 resize-none"
            maxLength={PLANNING_LIMITS.maxThemeLength}
          />
        </div>
        <Button type="submit" disabled={generate.isPending || parsedBudget === null || parsedHeadcount < 1}>
          <Bot className="mr-1.5 size-4" />
          {generate.isPending ? "Building…" : "Build plan"}
        </Button>
      </form>

      {suggestions ? (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-surface/90 p-4">
            <div className="max-w-3xl">
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles className="size-4 text-primary-text" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">Plan ready for review</p>
                <Pill tone={suggestions.source === "ai" ? "info" : "neutral"}>
                  {suggestions.source === "ai" ? "AI generated" : "Smart fallback"}
                </Pill>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{suggestions.summary}</p>
            </div>
            <div className="text-right">
              <p data-numeric className="text-xl font-bold text-foreground">{formatMoney(suggestions.totalBudgetCents)}</p>
              <p data-numeric className="text-xs text-muted-foreground">{suggestions.headcount.toLocaleString()} guests</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-hairline bg-surface/90">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Budget suggestion</p>
                  <p className="text-xs text-muted-foreground">Deterministic allocation that always reconciles to the total</p>
                </div>
                <ApplyButton applied={applied.has("budget")} busy={applying === "budget"} onClick={() => void applyBudget()} />
              </div>
              <ul className="divide-y divide-hairline">
                {suggestions.budget.map((line) => (
                  <li key={line.name} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{line.name}</p>
                      <p className="text-xs text-muted-foreground">{line.rationale}</p>
                    </div>
                    <span data-numeric className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(line.estimatedCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-hairline bg-surface/90">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Checklist builder</p>
                    <p data-numeric className="text-xs text-muted-foreground">{suggestions.checklist.length} suggested tasks</p>
                  </div>
                </div>
                <ApplyButton applied={applied.has("checklist")} busy={applying === "checklist"} onClick={() => void applyChecklist()} />
              </div>
              <ul className="divide-y divide-hairline">
                {suggestions.checklist.map((item) => (
                  <li key={`${item.category}-${item.title}`} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <Pill><span data-numeric>{item.dueDaysBefore}d</span> before</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.category}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-hairline bg-surface/90">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Run of show builder</p>
                    <p data-numeric className="text-xs text-muted-foreground">{suggestions.runOfShow.length} timed cues</p>
                  </div>
                </div>
                <ApplyButton applied={applied.has("runOfShow")} busy={applying === "runOfShow"} onClick={() => void applyRunOfShow()} />
              </div>
              <ol className="divide-y divide-hairline">
                {suggestions.runOfShow.map((cue) => (
                  <li key={`${cue.startTime}-${cue.title}`} className="flex items-start gap-3 px-4 py-2.5">
                    <span data-numeric className="w-[4.5rem] shrink-0 font-mono text-xs font-semibold text-foreground">
                      {formatClockTime(cue.startTime)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{cue.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {cue.responsible || "Owner to assign"}
                        {cue.duration ? <> · <span data-numeric>{cue.duration} min</span></> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-hairline bg-surface/90">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Mood board directions</p>
                    <p className="text-xs text-muted-foreground">Three variations from the same theme</p>
                  </div>
                </div>
                <ApplyButton applied={applied.has("mood")} busy={applying === "mood"} onClick={() => void applyMood()} />
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {suggestions.moodConcepts.map((concept) => (
                  <article key={concept.name} className="overflow-hidden rounded-lg border border-hairline bg-surface">
                    <img src={moodConceptDataUrl(concept)} alt={`${concept.name} palette`} className="aspect-4/3 w-full object-cover" />
                    <div className="space-y-1.5 p-3">
                      <p className="text-sm font-semibold text-foreground">{concept.name}</p>
                      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{concept.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-hairline bg-surface/90">
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <Store className="size-4 text-primary-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">Vendor suggestions</p>
                <p className="text-xs text-muted-foreground">Live searches in the Beebizy marketplace. Availability and pricing are confirmed there.</p>
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              {suggestions.vendors.map((vendor) => (
                <a
                  key={`${vendor.category}-${vendor.searchQuery}`}
                  href={vendor.marketplaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-lg border border-hairline p-3 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{vendor.category}</span>
                    <ExternalLink className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{vendor.why}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <Sparkles className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
          Start with the suggested per-person budget or enter your own total. The full proposal stays editable after you add it.
        </div>
      )}
    </Panel>
  );
}
