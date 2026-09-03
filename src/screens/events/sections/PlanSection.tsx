/**
 * Plan: checklist, run of show and mood board.
 *
 * The checklist groups by area and surfaces overdue items first, because "17 tasks"
 * is not a plan — "Catering: 2 overdue" is. Ticking an item writes immediately and
 * the readiness score above updates with it.
 */

import { useMemo, useState } from "react";
import { Check, Clock, ImagePlus, ListChecks, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import ChecklistLibrarySheet from "./ChecklistLibrarySheet";
import { cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/datetime";
import { usePreferences } from "@/app/preferences";
import {
  EmptyState,
  ErrorNotice,
  GroupLabel,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/primitives";
import {
  useAddChecklistItem,
  useAddMoodBoardImage,
  useAddRunOfShowItem,
  useChecklist,
  useMoodBoard,
  useRemoveChecklistItem,
  useRemoveMoodBoardImage,
  useRemoveRunOfShowItem,
  useRunOfShow,
  useUpdateChecklistItem,
  useUpdateRunOfShowItem,
} from "@/data/hooks";
import type { ChecklistItem, Event, RunOfShowItem } from "@/data/entities";

const CHECKLIST_AREAS = [
  "Venue",
  "Catering",
  "AV",
  "Print",
  "Logistics",
  "Marketing",
  "Programme",
  "Staffing",
  "Sponsorship",
  "Fundraising",
  "Compliance",
  "General",
];

function isOverdue(item: ChecklistItem): boolean {
  return !item.completed && item.dueDate !== null && new Date(item.dueDate) < new Date();
}

function DueLabel({ item }: { item: ChecklistItem }) {
  const { date } = usePreferences();
  if (!item.dueDate) return null;
  return <>{date(item.dueDate, "dayMonth")}</>;
}

function ChecklistRow({ eventId, item }: { eventId: string; item: ChecklistItem }) {
  const update = useUpdateChecklistItem();
  const remove = useRemoveChecklistItem();
  const overdue = isOverdue(item);

  return (
    <li className="group flex items-start gap-3 px-5 py-2.5">
      <Checkbox
        checked={item.completed}
        aria-label={`Mark “${item.title}” ${item.completed ? "incomplete" : "complete"}`}
        className="mt-0.5"
        onCheckedChange={(checked) =>
          update.mutate(
            { eventId, id: item.id, patch: { completed: checked === true } },
            { onError: (error) => toast({ title: "Couldn't update", description: error.message }) },
          )
        }
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", item.completed ? "text-muted-foreground line-through" : "font-medium text-foreground")}>
          {item.title}
        </p>
        {item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.dueDate ? (
            <Pill tone={overdue ? "danger" : "neutral"}>
              {overdue ? "Overdue " : "Due "}
              <DueLabel item={item} />
            </Pill>
          ) : null}
          {item.assignedTo ? <span className="text-xs text-muted-foreground">{item.assignedTo}</span> : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Delete “${item.title}”`}
        onClick={() =>
          remove.mutate(
            { eventId, id: item.id },
            { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
          )
        }
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

export function ChecklistPanel({ event }: { event: Event }) {
  const { data: items, isLoading, isError, error, refetch } = useChecklist(event.id);
  const add = useAddChecklistItem();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("General");
  const [owner, setOwner] = useState("");
  // Completed items stay on the list. Hiding them made ticking a task look like it
  // deleted the task — the row vanished and only the progress bar moved, so the tick
  // you just earned was never visible.
  const [showCompleted, setShowCompleted] = useState(true);

  const done = (items ?? []).filter((item) => item.completed).length;
  const total = items?.length ?? 0;
  const overdueCount = (items ?? []).filter(isOverdue).length;

  // The library hides anything already here, matched on title.
  const existingTitles = useMemo(() => new Set((items ?? []).map((item) => item.title)), [items]);
  const nextOrder = (items ?? []).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

  /** Overdue areas float to the top; completed items hide behind a toggle. */
  const groups = useMemo(() => {
    const visible = (items ?? []).filter((item) => showCompleted || !item.completed);
    const map = new Map<string, ChecklistItem[]>();
    for (const item of visible) {
      const bucket = map.get(item.category);
      if (bucket) bucket.push(item);
      else map.set(item.category, [item]);
    }
    return [...map.entries()]
      .map(([category, rows]) => ({
        category,
        rows: rows.sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.sortOrder - b.sortOrder),
        overdue: rows.filter(isOverdue).length,
      }))
      .sort((a, b) => b.overdue - a.overdue || a.category.localeCompare(b.category));
  }, [items, showCompleted]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    add.mutate(
      {
        eventId: event.id,
        // An unowned task is the one nobody does, so the owner is captured up front
        // rather than through a second edit nobody makes.
        draft: { title: trimmed, category: area, assignedTo: owner.trim() || null },
      },
      {
        onSuccess: () => {
          setTitle("");
          setOwner("");
        },
        onError: (mutationError) => toast({ title: "Couldn't add task", description: mutationError.message }),
      },
    );
  };

  return (
    <Panel>
      <PanelHeader
        title="Checklist"
        description={total > 0 ? `${done} of ${total} done${overdueCount ? ` · ${overdueCount} overdue` : ""}` : "Nothing yet"}
        actions={
          <>
            <ChecklistLibrarySheet
              eventId={event.id}
              existingTitles={existingTitles}
              nextOrder={nextOrder}
            />
            {done > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setShowCompleted((previous) => !previous)}>
                {showCompleted ? `Hide done (${done})` : `Show done (${done})`}
              </Button>
            ) : null}
          </>
        }
      />

      {total > 0 ? (
        <div className="border-b border-hairline px-5 py-3">
          <Meter
            value={done}
            max={total}
            tone={done === total ? "success" : overdueCount > 0 ? "danger" : "brand"}
            caption={`${Math.round((done / total) * 100)}%`}
          />
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submit();
        }}
      >
        <Input
          value={title}
          onChange={(inputEvent) => setTitle(inputEvent.target.value)}
          placeholder="Add a task…"
          aria-label="New task"
          className="min-w-[12rem] flex-1"
        />
        <Input
          value={owner}
          onChange={(inputEvent) => setOwner(inputEvent.target.value)}
          placeholder="Who's responsible?"
          aria-label="Assign this task to someone"
          className="w-[172px]"
        />
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-[150px]" aria-label="Task area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHECKLIST_AREAS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={4} className="p-4" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={total > 0 ? "Everything is done" : "No tasks yet"}
          description={
            total > 0
              ? "Nice. Toggle “Show done” to see the completed list."
              : "Add tasks above, or start the next event from a template that already has them."
          }
        />
      ) : (
        <div>
          {groups.map((group) => (
            <section key={group.category}>
              <GroupLabel>
                {group.category}
                {group.overdue > 0 ? ` · ${group.overdue} overdue` : ""}
              </GroupLabel>
              <ul className="divide-y divide-hairline">
                {group.rows.map((item) => (
                  <ChecklistRow key={item.id} eventId={event.id} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RunOfShowRow({ eventId, cue }: { eventId: string; cue: RunOfShowItem }) {
  const update = useUpdateRunOfShowItem();
  const remove = useRemoveRunOfShowItem();
  const [editing, setEditing] = useState(false);
  const currentDraft = () => ({
    startTime: cue.startTime,
    title: cue.title,
    duration: cue.duration === null ? "" : String(cue.duration),
    responsible: cue.responsible ?? "",
    description: cue.description ?? "",
  });
  const [draft, setDraft] = useState(currentDraft);

  const cancelEditing = () => {
    setDraft(currentDraft());
    setEditing(false);
  };

  const startEditing = () => {
    setDraft(currentDraft());
    setEditing(true);
  };

  if (editing) {
    return (
      <li className="bg-surface-sunken px-5 py-4">
        <form
          className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_90px]"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const title = draft.title.trim();
            if (!title) return;
            const parsedDuration = draft.duration.trim() === "" ? null : Number.parseInt(draft.duration, 10);
            update.mutate(
              {
                eventId,
                id: cue.id,
                patch: {
                  startTime: draft.startTime,
                  title,
                  duration: Number.isFinite(parsedDuration) ? parsedDuration : null,
                  responsible: draft.responsible.trim() || null,
                  description: draft.description.trim() || null,
                },
              },
              {
                onSuccess: () => setEditing(false),
                onError: (error) => toast({ title: "Couldn't update cue", description: error.message }),
              },
            );
          }}
        >
          <Input
            type="time"
            value={draft.startTime}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            aria-label={`Start time for ${cue.title}`}
          />
          <Input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            aria-label="Cue title"
          />
          <Input
            type="number"
            min={0}
            value={draft.duration}
            onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value }))}
            aria-label="Duration in minutes"
            placeholder="mins"
          />
          <Input
            value={draft.responsible}
            onChange={(event) => setDraft((current) => ({ ...current, responsible: event.target.value }))}
            aria-label="Cue owner"
            placeholder="Owner or team"
            className="sm:col-span-1"
          />
          <Input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            aria-label="Cue notes"
            placeholder="Notes, handoffs, or dependencies"
            className="sm:col-span-2"
          />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>
              <X className="mr-1.5 size-3.5" />
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!draft.title.trim() || update.isPending}>
              <Check className="mr-1.5 size-3.5" />
              Save cue
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-4 px-5 py-3">
      <span data-numeric className="w-[4.5rem] shrink-0 pt-0.5 font-mono text-xs font-semibold text-foreground">
        {formatClockTime(cue.startTime)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{cue.title}</span>
        {cue.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{cue.description}</span> : null}
        {cue.responsible ? <span className="mt-1 block text-xs font-medium text-primary-text">Owner: {cue.responsible}</span> : null}
      </span>
      {cue.duration ? <span data-numeric className="shrink-0 pt-0.5 text-xs text-muted-foreground">{cue.duration}m</span> : null}
      <button
        type="button"
        aria-label={`Edit cue “${cue.title}”`}
        onClick={startEditing}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Delete cue “${cue.title}”`}
        onClick={() =>
          remove.mutate(
            { eventId, id: cue.id },
            { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
          )
        }
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

export function RunOfShowPanel({ event }: { event: Event }) {
  const { timeZoneLabel } = usePreferences();
  const { data: cues, isLoading } = useRunOfShow(event.id);
  const add = useAddRunOfShowItem();
  const [startTime, setStartTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [responsible, setResponsible] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsedDuration = duration.trim() === "" ? undefined : Number.parseInt(duration, 10);
    add.mutate(
      {
        eventId: event.id,
        draft: {
          startTime,
          title: trimmed,
          duration: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
          responsible: responsible.trim() || undefined,
          description: description.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setTitle("");
          setDuration("");
          setResponsible("");
          setDescription("");
        },
        onError: (error) => toast({ title: "Couldn't add cue", description: error.message }),
      },
    );
  };

  return (
    <Panel>
      <PanelHeader title="Run of show" description={`Cue times in ${timeZoneLabel}, the workspace\u2019s zone`} />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submit();
        }}
      >
        <Input
          type="time"
          value={startTime}
          onChange={(inputEvent) => setStartTime(inputEvent.target.value)}
          aria-label="Cue start time"
          className="w-[110px]"
        />
        <Input
          value={title}
          onChange={(inputEvent) => setTitle(inputEvent.target.value)}
          placeholder="What happens…"
          aria-label="Cue title"
          className="min-w-[10rem] flex-1"
        />
        <Input
          type="number"
          min={0}
          value={duration}
          onChange={(inputEvent) => setDuration(inputEvent.target.value)}
          placeholder="mins"
          aria-label="Duration in minutes"
          className="w-[86px]"
        />
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
        <Input
          value={responsible}
          onChange={(inputEvent) => setResponsible(inputEvent.target.value)}
          placeholder="Owner or team"
          aria-label="Cue owner"
          className="min-w-[10rem] flex-1"
        />
        <Input
          value={description}
          onChange={(inputEvent) => setDescription(inputEvent.target.value)}
          placeholder="Notes or dependencies"
          aria-label="Cue notes"
          className="min-w-[12rem] flex-2"
        />
      </form>

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (cues ?? []).length === 0 ? (
        <EmptyState icon={Clock} title="No cues yet" description="Build the order of the day above." />
      ) : (
        <ol className="divide-y divide-hairline">
          {(cues ?? []).map((cue) => <RunOfShowRow key={cue.id} eventId={event.id} cue={cue} />)}
        </ol>
      )}
    </Panel>
  );
}

/**
 * A few reference images to start a board from.
 *
 * Unsplash source URLs rather than bundled assets: the board stores a URL, so a sample
 * has to be one, and shipping image binaries for a starter suggestion is not worth the
 * bundle.
 */
const SAMPLE_REFERENCES = [
  { caption: "Warm candlelit tables", url: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=80" },
  { caption: "Stage and LED backdrop", url: "https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=1200&q=80" },
  { caption: "Garden reception", url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200&q=80" },
  { caption: "Minimal conference set", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80" },
];

export function MoodBoardPanel({ event }: { event: Event }) {
  const { data: images, isLoading } = useMoodBoard(event.id);
  const add = useAddMoodBoardImage();
  const remove = useRemoveMoodBoardImage();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [theme, setTheme] = useState("Modern garden");
  const [showVariations, setShowVariations] = useState(false);

  const variations = [
    {
      name: "Airy",
      note: `A light, restrained take on ${theme.toLowerCase()} with natural texture and generous negative space.`,
      swatches: ["bg-[#e9efe6]", "bg-[#adc6a8]", "bg-[#f3ead9]"],
    },
    {
      name: "Warm",
      note: `A welcoming ${theme.toLowerCase()} direction built around amber light, layered materials and social energy.`,
      swatches: ["bg-[#8c5d3f]", "bg-[#e8bd6d]", "bg-[#efe1cb]"],
    },
    {
      name: "Dramatic",
      note: `A higher-contrast ${theme.toLowerCase()} variation for evening lighting, focal moments and photography.`,
      swatches: ["bg-[#172922]", "bg-[#4b6555]", "bg-[#bba875]"],
    },
  ];

  return (
    <Panel>
      <PanelHeader title="Mood board" description="Reference images for decor, staging and lighting" />

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-primary-wash px-5 py-3">
        <Sparkles className="size-4 text-primary-text" aria-hidden="true" />
        <Input
          value={theme}
          onChange={(inputEvent) => setTheme(inputEvent.target.value)}
          placeholder="Describe a theme"
          aria-label="Mood board theme"
          className="min-w-[12rem] flex-1 bg-surface"
        />
        <Button type="button" size="sm" onClick={() => setShowVariations(true)} disabled={!theme.trim()}>
          Create theme variations
        </Button>
      </div>

      {showVariations ? (
        <div className="grid gap-3 border-b border-hairline p-5 md:grid-cols-3">
          {variations.map((variation) => (
            <article key={variation.name} className="overflow-hidden rounded-xl border border-hairline bg-card">
              <div className="grid h-16 grid-cols-3">
                {variation.swatches.map((swatch) => <span key={swatch} className={swatch} />)}
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-semibold text-foreground">{variation.name} · {theme}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{variation.note}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = url.trim();
          if (!trimmed) return;
          add.mutate(
            { eventId: event.id, url: trimmed, caption: caption.trim() || null },
            {
              onSuccess: () => {
                setUrl("");
                setCaption("");
              },
              onError: (error) => toast({ title: "Couldn't add image", description: error.message }),
            },
          );
        }}
      >
        <Input
          type="url"
          value={url}
          onChange={(inputEvent) => setUrl(inputEvent.target.value)}
          placeholder="Image URL"
          aria-label="Image URL"
          className="min-w-[12rem] flex-1"
        />
        <Input
          value={caption}
          onChange={(inputEvent) => setCaption(inputEvent.target.value)}
          placeholder="Caption (optional)"
          aria-label="Caption"
          className="min-w-[10rem] flex-1"
        />
        <Button type="submit" size="sm" disabled={!url.trim() || add.isPending}>
          <ImagePlus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {/* Starting from a blank URL field is a cold start. These fill it in one click so
          the board has something to react to. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">Or pick a sample</span>
        {SAMPLE_REFERENCES.map((sample) => (
          <button
            key={sample.url}
            type="button"
            onClick={() => {
              setUrl(sample.url);
              setCaption(sample.caption);
            }}
            className="rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            {sample.caption}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={2} className="p-4" />
      ) : (images ?? []).length === 0 ? (
        <EmptyState icon={ImagePlus} title="No references yet" description="Paste an image URL to start building the look." />
      ) : (
        <ul className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {(images ?? []).map((image) => (
            <li key={image.id} className="group relative overflow-hidden rounded-lg border border-hairline">
              <img
                src={image.url}
                alt={image.caption ?? "Mood board reference"}
                loading="lazy"
                className="aspect-4/3 w-full object-cover"
              />
              {image.caption ? (
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-ink/85 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
                  {image.caption}
                </p>
              ) : null}
              <button
                type="button"
                aria-label="Remove image"
                onClick={() =>
                  remove.mutate(
                    { eventId: event.id, id: image.id },
                    { onError: (error) => toast({ title: "Couldn't remove", description: error.message }) },
                  )
                }
                className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
