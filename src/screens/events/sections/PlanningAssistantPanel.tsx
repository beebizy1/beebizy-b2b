import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, ExternalLink, ListChecks, Palette, Plus, Sparkles, Store, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PlanningChat from "./PlanningChat";
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
import {
  moodConceptDataUrl,
  PLANNING_LIMITS,
  suggestedTotalBudgetCents,
  type MoodConcept,
  type PlanningSuggestions,
} from "@/data/planner";
import type { Event } from "@/data/entities";

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

  const reviseSuggestions = (
    section: AppliedSection,
    update: (current: PlanningSuggestions) => PlanningSuggestions,
  ) => {
    setSuggestions((current) => (current ? update(current) : current));
    setApplied((current) => {
      const next = new Set(current);
      next.delete(section);
      return next;
    });
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
    const pending = suggestions.checklist.filter(
      (item) => item.title.trim() && !existing.checklist.has(item.title.trim().toLowerCase()),
    );
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
      (item) => item.title.trim() && !existing.runOfShow.has(`${item.startTime}|${item.title.trim().toLowerCase()}`),
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
    const pending = suggestions.moodConcepts.filter(
      (concept) => concept.name.trim() && !existing.mood.has(concept.name.trim().toLowerCase()),
    );
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

  const build = (brief: { headcount: number; totalBudgetCents: number; theme: string }) => {
    generate.mutate(
      { eventId: event.id, ...brief },
      {
        onSuccess: (result) => {
          setSuggestions(result);
          setApplied(new Set());
        },
        onError: (error) => toast({ title: "Couldn't build the plan", description: error.message }),
      },
    );
  };

  return (
    <Panel className="overflow-hidden border-primary/30 bg-linear-to-br from-primary/8 via-surface to-surface">
      <PanelHeader
        title="Beebizy AI planner"
        description="Tell Bee about the event and it drafts the budget, checklist, run of show, mood directions and vendor searches. Nothing is added until you approve it."
        actions={<Pill tone="info">Beta</Pill>}
      />

      {/*
        The conversation is the way in; the form below stays for anyone who already knows
        their numbers and would rather not be interviewed. A finished interview fills the
        form and drafts immediately, so both routes end in the same reviewable proposal.
      */}
      <div className="border-b border-hairline">
        <PlanningChat
          eventId={event.id}
          onBrief={(brief) => {
            setHeadcount(String(brief.headcount));
            setBudget(centsToInput(brief.totalBudgetCents));
            setBudgetEdited(true);
            setTheme(brief.theme);
            build(brief);
          }}
        />
      </div>

      <form
        className="grid gap-4 border-b border-hairline p-5 lg:grid-cols-[160px_190px_minmax(0,1fr)_auto] lg:items-end"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (!Number.isFinite(parsedHeadcount) || parsedHeadcount < 1 || parsedBudget === null || parsedBudget < 100) return;
          build({ headcount: parsedHeadcount, totalBudgetCents: parsedBudget, theme: theme.trim() });
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
              {suggestions.learning ? (
                <div className="mt-3 rounded-lg border border-primary/25 bg-primary-wash px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="info">Past-event informed</Pill>
                    <p className="text-xs font-medium text-foreground">
                      Learned from {suggestions.learning.eventCount} similar completed {suggestions.learning.eventCount === 1 ? "event" : "events"}
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {suggestions.learning.explanation} Sources: {suggestions.learning.eventTitles.join(", ")}.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p data-numeric className="text-xl font-bold text-foreground">{formatMoney(suggestions.totalBudgetCents)}</p>
              <p data-numeric className="text-xs text-muted-foreground">{suggestions.headcount.toLocaleString()} guests</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-12">
            <section className="rounded-xl border border-hairline bg-surface/90 xl:col-span-5">
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

            <section className="rounded-xl border border-hairline bg-surface/90 xl:col-span-7">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Checklist builder</p>
                    <p data-numeric className="text-xs text-muted-foreground">{suggestions.checklist.length} suggested tasks</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      reviseSuggestions("checklist", (current) => ({
                        ...current,
                        checklist: [
                          ...current.checklist,
                          {
                            title: "New task",
                            category: "General",
                            completed: false,
                            dueDate: null,
                            assignedTo: null,
                            sortOrder: current.checklist.length,
                            dueDaysBefore: 14,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 size-3.5" />
                    Task
                  </Button>
                  <ApplyButton applied={applied.has("checklist")} busy={applying === "checklist"} onClick={() => void applyChecklist()} />
                </div>
              </div>
              <ul className="divide-y divide-hairline" aria-label="Editable checklist suggestions">
                {suggestions.checklist.map((item, index) => (
                  <li key={index} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_auto] sm:items-end">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Task</span>
                      <Input
                        value={item.title}
                        onChange={(inputEvent) =>
                          reviseSuggestions("checklist", (current) => ({
                            ...current,
                            checklist: current.checklist.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, title: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        className="h-8"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Category</span>
                      <Input
                        value={item.category ?? ""}
                        onChange={(inputEvent) =>
                          reviseSuggestions("checklist", (current) => ({
                            ...current,
                            checklist: current.checklist.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, category: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        className="h-8"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Days before</span>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={item.dueDaysBefore}
                        onChange={(inputEvent) =>
                          reviseSuggestions("checklist", (current) => ({
                            ...current,
                            checklist: current.checklist.map((draft, draftIndex) =>
                              draftIndex === index
                                ? { ...draft, dueDaysBefore: Math.max(0, Number.parseInt(inputEvent.target.value, 10) || 0) }
                                : draft,
                            ),
                          }))
                        }
                        className="h-8"
                      />
                    </label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-danger-text"
                      aria-label={`Remove ${item.title || "task"}`}
                      onClick={() =>
                        reviseSuggestions("checklist", (current) => ({
                          ...current,
                          checklist: current.checklist.filter((_, draftIndex) => draftIndex !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-hairline bg-surface/90 xl:col-span-7">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Run of show builder</p>
                    <p data-numeric className="text-xs text-muted-foreground">{suggestions.runOfShow.length} timed cues</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      reviseSuggestions("runOfShow", (current) => ({
                        ...current,
                        runOfShow: [
                          ...current.runOfShow,
                          {
                            startTime: "09:00",
                            duration: 15,
                            title: "New cue",
                            description: null,
                            responsible: null,
                            sortOrder: current.runOfShow.length,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 size-3.5" />
                    Cue
                  </Button>
                  <ApplyButton applied={applied.has("runOfShow")} busy={applying === "runOfShow"} onClick={() => void applyRunOfShow()} />
                </div>
              </div>
              <ol className="divide-y divide-hairline" aria-label="Editable run of show suggestions">
                {suggestions.runOfShow.map((cue, index) => (
                  <li key={index} className="grid gap-2 px-4 py-3 sm:grid-cols-[7.25rem_minmax(0,1fr)_7rem_8rem_auto] sm:items-end">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Start</span>
                      <Input
                        type="time"
                        value={cue.startTime}
                        onChange={(inputEvent) =>
                          reviseSuggestions("runOfShow", (current) => ({
                            ...current,
                            runOfShow: current.runOfShow.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, startTime: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        className="h-8 font-mono"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Cue</span>
                      <Input
                        value={cue.title}
                        onChange={(inputEvent) =>
                          reviseSuggestions("runOfShow", (current) => ({
                            ...current,
                            runOfShow: current.runOfShow.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, title: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        className="h-8"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Minutes</span>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        value={cue.duration ?? ""}
                        onChange={(inputEvent) =>
                          reviseSuggestions("runOfShow", (current) => ({
                            ...current,
                            runOfShow: current.runOfShow.map((draft, draftIndex) =>
                              draftIndex === index
                                ? { ...draft, duration: Math.max(0, Number.parseInt(inputEvent.target.value, 10) || 0) }
                                : draft,
                            ),
                          }))
                        }
                        className="h-8"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Owner</span>
                      <Input
                        value={cue.responsible ?? ""}
                        onChange={(inputEvent) =>
                          reviseSuggestions("runOfShow", (current) => ({
                            ...current,
                            runOfShow: current.runOfShow.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, responsible: inputEvent.target.value || null } : draft,
                            ),
                          }))
                        }
                        placeholder="Assign later"
                        className="h-8"
                      />
                    </label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-danger-text"
                      aria-label={`Remove ${cue.title || "cue"}`}
                      onClick={() =>
                        reviseSuggestions("runOfShow", (current) => ({
                          ...current,
                          runOfShow: current.runOfShow.filter((_, draftIndex) => draftIndex !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-hairline bg-surface/90 xl:col-span-5">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-primary-text" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Mood board directions</p>
                    <p className="text-xs text-muted-foreground">Edit the names, notes and colors before adding them</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      reviseSuggestions("mood", (current) => ({
                        ...current,
                        moodConcepts: [
                          ...current.moodConcepts,
                          {
                            name: "New direction",
                            description: "Add the visual feeling, materials and details for this direction.",
                            palette: ["#F8D810", "#FFF4C2", "#C98B2E", "#FFFFFF"],
                            keywords: ["warm", "welcoming"],
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 size-3.5" />
                    Direction
                  </Button>
                  <ApplyButton applied={applied.has("mood")} busy={applying === "mood"} onClick={() => void applyMood()} />
                </div>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {suggestions.moodConcepts.map((concept, index) => (
                  <article key={index} className="relative overflow-hidden rounded-lg border border-hairline bg-surface">
                    <img src={moodConceptDataUrl(concept)} alt={`${concept.name} palette`} className="aspect-4/3 w-full object-cover" />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 size-7"
                      aria-label={`Remove ${concept.name || "mood direction"}`}
                      onClick={() =>
                        reviseSuggestions("mood", (current) => ({
                          ...current,
                          moodConcepts: current.moodConcepts.filter((_, draftIndex) => draftIndex !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <div className="space-y-2 p-3">
                      <Input
                        value={concept.name}
                        aria-label="Mood direction name"
                        onChange={(inputEvent) =>
                          reviseSuggestions("mood", (current) => ({
                            ...current,
                            moodConcepts: current.moodConcepts.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, name: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        className="h-8 font-semibold"
                      />
                      <Textarea
                        value={concept.description}
                        aria-label={`${concept.name || "Mood direction"} description`}
                        onChange={(inputEvent) =>
                          reviseSuggestions("mood", (current) => ({
                            ...current,
                            moodConcepts: current.moodConcepts.map((draft, draftIndex) =>
                              draftIndex === index ? { ...draft, description: inputEvent.target.value } : draft,
                            ),
                          }))
                        }
                        rows={3}
                        className="resize-none text-xs leading-relaxed"
                      />
                      <div className="flex items-center gap-2" aria-label={`${concept.name || "Mood direction"} colors`}>
                        {concept.palette.map((color, colorIndex) => (
                          <label key={colorIndex} className="relative size-8 overflow-hidden rounded-full border border-hairline">
                            <span className="sr-only">Color {colorIndex + 1}</span>
                            <input
                              type="color"
                              value={color}
                              onChange={(inputEvent) =>
                                reviseSuggestions("mood", (current) => ({
                                  ...current,
                                  moodConcepts: current.moodConcepts.map((draft, draftIndex) => {
                                    if (draftIndex !== index) return draft;
                                    const palette = draft.palette.map((entry, entryIndex) =>
                                      entryIndex === colorIndex ? inputEvent.target.value : entry,
                                    ) as MoodConcept["palette"];
                                    return { ...draft, palette };
                                  }),
                                }))
                              }
                              className="absolute -inset-1 size-10 cursor-pointer border-0 bg-transparent p-0"
                            />
                          </label>
                        ))}
                      </div>
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
