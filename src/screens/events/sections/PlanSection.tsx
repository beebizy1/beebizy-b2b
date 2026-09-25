/**
 * Plan: checklist, run of show and mood board.
 *
 * The checklist groups by area and surfaces overdue items first, because "17 tasks"
 * is not a plan — "Catering: 2 overdue" is. Ticking an item writes immediately and
 * the readiness score above updates with it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Check, Clock, ImagePlus, ListChecks, Mail, Pencil, Plus, Send, Sparkles, Store, Trash2, X } from "lucide-react";
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
  useMembers,
  useUpdateRunOfShowItem,
  useVolunteers,
  useVendors,
  useEventVendors,
  useSendVendorMessage,
} from "@/data/hooks";
import type { ChecklistItem, Event, RunOfShowItem, Vendor, VolunteerShift, WorkspaceMember } from "@/data/entities";
import { eventDayOptions, formatEventDayLabel, type EventDayOption } from "@/data/eventDays";

/**
 * The teammate a typed name refers to, if any.
 *
 * Assignment stays free text — plenty of tasks belong to a caterer or a volunteer with no
 * login — but when the name does match someone in the workspace their address is captured
 * too, because that is the difference between a task that can notify and one that cannot.
 */
function matchMember(members: WorkspaceMember[] | undefined, typed: string): WorkspaceMember | undefined {
  const needle = typed.trim().toLowerCase();
  if (!needle) return undefined;
  return (members ?? []).find(
    (member) => member.name?.toLowerCase() === needle || member.email?.toLowerCase() === needle,
  );
}

const ASSIGNEE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assignmentEmail(members: WorkspaceMember[] | undefined, typed: string): string | null {
  const value = typed.trim().toLowerCase();
  return matchMember(members, typed)?.email ?? (ASSIGNEE_EMAIL.test(value) ? value : null);
}

function runOfShowAssignee(
  members: WorkspaceMember[] | undefined,
  volunteers: VolunteerShift[] | undefined,
  typed: string,
): { responsible: string | null; assignedEmail: string | null } {
  const value = typed.trim();
  const email = value.toLowerCase();
  if (!ASSIGNEE_EMAIL.test(email)) return { responsible: value || null, assignedEmail: null };

  const member = (members ?? []).find((candidate) => candidate.email?.toLowerCase() === email);
  const volunteer = (volunteers ?? []).find((candidate) => candidate.email?.toLowerCase() === email);
  return {
    responsible: member?.name?.trim() || volunteer?.name.trim() || value,
    assignedEmail: email,
  };
}

function runOfShowAssigneeOptions(
  members: WorkspaceMember[] | undefined,
  volunteers: VolunteerShift[] | undefined,
): { email: string; label: string }[] {
  const options = new Map<string, string>();
  for (const member of members ?? []) {
    const email = member.email?.trim().toLowerCase();
    if (email) options.set(email, member.name?.trim() || email);
  }
  for (const volunteer of volunteers ?? []) {
    const email = volunteer.email?.trim().toLowerCase();
    if (email && !options.has(email)) options.set(email, volunteer.name.trim() || email);
  }
  return [...options].map(([email, label]) => ({ email, label }));
}

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

function dateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function ChecklistRow({ eventId, item, members, vendors, focused }: { eventId: string; item: ChecklistItem; members: WorkspaceMember[] | undefined; vendors: Vendor[] | undefined; focused: boolean }) {
  const update = useUpdateChecklistItem();
  const remove = useRemoveChecklistItem();
  const overdue = isOverdue(item);
  const currentDraft = () => ({
    title: item.title,
    description: item.description ?? "",
    dueDate: dateInputValue(item.dueDate),
    assignedTo: item.assignedTo ?? "",
    vendorId: item.vendorId ?? "__none__",
    category: item.category,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentDraft);
  const assigneeListId = `checklist-assignees-${item.id}`;
  const linkedVendor = vendors?.find((vendor) => vendor.id === item.vendorId);

  if (editing) {
    return (
      <li id={`checklist-task-${item.id}`} tabIndex={-1} className={cn("scroll-mt-24 bg-surface-sunken px-5 py-4", focused && "ring-2 ring-primary")}>
        <form
          className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const title = draft.title.trim();
            if (!title) return;
            update.mutate(
              {
                eventId,
                id: item.id,
                patch: {
                  title,
                  description: draft.description.trim() || null,
                  dueDate: draft.dueDate ? new Date(`${draft.dueDate}T12:00:00.000Z`).toISOString() : null,
                  assignedTo: draft.assignedTo.trim() || null,
                  assignedEmail: assignmentEmail(members, draft.assignedTo),
                  vendorId: draft.vendorId === "__none__" ? null : draft.vendorId,
                  category: draft.category,
                },
              },
              {
                onSuccess: () => setEditing(false),
                onError: (error) => toast({ title: "Couldn't update task", description: error.message }),
              },
            );
          }}
        >
          <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-label="Task title" className="min-w-[12rem]" />
          <Input value={draft.assignedTo} onChange={(event) => setDraft((current) => ({ ...current, assignedTo: event.target.value }))} aria-label="Task assignee name or email" placeholder="Name or email" list={assigneeListId} />
          <datalist id={assigneeListId}>{(members ?? []).map((member) => <option key={member.userId ?? member.email} value={member.name ?? member.email ?? ""} />)}</datalist>
          <Select value={draft.category} onValueChange={(category) => setDraft((current) => ({ ...current, category }))}>
            <SelectTrigger aria-label="Task area"><SelectValue /></SelectTrigger>
            <SelectContent>{CHECKLIST_AREAS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} aria-label="Task due date" />
          <Select value={draft.vendorId} onValueChange={(vendorId) => setDraft((current) => ({ ...current, vendorId }))}>
            <SelectTrigger aria-label="Linked vendor"><SelectValue placeholder="Link vendor" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">No linked vendor</SelectItem>{(vendors ?? []).map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} aria-label="Task notes" placeholder="Notes or instructions" className="md:col-span-2 xl:col-span-3" />
          <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-4">
            <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(currentDraft()); setEditing(false); }}><X className="mr-1.5 size-3.5" />Cancel</Button>
            <Button type="submit" size="sm" disabled={!draft.title.trim() || update.isPending}><Check className="mr-1.5 size-3.5" />Save task</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li id={`checklist-task-${item.id}`} tabIndex={-1} className={cn("group flex scroll-mt-24 items-start gap-3 px-5 py-2.5", focused && "bg-primary-muted/60 ring-2 ring-inset ring-primary")}>
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
          {item.vendorId ? <Link href={`/app/vendors/${item.vendorId}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pill tone="neutral" className="hover:text-foreground"><Store className="mr-1 size-3" />{linkedVendor?.name ?? "Linked vendor"}</Pill></Link> : null}
          {linkedVendor?.contactEmail ? <a className="text-xs text-info-text hover:underline" href={`mailto:${linkedVendor.contactEmail}`}>{linkedVendor.contactEmail}</a> : null}
          {linkedVendor?.contactPhone ? <a className="text-xs text-muted-foreground hover:underline" href={`tel:${linkedVendor.contactPhone}`}>{linkedVendor.contactPhone}</a> : null}
          {item.assignedEmail ? <Pill tone="info"><Mail className="mr-1 size-3" />Email notification enabled</Pill> : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Edit task “${item.title}”`}
        onClick={() => { setDraft(currentDraft()); setEditing(true); }}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
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
  const { data: members } = useMembers();
  const { data: vendors } = useVendors();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("General");
  const [owner, setOwner] = useState("");
  const [vendorId, setVendorId] = useState("__none__");
  const [ownerFilter, setOwnerFilter] = useState("__all__");
  // Completed items stay on the list. Hiding them made ticking a task look like it
  // deleted the task — the row vanished and only the progress bar moved, so the tick
  // you just earned was never visible.
  const [showCompleted, setShowCompleted] = useState(true);
  const [focusedTaskId] = useState(() => new URLSearchParams(window.location.search).get("task"));
  const hasFocusedTask = useRef(false);

  useEffect(() => {
    if (hasFocusedTask.current || !focusedTaskId || !items?.some((item) => item.id === focusedTaskId)) return;
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`checklist-task-${focusedTaskId}`);
      if (!row) return;
      hasFocusedTask.current = true;
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedTaskId, items]);

  const done = (items ?? []).filter((item) => item.completed).length;
  const total = items?.length ?? 0;
  const overdueCount = (items ?? []).filter(isOverdue).length;
  const ownerSummary = useMemo(() => {
    const tally = new Map<string, { total: number; done: number; overdue: number }>();
    for (const item of items ?? []) {
      const key = item.assignedTo?.trim() || "Unassigned";
      const current = tally.get(key) ?? { total: 0, done: 0, overdue: 0 };
      current.total += 1;
      if (item.completed) current.done += 1;
      if (isOverdue(item)) current.overdue += 1;
      tally.set(key, current);
    }
    return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  // The library hides anything already here, matched on title.
  const existingTitles = useMemo(() => new Set((items ?? []).map((item) => item.title)), [items]);
  const nextOrder = (items ?? []).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

  /** Overdue areas float to the top; completed items hide behind a toggle. */
  const groups = useMemo(() => {
    const visible = (items ?? []).filter((item) =>
      (showCompleted || !item.completed) &&
      (ownerFilter === "__all__" || (item.assignedTo?.trim() || "Unassigned") === ownerFilter),
    );
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
  }, [items, ownerFilter, showCompleted]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !owner.trim()) return;
    add.mutate(
      {
        eventId: event.id,
        // An unowned task is the one nobody does, so the owner is captured up front
        // rather than through a second edit nobody makes.
        draft: {
          title: trimmed,
          category: area,
          assignedTo: owner.trim() || null,
          // Matching a teammate is what makes the assignment notifiable. A name matching
          // nobody is still a valid assignment — it just cannot be emailed.
          assignedEmail: assignmentEmail(members, owner),
          vendorId: vendorId === "__none__" ? null : vendorId,
        },
      },
      {
        onSuccess: () => {
          setTitle("");
          setOwner("");
          setVendorId("__none__");
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

      {ownerSummary.length > 0 ? <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"><span className="text-xs font-medium text-muted-foreground">Status by owner</span><Button variant={ownerFilter === "__all__" ? "secondary" : "outline"} size="sm" onClick={() => setOwnerFilter("__all__")}>Everyone · {total - done} open{overdueCount ? ` · ${overdueCount} overdue` : ""}</Button>{ownerSummary.map(([name, summary]) => <Button key={name} variant={ownerFilter === name ? "secondary" : "outline"} size="sm" onClick={() => setOwnerFilter(ownerFilter === name ? "__all__" : name)}>{name} · {summary.total - summary.done ? `${summary.total - summary.done} open` : "Complete"}{summary.overdue ? ` · ${summary.overdue} overdue` : summary.total !== summary.done ? " · on track" : ""}</Button>)}</div> : null}

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
          list="task-assignee-suggestions"
          className="w-[172px]"
        />
        <datalist id="task-assignee-suggestions">
          {(members ?? []).map((member) => (
            <option key={member.userId ?? member.email} value={member.name ?? member.email ?? ""} />
          ))}
        </datalist>
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
        <Select value={vendorId} onValueChange={(value) => { setVendorId(value); if (!owner.trim() && value !== "__none__") setOwner(vendors?.find((vendor) => vendor.id === value)?.name ?? ""); }}>
          <SelectTrigger className="w-[175px]" aria-label="Link task to vendor"><SelectValue placeholder="Link vendor" /></SelectTrigger>
          <SelectContent><SelectItem value="__none__">No linked vendor</SelectItem>{(vendors ?? []).map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!title.trim() || !owner.trim() || add.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
        {!owner.trim() ? <span className="w-full text-xs text-warning-text">Assign an owner before adding the task.</span> : null}
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
                  <ChecklistRow key={item.id} eventId={event.id} item={item} members={members} vendors={vendors} focused={focusedTaskId === item.id} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RunOfShowRow({
  eventId,
  cue,
  days,
  members,
  volunteers,
  focused,
}: {
  eventId: string;
  cue: RunOfShowItem;
  days: EventDayOption[];
  members: WorkspaceMember[] | undefined;
  volunteers: VolunteerShift[] | undefined;
  focused: boolean;
}) {
  const update = useUpdateRunOfShowItem();
  const remove = useRemoveRunOfShowItem();
  const [editing, setEditing] = useState(false);
  const assigneeOptions = runOfShowAssigneeOptions(members, volunteers);
  const currentDraft = () => ({
    dayNumber: cue.dayNumber,
    startTime: cue.startTime,
    title: cue.title,
    duration: cue.duration === null ? "" : String(cue.duration),
    assignee: cue.assignedEmail ?? cue.responsible ?? "",
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
      <li id={`run-of-show-cue-${cue.id}`} tabIndex={-1} className={cn("scroll-mt-24 bg-surface-sunken px-5 py-4", focused && "ring-2 ring-primary")}>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const title = draft.title.trim();
            if (!title) return;
            const parsedDuration = draft.duration.trim() === "" ? null : Number.parseInt(draft.duration, 10);
            const assignee = runOfShowAssignee(members, volunteers, draft.assignee);
            update.mutate(
              {
                eventId,
                id: cue.id,
                patch: {
                  dayNumber: draft.dayNumber,
                  startTime: draft.startTime,
                  title,
                  duration: Number.isFinite(parsedDuration) ? parsedDuration : null,
                  responsible: assignee.responsible,
                  assignedEmail: assignee.assignedEmail,
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
          {days.length > 1 ? (
            <Select
              value={String(draft.dayNumber)}
              onValueChange={(value) => setDraft((current) => ({ ...current, dayNumber: Number(value) }))}
            >
              <SelectTrigger aria-label={`Conference day for ${cue.title}`} className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((day) => (
                  <SelectItem key={day.dayNumber} value={String(day.dayNumber)}>
                    {formatEventDayLabel(day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            type="time"
            value={draft.startTime}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            aria-label={`Start time for ${cue.title}`}
            className="w-[110px]"
          />
          <Input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            aria-label="Cue title"
            className="min-w-[12rem] flex-1"
          />
          <Input
            type="number"
            min={0}
            value={draft.duration}
            onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value }))}
            aria-label="Duration in minutes"
            placeholder="mins"
            className="w-[90px]"
          />
          <Input
            value={draft.assignee}
            onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))}
            aria-label="Cue owner name or email"
            placeholder="Choose an email or type an owner"
            list={`run-of-show-assignees-${cue.id}`}
            className="min-w-[12rem] flex-1"
          />
          <datalist id={`run-of-show-assignees-${cue.id}`}>
            {assigneeOptions.map((option) => <option key={option.email} value={option.email} label={option.label} />)}
          </datalist>
          <Input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            aria-label="Cue notes"
            placeholder="Notes, handoffs, or dependencies"
            className="min-w-[14rem] flex-[2]"
          />
          <div className="flex w-full justify-end gap-2">
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
    <li id={`run-of-show-cue-${cue.id}`} tabIndex={-1} className={cn("group flex scroll-mt-24 items-start gap-3 px-5 py-3", focused && "bg-primary-muted/60 ring-2 ring-inset ring-primary")}>
      <Checkbox
        checked={cue.completed}
        aria-label={`Mark “${cue.title}” ${cue.completed ? "incomplete" : "complete"}`}
        className="mt-0.5"
        onCheckedChange={(checked) => update.mutate(
          { eventId, id: cue.id, patch: { completed: checked === true } },
          { onError: (error) => toast({ title: "Couldn't update cue", description: error.message }) },
        )}
      />
      <span data-numeric className="w-[4.5rem] shrink-0 pt-0.5 font-mono text-xs font-semibold text-foreground">
        {formatClockTime(cue.startTime)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", cue.completed ? "text-muted-foreground line-through" : "font-medium text-foreground")}>{cue.title}</span>
        {cue.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{cue.description}</span> : null}
        {cue.responsible ? <span className="mt-1 block text-xs font-medium text-primary-text">Owner: {cue.responsible}</span> : null}
        {cue.assignedEmail ? <Pill tone="info" className="mt-1"><Mail className="mr-1 size-3" />Email notification enabled</Pill> : null}
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
  const { timeZone, timeZoneLabel } = usePreferences();
  const { data: cues, isLoading } = useRunOfShow(event.id);
  const { data: members } = useMembers();
  const { data: volunteers } = useVolunteers(event.id);
  const add = useAddRunOfShowItem();
  const days = useMemo(
    () => eventDayOptions(event.date, event.endDate, timeZone, Math.max(1, ...(cues ?? []).map((cue) => cue.dayNumber))),
    [cues, event.date, event.endDate, timeZone],
  );
  const [focusedCueId] = useState(() => new URLSearchParams(window.location.search).get("cue"));
  const [selectedDay, setSelectedDay] = useState(() => {
    const requested = Number(new URLSearchParams(window.location.search).get("day"));
    return Number.isInteger(requested) && requested > 0 ? requested : 1;
  });
  const hasFocusedCue = useRef(false);
  const [startTime, setStartTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const dayCues = (cues ?? []).filter((cue) => cue.dayNumber === selectedDay);
  const assigneeOptions = useMemo(() => runOfShowAssigneeOptions(members, volunteers), [members, volunteers]);

  useEffect(() => {
    if (!days.some((day) => day.dayNumber === selectedDay)) setSelectedDay(1);
  }, [days, selectedDay]);

  useEffect(() => {
    if (hasFocusedCue.current || !focusedCueId || !cues?.some((cue) => cue.id === focusedCueId && cue.dayNumber === selectedDay)) return;
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`run-of-show-cue-${focusedCueId}`);
      if (!row) return;
      hasFocusedCue.current = true;
      row.scrollIntoView({ block: "center" });
      row.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cues, focusedCueId, selectedDay]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsedDuration = duration.trim() === "" ? undefined : Number.parseInt(duration, 10);
    const resolvedAssignee = runOfShowAssignee(members, volunteers, assignee);
    add.mutate(
      {
        eventId: event.id,
        draft: {
          dayNumber: selectedDay,
          startTime,
          title: trimmed,
          duration: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
          responsible: resolvedAssignee.responsible,
          assignedEmail: resolvedAssignee.assignedEmail,
          completed: false,
          description: description.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setTitle("");
          setDuration("");
          setAssignee("");
          setDescription("");
        },
        onError: (error) => toast({ title: "Couldn't add cue", description: error.message }),
      },
    );
  };

  return (
    <Panel>
      <PanelHeader
        title="Run of show"
        description={`${days.length > 1 ? `${days.length}-day schedule · ` : ""}Cue times in ${timeZoneLabel}, the workspace\u2019s zone`}
      />

      {days.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto border-b border-hairline bg-surface-sunken px-5 py-3"
          aria-label="Conference days"
        >
          {days.map((day) => {
            const active = day.dayNumber === selectedDay;
            const cueCount = (cues ?? []).filter((cue) => cue.dayNumber === day.dayNumber).length;
            return (
              <button
                key={day.dayNumber}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedDay(day.dayNumber)}
                className={cn(
                  "min-w-[9.5rem] rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-hairline bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                <span className="block text-xs font-semibold">{formatEventDayLabel(day)}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[11px]",
                    active ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {cueCount} {cueCount === 1 ? "cue" : "cues"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submit();
        }}
      >
        {days.length > 1 ? (
          <div className="flex h-9 items-center rounded-md border border-input bg-surface px-3 text-xs font-semibold text-foreground">
            Day {selectedDay}
          </div>
        ) : null}
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
          value={assignee}
          onChange={(inputEvent) => setAssignee(inputEvent.target.value)}
          placeholder="Choose an email or type an owner"
          aria-label="Cue owner name or email"
          list="new-run-of-show-assignees"
          className="min-w-[10rem] flex-1"
        />
        <datalist id="new-run-of-show-assignees">
          {assigneeOptions.map((option) => <option key={option.email} value={option.email} label={option.label} />)}
        </datalist>
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
      ) : dayCues.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={days.length > 1 ? `No cues for Day ${selectedDay}` : "No cues yet"}
          description={
            days.length > 1 ? "Add the first cue for this conference day above." : "Build the order of the day above."
          }
        />
      ) : (
        <ol className="divide-y divide-hairline">
          {dayCues.map((cue) => <RunOfShowRow key={cue.id} eventId={event.id} cue={cue} days={days} members={members} volunteers={volunteers} focused={focusedCueId === cue.id} />)}
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
  const { data: eventVendors } = useEventVendors(event.id);
  const add = useAddMoodBoardImage();
  const remove = useRemoveMoodBoardImage();
  const sendToVendor = useSendVendorMessage();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [theme, setTheme] = useState("Modern garden");
  const [showVariations, setShowVariations] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");

  const shareMoodBoard = () => {
    const vendor = eventVendors?.find((booking) => booking.vendorId === selectedVendorId)?.vendor;
    if (!vendor || !images?.length) return;
    const references = images.map((image, index) => `${index + 1}. ${image.caption ?? "Mood board reference"}\n${image.url}`).join("\n\n");
    sendToVendor.mutate(
      {
        vendorId: vendor.id,
        draft: {
          eventId: event.id,
          senderName: "Beebizy event team",
          subject: `${event.title}: mood board references`,
          content: `Here are the current mood board references for ${event.title}. Please review them and reply in this thread with any questions or recommendations.\n\n${references}`,
        },
      },
      {
        onSuccess: () => toast({ title: "Mood board shared", description: `Sent to ${vendor.name} and saved in the vendor messaging hub.` }),
        onError: (error) => toast({ title: "Couldn't share the mood board", description: error.message }),
      },
    );
  };

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

      <div className="flex flex-wrap items-end gap-2 border-b border-hairline px-5 py-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="mood-board-vendor">Share with an assigned vendor</label>
          <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
            <SelectTrigger id="mood-board-vendor"><SelectValue placeholder="Choose vendor" /></SelectTrigger>
            <SelectContent>
              {(eventVendors ?? []).map((booking) => (
                <SelectItem key={booking.vendorId} value={booking.vendorId} disabled={!booking.vendor?.contactEmail}>
                  {booking.vendor?.name ?? "Unavailable vendor"}{booking.vendor?.contactEmail ? "" : " - add email first"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!selectedVendorId || !images?.length || sendToVendor.isPending} onClick={shareMoodBoard}>
          <Send className="mr-1.5 size-3.5" />{sendToVendor.isPending ? "Sending..." : "Share mood board"}
        </Button>
        <Button asChild type="button" variant="ghost" size="sm"><Link href={`/app/events/${event.id}/vendors`}><Store className="mr-1.5 size-3.5" />Assign vendors</Link></Button>
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
