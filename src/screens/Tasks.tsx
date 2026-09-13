/**
 * Every open task, across every live event.
 *
 * The old build had a top-level "Checklists" nav item holding checklists that belonged
 * to nothing. Tasks belong to events — but the person doing them on a Tuesday morning
 * wants one list, not six event pages. This is that list, and ticking here writes to the
 * event's own checklist.
 *
 * Reached from Today and ⌘K rather than the sidebar: it is a working view, not a seventh
 * destination competing for attention.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorNotice,
  GroupLabel,
  LoadingRows,
  Panel,
  PanelHeader,
  PageHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import { useOpenTasks, useUpdateChecklistItem } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { eventSectionHref } from "@/app/shell/nav";
import type { OpenTask } from "@/data/entities";

type Grouping = "event" | "area" | "owner";

const GROUPINGS: Array<{ id: Grouping; label: string }> = [
  { id: "event", label: "By event" },
  { id: "area", label: "By area" },
  { id: "owner", label: "By owner" },
];

function groupKey(task: OpenTask, grouping: Grouping): string {
  if (grouping === "event") return task.eventTitle;
  if (grouping === "area") return task.category;
  return task.assignedTo ?? "Unassigned";
}

function TaskRow({ task }: { task: OpenTask }) {
  const update = useUpdateChecklistItem();
  const { date: formatDate, when } = usePreferences();

  return (
    <li className="flex items-start gap-3 px-5 py-2.5">
      <Checkbox
        checked={false}
        aria-label={`Mark “${task.title}” complete`}
        className="mt-0.5"
        onCheckedChange={(checked) => {
          if (checked !== true) return;
          update.mutate(
            { eventId: task.eventId, id: task.id, patch: { completed: true } },
            {
              onSuccess: () => toast({ title: "Done", description: task.title }),
              onError: (error) => toast({ title: "Couldn't update", description: error.message }),
            },
          );
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{task.title}</p>
        {task.description ? <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {task.overdue ? (
            <Pill tone="danger">
              Overdue {task.dueDate ? formatDate(task.dueDate, "dayMonth") : ""}
            </Pill>
          ) : task.dueDate ? (
            <Pill>
              Due {formatDate(task.dueDate, "dayMonth")}
            </Pill>
          ) : null}
          <Pill>{task.category}</Pill>
          {task.assignedTo ? <span className="text-xs text-muted-foreground">{task.assignedTo}</span> : null}
          <Link
            href={eventSectionHref(task.eventId, "plan")}
            className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {task.eventTitle} · {when(task.eventDate)}
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function Tasks() {
  const { data: tasks, isLoading, isError, error, refetch } = useOpenTasks();
  const [grouping, setGrouping] = useState<Grouping>("event");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tasks ?? [];
    return (tasks ?? []).filter((task) =>
      [task.title, task.category, task.eventTitle, task.assignedTo ?? ""].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [tasks, search]);

  const groups = useMemo(() => {
    const map = new Map<string, OpenTask[]>();
    for (const task of visible) {
      const key = groupKey(task, grouping);
      const bucket = map.get(key);
      if (bucket) bucket.push(task);
      else map.set(key, [task]);
    }
    // Groups with overdue work first, then the biggest.
    return [...map.entries()].sort((a, b) => {
      const overdueA = a[1].filter((task) => task.overdue).length;
      const overdueB = b[1].filter((task) => task.overdue).length;
      return overdueB - overdueA || b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
  }, [visible, grouping]);

  const overdue = (tasks ?? []).filter((task) => task.overdue).length;
  const dueSoon = (tasks ?? []).filter((task) => !task.overdue && (task.daysUntilEvent ?? 999) <= 7).length;
  const unassigned = (tasks ?? []).filter((task) => !task.assignedTo).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Everything still open"
        description="Across every live event. Completed and cancelled events are left out — ticking here writes to the event's own checklist."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open" value={tasks?.length ?? 0} icon={ListChecks} loading={isLoading} />
        <StatTile label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "success"} loading={isLoading} />
        <StatTile label="Event within 7 days" value={dueSoon} tone={dueSoon > 0 ? "warning" : "neutral"} loading={isLoading} />
        <StatTile label="Unassigned" value={unassigned} tone={unassigned > 0 ? "warning" : "neutral"} loading={isLoading} />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load tasks" onRetry={() => void refetch()} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-hairline bg-surface p-0.5 shadow-xs" role="tablist">
          {GROUPINGS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={grouping === option.id}
              onClick={() => setGrouping(option.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                grouping === option.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(inputEvent) => setSearch(inputEvent.target.value)}
          placeholder="Search tasks, events or owners"
          aria-label="Search tasks"
          className="sm:max-w-xs"
        />
      </div>

      <Panel>
        <PanelHeader title={`${visible.length} open ${visible.length === 1 ? "task" : "tasks"}`} />
        {isLoading ? (
          <LoadingRows rows={6} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={search ? "Nothing matches that search" : "Everything is done"}
            description={
              search ? "Try an event name or an owner." : "No open tasks on any live event. Enjoy it while it lasts."
            }
          />
        ) : (
          <div>
            {groups.map(([name, groupTasks]) => {
              const groupOverdue = groupTasks.filter((task) => task.overdue).length;
              return (
                <section key={name}>
                  <GroupLabel>
                    {name} · {groupTasks.length}
                    {groupOverdue > 0 ? ` · ${groupOverdue} overdue` : ""}
                  </GroupLabel>
                  <ul className="divide-y divide-hairline">
                    {groupTasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
