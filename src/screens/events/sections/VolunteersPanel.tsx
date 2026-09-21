import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Copy, HeartHandshake, Mail, Pencil, Plus, Search, Trash2, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { toast } from "@/hooks/use-toast";
import {
  useAddVolunteer,
  useAddVolunteerNeed,
  useRemoveVolunteer,
  useShareEvent,
  useUpdateVolunteer,
  useUpdateVolunteerNeed,
  useVolunteerNeeds,
  useVolunteers,
} from "@/data/hooks";
import {
  VOLUNTEER_STATUSES,
  type Event,
  type VolunteerShift,
  type VolunteerShiftDraft,
  type VolunteerStatus,
  type VolunteerNeedDraft,
  type VolunteerNeed,
} from "@/data/entities";
import { volunteerCoverage } from "@/data/santaClara";
import VolunteerCsvImportDialog from "./VolunteerCsvImportDialog";
import { eventDayOptions, formatEventDayLabel, type EventDayOption } from "@/data/eventDays";
import { usePreferences } from "@/app/preferences";

const STATUS_LABEL: Record<VolunteerStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<VolunteerStatus, "neutral" | "success" | "info"> = {
  scheduled: "neutral",
  confirmed: "info",
  checked_in: "success",
  completed: "success",
  cancelled: "neutral",
};

function VolunteerEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  needs,
  days,
}: {
  initial?: VolunteerShift;
  needs: VolunteerNeed[];
  days: EventDayOption[];
  submitLabel: string;
  onSubmit: (draft: VolunteerShiftDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [needId, setNeedId] = useState(initial?.needId ?? "__adhoc__");
  const [dayNumber, setDayNumber] = useState(initial?.dayNumber ?? 1);
  const [role, setRole] = useState(initial?.role ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "12:00");
  const [status, setStatus] = useState<VolunteerStatus>(initial?.status ?? "scheduled");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const isLinkedRequirement = needId !== "__adhoc__";
  const valid = name.trim() && role.trim() && startTime && endTime && startTime !== endTime;

  return (
    <form
      className="grid gap-3 rounded-lg border border-hairline bg-surface-sunken/40 p-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        setSaving(true);
        void onSubmit({
          needId: needId === "__adhoc__" ? null : needId,
          dayNumber,
          name: name.trim(),
          role: role.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          startTime,
          endTime,
          status,
          notes: notes.trim() || null,
        }).finally(() => setSaving(false));
      }}
    >
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Volunteer name
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required maxLength={120} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Staffing requirement
        <Select value={needId} onValueChange={(value) => {
          setNeedId(value);
          const need = needs.find((candidate) => candidate.id === value);
          if (need) { setDayNumber(need.dayNumber); setRole(need.role); setStartTime(need.startTime); setEndTime(need.endTime); setNotes(need.notes ?? ""); }
        }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__adhoc__">Ad-hoc shift</SelectItem>{needs.map((need) => <SelectItem key={need.id} value={need.id}>{need.role} · {need.startTime}–{need.endTime}</SelectItem>)}</SelectContent></Select>
      </label>
      {days.length > 1 ? (
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Event day
          <Select value={String(dayNumber)} onValueChange={(value) => setDayNumber(Number(value))} disabled={isLinkedRequirement}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{days.map((day) => <SelectItem key={day.dayNumber} value={String(day.dayNumber)}>{formatEventDayLabel(day)}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      ) : null}
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Role
        <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Welcome desk, usher…" required maxLength={120} disabled={isLinkedRequirement} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Email
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Optional" maxLength={320} />
        <span className="block font-normal">Adding an email sends the shift and a Beebizy link.</span>
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Phone
        <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" maxLength={60} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Shift starts
        <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required disabled={isLinkedRequirement} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Shift ends
        <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required disabled={isLinkedRequirement} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Status
        <Select value={status} onValueChange={(value) => setStatus(value as VolunteerStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {VOLUNTEER_STATUSES.map((option) => <SelectItem key={option} value={option}>{STATUS_LABEL[option]}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Shift notes
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Arrival point, training or handoff notes" className="min-h-9" maxLength={1000} />
      </label>
      <div className="flex items-center justify-end gap-2 md:col-span-2 xl:col-span-4">
        {startTime === endTime ? <p className="mr-auto text-xs text-danger-text">Start and end time must be different.</p> : null}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function shiftMinutes(start: string, end: string): number {
  const [startHour = 0, startMinute = 0] = start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = end.split(":").map(Number);
  const difference = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return difference < 0 ? difference + 24 * 60 : difference;
}

function shiftLength(start: string, end: string): string {
  const minutes = shiftMinutes(start, end);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder}m` : ""}` || "0m";
}

function NeedEditor({ onSubmit, onCancel, days }: { onSubmit: (draft: VolunteerNeedDraft) => Promise<void>; onCancel: () => void; days: EventDayOption[] }) {
  const [role, setRole] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [requiredCount, setRequiredCount] = useState(2);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = role.trim() && startTime && endTime && startTime !== endTime && requiredCount > 0;
  return (
    <form className="grid gap-3 rounded-lg border border-hairline bg-surface-sunken/40 p-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={(formEvent) => {
      formEvent.preventDefault();
      if (!valid) return;
      setSaving(true);
      void onSubmit({ dayNumber, role: role.trim(), startTime, endTime, requiredCount, notes: notes.trim() || null, signupOpen: true })
        .finally(() => setSaving(false));
    }}>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Role needed<Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Welcome desk" required maxLength={120} /></label>
      {days.length > 1 ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Event day<Select value={String(dayNumber)} onValueChange={(value) => setDayNumber(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{days.map((day) => <SelectItem key={day.dayNumber} value={String(day.dayNumber)}>{formatEventDayLabel(day)}</SelectItem>)}</SelectContent></Select></label> : null}
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Starts<Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Ends<Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">People needed<Input type="number" min={1} max={500} value={requiredCount} onChange={(e) => setRequiredCount(Number(e.target.value))} required /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Arrival or training notes" maxLength={1000} /></label>
      <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-5"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button size="sm" disabled={!valid || saving}>{saving ? "Saving…" : "Add requirement"}</Button></div>
    </form>
  );
}

export default function VolunteersPanel({ event, allowSpreadsheetImport = false }: { event: Event; allowSpreadsheetImport?: boolean }) {
  const { timeZone } = usePreferences();
  const { data, isLoading, isError, error, refetch } = useVolunteers(event.id);
  const { data: needRows, isLoading: needsLoading } = useVolunteerNeeds(event.id);
  const add = useAddVolunteer();
  const addNeed = useAddVolunteerNeed();
  const update = useUpdateVolunteer();
  const updateNeed = useUpdateVolunteerNeed();
  const remove = useRemoveVolunteer();
  const share = useShareEvent();
  const [showAdd, setShowAdd] = useState(false);
  const [showAddNeed, setShowAddNeed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VolunteerShift | null>(null);
  const [search, setSearch] = useState("");
  const days = useMemo(
    () => eventDayOptions(event.date, event.endDate, timeZone, Math.max(1, ...(data ?? []).map((row) => row.dayNumber), ...(needRows ?? []).map((row) => row.dayNumber))),
    [data, event.date, event.endDate, needRows, timeZone],
  );
  const rows = useMemo(
    () => (data ?? []).slice().sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name)),
    [data],
  );
  const needle = search.trim().toLowerCase();
  const visible = rows.filter((row) =>
    [row.name, row.role, row.email, row.notes].filter(Boolean).some((value) => value!.toLowerCase().includes(needle)),
  );
  const active = rows.filter((row) => row.status !== "cancelled");
  const confirmed = active.filter((row) => row.status !== "scheduled").length;
  const onSite = active.filter((row) => row.status === "checked_in").length;
  const totalMinutes = active.reduce((sum, row) => sum + shiftMinutes(row.startTime, row.endTime), 0);
  const needs = useMemo(() => volunteerCoverage(needRows ?? [], rows), [needRows, rows]);
  const totalOpen = needs.reduce((sum, need) => sum + need.openCount, 0);

  const copySignupLink = async () => {
    try {
      const token = event.shareToken ?? (await share.mutateAsync({ id: event.id })).shareToken;
      await navigator.clipboard.writeText(`${window.location.origin}/e/${token}/volunteer`);
      toast({ title: "Volunteer signup link copied" });
    } catch (caught) {
      toast({ title: "Couldn't copy signup link", description: caught instanceof Error ? caught.message : undefined });
    }
  };

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active volunteers" value={active.length} icon={HeartHandshake} loading={isLoading} />
        <StatTile label="Confirmed" value={confirmed} tone={confirmed === active.length && active.length ? "success" : "warning"} loading={isLoading} />
        <StatTile label="On site" value={onSite} icon={UserCheck} tone={onSite ? "success" : "neutral"} loading={isLoading} />
        <StatTile label="Open positions" value={totalOpen} icon={Users} tone={totalOpen ? "warning" : "success"} loading={needsLoading} />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Staffing plan"
          description="Set the people needed for each time slot, see gaps, and share one self-signup link."
          actions={<><Button variant="outline" size="sm" onClick={() => void copySignupLink()} disabled={share.isPending}><Copy className="mr-1.5 size-3.5" />Copy signup link</Button><Button size="sm" onClick={() => setShowAddNeed(true)}><Plus className="mr-1.5 size-3.5" />Add role requirement</Button></>}
        />
        {showAddNeed ? <div className="border-b border-hairline p-4"><NeedEditor days={days} onCancel={() => setShowAddNeed(false)} onSubmit={async (draft) => {
          try {
            await addNeed.mutateAsync({ eventId: event.id, draft });
            setShowAddNeed(false);
            toast({ title: "Staffing requirement added" });
          } catch (caught) {
            toast({ title: "Couldn't add requirement", description: caught instanceof Error ? caught.message : undefined });
          }
        }} /></div> : null}
        {needsLoading ? <LoadingRows rows={2} /> : needs.length === 0 ? <EmptyState icon={Users} title="No staffing requirements yet" description="Add each role and the number of volunteers needed to see where coverage is full or still has gaps." action={<Button size="sm" onClick={() => setShowAddNeed(true)}>Add first requirement</Button>} /> : (
          <ul className="divide-y divide-hairline">
            {needs.map((need) => <li key={need.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className={`grid size-9 place-items-center rounded-lg ${need.isFull ? "bg-success-tint text-success-text" : "bg-warning-tint text-warning-text"}`}>{need.isFull ? <CheckCircle2 className="size-4" /> : <Users className="size-4" />}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{need.role}</p><p className="text-xs text-muted-foreground">{days.length > 1 ? `Day ${need.dayNumber} · ` : ""}{need.startTime}–{need.endTime} · {need.notes ?? "No notes"}</p></div>
              <Pill tone={need.isFull ? "success" : "neutral"}>{need.filledCount}/{need.requiredCount} staffed{need.openCount ? ` · ${need.openCount} open` : " · Full"}</Pill>
              <Button variant="outline" size="sm" onClick={() => updateNeed.mutate({ eventId: event.id, id: need.id, patch: { signupOpen: !need.signupOpen } }, { onError: (caught) => toast({ title: "Couldn't update signup", description: caught.message }) })}>{need.signupOpen ? "Close signup" : "Open signup"}</Button>
            </li>)}
          </ul>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Volunteer shifts"
          description={`Keep responsibilities, contact details, time slots and event-day handoffs together. ${Math.round((totalMinutes / 60) * 10) / 10} total shift hours.`}
          actions={
            <div className="flex flex-wrap gap-2">
              {allowSpreadsheetImport ? <VolunteerCsvImportDialog event={event} existingShifts={data ?? []} /> : null}
              <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); }}>
                <Plus className="mr-1.5 size-3.5" />Add volunteer
              </Button>
            </div>
          }
        />
        <div className="border-b border-hairline p-4">
          {showAdd ? (
            <VolunteerEditor
              needs={needRows ?? []}
              days={days}
              submitLabel="Add shift"
              onCancel={() => setShowAdd(false)}
              onSubmit={async (draft) => {
                try {
                  await add.mutateAsync({ eventId: event.id, draft });
                  setShowAdd(false);
                  toast({ title: "Volunteer added", description: `${draft.name} is scheduled for ${draft.startTime}–${draft.endTime}.` });
                } catch (caught) {
                  toast({ title: "Couldn't add volunteer", description: caught instanceof Error ? caught.message : undefined });
                }
              }}
            />
          ) : (
            <label className="relative block max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search volunteer, role or notes" className="pl-9" />
            </label>
          )}
        </div>

        {isLoading ? <LoadingRows rows={4} /> : null}
        {!isLoading && rows.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No volunteers scheduled"
            description="Add the first volunteer with their role, time slot and briefing notes."
            action={<Button size="sm" onClick={() => setShowAdd(true)}>Add first volunteer</Button>}
          />
        ) : null}
        {!isLoading && rows.length > 0 && visible.length === 0 ? (
          <EmptyState icon={Search} title="No matching volunteers" description="Try another name, role or note." />
        ) : null}
        {visible.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {visible.map((volunteer) => (
              <li key={volunteer.id} className="px-4 py-4 sm:px-5">
                {editingId === volunteer.id ? (
                  <VolunteerEditor
                    needs={needRows ?? []}
                    days={days}
                    initial={volunteer}
                    submitLabel="Save changes"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (patch) => {
                      try {
                        await update.mutateAsync({ eventId: event.id, id: volunteer.id, patch });
                        setEditingId(null);
                        toast({ title: "Volunteer shift updated" });
                      } catch (caught) {
                        toast({ title: "Couldn't update volunteer", description: caught instanceof Error ? caught.message : undefined });
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{volunteer.name}</p>
                        <Pill tone={STATUS_TONE[volunteer.status]}>{STATUS_LABEL[volunteer.status]}</Pill>
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{volunteer.role}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />{days.length > 1 ? `Day ${volunteer.dayNumber} · ` : ""}{volunteer.startTime}–{volunteer.endTime} · {shiftLength(volunteer.startTime, volunteer.endTime)}
                        </span>
                        {volunteer.email ? <span>{volunteer.email}</span> : null}
                        {volunteer.email ? <span className="inline-flex items-center gap-1 text-info-text"><Mail className="size-3.5" />Email notification enabled</span> : null}
                        {volunteer.phone ? <span>{volunteer.phone}</span> : null}
                      </div>
                      {volunteer.notes ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{volunteer.notes}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Select
                        value={volunteer.status}
                        onValueChange={(value) => update.mutate(
                          { eventId: event.id, id: volunteer.id, patch: { status: value as VolunteerStatus } },
                          { onError: (caught) => toast({ title: "Couldn't update status", description: caught.message }) },
                        )}
                      >
                        <SelectTrigger className="w-[142px]" aria-label={`Status for ${volunteer.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VOLUNTEER_STATUSES.map((option) => <SelectItem key={option} value={option}>{STATUS_LABEL[option]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="icon" aria-label={`Edit ${volunteer.name}`} onClick={() => { setEditingId(volunteer.id); setShowAdd(false); }}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${volunteer.name}`} onClick={() => setDeleteTarget(volunteer)}><Trash2 className="size-4 text-danger-text" /></Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes their {deleteTarget?.role} shift from this event. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep shift</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deleteTarget) return;
              remove.mutate({ eventId: event.id, id: deleteTarget.id }, {
                onSuccess: () => { toast({ title: "Volunteer removed" }); setDeleteTarget(null); },
                onError: (caught) => toast({ title: "Couldn't remove volunteer", description: caught.message }),
              });
            }}>Remove shift</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
