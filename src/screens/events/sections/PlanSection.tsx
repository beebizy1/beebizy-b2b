/**
 * Plan: checklist, run of show and mood board.
 *
 * The checklist groups by area and surfaces overdue items first, because "17 tasks"
 * is not a plan — "Catering: 2 overdue" is. Ticking an item writes immediately and
 * the readiness score above updates with it.
 */

import { useMemo, useState } from "react";
import { Clock, ImagePlus, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
} from "@/data/hooks";
import type { ChecklistItem, Event } from "@/data/entities";

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

function ChecklistPanel({ event }: { event: Event }) {
  const { data: items, isLoading, isError, error, refetch } = useChecklist(event.id);
  const add = useAddChecklistItem();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("General");
  const [showCompleted, setShowCompleted] = useState(false);

  const done = (items ?? []).filter((item) => item.completed).length;
  const total = items?.length ?? 0;
  const overdueCount = (items ?? []).filter(isOverdue).length;

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
      { eventId: event.id, draft: { title: trimmed, category: area } },
      {
        onSuccess: () => setTitle(""),
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
          total > done ? (
            <Button variant="outline" size="sm" onClick={() => setShowCompleted((previous) => !previous)}>
              {showCompleted ? "Hide done" : "Show done"}
            </Button>
          ) : null
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

function RunOfShowPanel({ event }: { event: Event }) {
  const { timeZoneLabel } = usePreferences();
  const { data: cues, isLoading } = useRunOfShow(event.id);
  const add = useAddRunOfShowItem();
  const remove = useRemoveRunOfShowItem();
  const [startTime, setStartTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");

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
        },
      },
      {
        onSuccess: () => {
          setTitle("");
          setDuration("");
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
      </form>

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (cues ?? []).length === 0 ? (
        <EmptyState icon={Clock} title="No cues yet" description="Build the order of the day above." />
      ) : (
        <ol className="divide-y divide-hairline">
          {(cues ?? []).map((cue) => (
            <li key={cue.id} className="group flex items-baseline gap-4 px-5 py-3">
              <span data-numeric className="w-14 shrink-0 font-mono text-xs font-semibold text-foreground">
                {cue.startTime}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{cue.title}</span>
                {cue.responsible ? (
                  <span className="block truncate text-xs text-muted-foreground">{cue.responsible}</span>
                ) : null}
              </span>
              {cue.duration ? (
                <span data-numeric className="shrink-0 text-xs text-muted-foreground">
                  {cue.duration}m
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Delete cue “${cue.title}”`}
                onClick={() =>
                  remove.mutate(
                    { eventId: event.id, id: cue.id },
                    { onError: (error) => toast({ title: "Couldn't delete", description: error.message }) },
                  )
                }
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function MoodBoardPanel({ event }: { event: Event }) {
  const { data: images, isLoading } = useMoodBoard(event.id);
  const add = useAddMoodBoardImage();
  const remove = useRemoveMoodBoardImage();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");

  return (
    <Panel>
      <PanelHeader title="Mood board" description="Reference images for decor, staging and lighting" />

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

export default function PlanSection({ event }: { event: Event }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ChecklistPanel event={event} />
        <RunOfShowPanel event={event} />
      </div>
      {/* Full width, below the two working panels: reference images are for judging a look,
          and at sidebar width they were too small to judge anything by. */}
      <MoodBoardPanel event={event} />
    </div>
  );
}
