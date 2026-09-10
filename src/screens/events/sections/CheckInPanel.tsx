import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CheckCircle2,
  CircleUserRound,
  DoorOpen,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { eventTabHref } from "@/app/shell/nav";
import {
  useAddChecklistItem,
  useChecklist,
  useEventRegistrations,
  useSetRegistrationCheckIn,
} from "@/data/hooks";
import {
  type Event,
  type RegistrationWithGuest,
} from "@/data/entities";

const CHECK_IN_STARTER = [
  ["Assign check-in stations and leads", "Name a lead and backup for every entrance or desk."],
  ["Prepare signs and guest-list lanes", "Plan alphabetical, VIP, walk-in and accessibility lanes."],
  ["Test devices, scanners and internet", "Charge equipment and document the offline fallback."],
  ["Confirm the walk-in and plus-one policy", "Give desk staff one clear approval and badge process."],
  ["Brief accessibility and escalation support", "Document who can resolve access, safety and guest-list issues."],
  ["Print the emergency contact sheet", "Include venue, security, medical and event-lead contacts at each station."],
] as const;

function CheckInDetails({
  row,
  onSave,
  onClose,
}: {
  row: RegistrationWithGuest;
  onSave: (station: string | null, notes: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [station, setStation] = useState(row.checkInStation ?? "");
  const [notes, setNotes] = useState(row.checkInNotes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border border-hairline bg-surface-sunken/50 p-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void onSave(station.trim() || null, notes.trim() || null).finally(() => setSaving(false));
      }}
    >
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Station or entrance
        <Input value={station} onChange={(event) => setStation(event.target.value)} placeholder="Main entrance" maxLength={80} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Arrival notes
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Badge reprint, accessibility support, plus-one…"
          className="min-h-9 resize-y"
          maxLength={500}
        />
      </label>
      <div className="flex gap-2 sm:justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

export function CheckInPanel({ event }: { event: Event }) {
  const { data, isLoading, isError, error, refetch } = useEventRegistrations(event.id);
  const { data: checklist } = useChecklist(event.id);
  const update = useSetRegistrationCheckIn();
  const addChecklist = useAddChecklistItem();
  const { date: formatDate, timeZoneLabel } = usePreferences();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"confirmed" | "waiting" | "arrived" | "pending">("confirmed");
  const [station, setStation] = useState("Main entrance");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(50);

  const rows = useMemo(
    () => (data ?? [])
      .filter((row) => row.status !== "cancelled")
      .sort((a, b) => (a.guest?.name ?? "").localeCompare(b.guest?.name ?? "")),
    [data],
  );
  const confirmedRows = rows.filter((row) => row.status === "confirmed");
  const arrived = confirmedRows.filter((row) => row.checkedInAt !== null).length;
  const remaining = confirmedRows.length - arrived;
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "confirmed" && row.status !== "confirmed") return false;
      if (filter === "waiting" && (row.status !== "confirmed" || row.checkedInAt)) return false;
      if (filter === "arrived" && !row.checkedInAt) return false;
      if (filter === "pending" && row.status !== "pending") return false;
      if (!needle) return true;
      return [row.guest?.name, row.guest?.contact, row.segment, row.organization, row.checkInStation]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [filter, rows, search]);

  // A 900-person event should search instantly without mounting 900 interactive rows.
  useEffect(() => setVisibleLimit(50), [filter, search]);
  const displayed = visible.slice(0, visibleLimit);

  const existingTasks = new Set((checklist ?? []).map((item) => item.title.trim().toLowerCase()));
  const missingTasks = CHECK_IN_STARTER.filter(([title]) => !existingTasks.has(title.toLowerCase()));

  const saveCheckIn = async (row: RegistrationWithGuest, checkedInAt: string | null, details?: { station?: string | null; notes?: string | null }) => {
    try {
      await update.mutateAsync({
        id: row.id,
        eventId: event.id,
        patch: {
          checkedInAt,
          ...(details?.station !== undefined ? { checkInStation: details.station } : {}),
          ...(details?.notes !== undefined ? { checkInNotes: details.notes } : {}),
        },
      });
      setEditingId(null);
    } catch (caught) {
      toast({ title: "Couldn't update check-in", description: caught instanceof Error ? caught.message : undefined });
    }
  };

  const addStarter = async () => {
    const results = await Promise.allSettled(
      missingTasks.map(([title, description], index) =>
        addChecklist.mutateAsync({
          eventId: event.id,
          draft: { title, description, category: "Check-in", sortOrder: (checklist?.length ?? 0) + index + 1 },
        }),
      ),
    );
    const added = results.filter((result) => result.status === "fulfilled").length;
    toast({
      title: added === missingTasks.length ? "Check-in setup added" : "Some setup tasks could not be added",
      description: `${added} editable task${added === 1 ? "" : "s"} added to the event checklist.`,
    });
  };

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Expected" value={confirmedRows.length} icon={UsersRound} sublabel={`${rows.length - confirmedRows.length} awaiting RSVP`} loading={isLoading} />
        <StatTile label="Checked in" value={arrived} icon={UserCheck} tone="success" loading={isLoading} />
        <StatTile label="Still expected" value={remaining} icon={DoorOpen} tone={remaining > 0 ? "warning" : "success"} loading={isLoading} />
        <StatTile label="Arrival rate" value={confirmedRows.length ? `${Math.round((arrived / confirmedRows.length) * 100)}%` : "0%"} loading={isLoading} />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Front-door setup"
          description="Turn the arrival plan into owned tasks before doors open. Every item remains editable in Checklist."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={eventTabHref(event.id, "checklist")}>Open checklist</Link>
              </Button>
              <Button size="sm" onClick={() => void addStarter()} disabled={missingTasks.length === 0 || addChecklist.isPending}>
                {missingTasks.length === 0 ? "Setup added" : `Add ${missingTasks.length} setup tasks`}
              </Button>
            </div>
          }
        />
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECK_IN_STARTER.map(([title], index) => {
            const added = existingTasks.has(title.toLowerCase());
            return (
              <div key={title} className="flex items-start gap-2 rounded-lg border border-hairline px-3 py-2.5 text-sm">
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold", added ? "bg-success-tint text-success-text" : "bg-primary-muted text-foreground")}>
                  {added ? <CheckCircle2 className="size-3.5" /> : index + 1}
                </span>
                <span className={cn(added && "text-muted-foreground")}>{title}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Guest arrivals"
          description={`Check-ins use the workspace time zone (${timeZoneLabel}). Cancelled registrations are excluded.`}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={eventTabHref(event.id, "registrations")}><Plus className="mr-1.5 size-3.5" />Add walk-in</Link>
            </Button>
          }
        />
        <div className="flex flex-col gap-3 border-b border-hairline p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, category or organization" className="pl-9" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
              <SelectTrigger className="w-[150px]" aria-label="Arrival filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed list</SelectItem>
                <SelectItem value="waiting">Still expected</SelectItem>
                <SelectItem value="arrived">Checked in</SelectItem>
                <SelectItem value="pending">Awaiting RSVP</SelectItem>
              </SelectContent>
            </Select>
            <Input value={station} onChange={(event) => setStation(event.target.value)} placeholder="Active station" aria-label="Active check-in station" className="w-[180px]" maxLength={80} />
          </div>
        </div>

        {isLoading ? <LoadingRows rows={5} /> : null}
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={CircleUserRound} title="No guests to check in yet" description="Add confirmed or pending registrations first, then return here for event day." action={<Button asChild size="sm"><Link href={eventTabHref(event.id, "registrations")}>Open registrations</Link></Button>} />
        ) : null}
        {!isLoading && rows.length > 0 && visible.length === 0 ? (
          <EmptyState icon={Search} title="No matching guests" description="Try another name or arrival filter." />
        ) : null}
        {displayed.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {displayed.map((row) => (
              <li key={row.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{row.guest?.name ?? "Deleted guest"}</p>
                      {row.segment ? <Pill>{row.segment}</Pill> : null}
                      {row.checkedInAt ? <Pill tone="success">Checked in</Pill> : <Pill tone="warning">Expected</Pill>}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[row.guest?.contact, row.organization].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                    {row.checkedInAt ? (
                      <p className="mt-1 text-xs text-success-text">
                        Arrived {formatDate(row.checkedInAt, "time")}{row.checkInStation ? ` at ${row.checkInStation}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(editingId === row.id ? null : row.id)}>
                      <Pencil className="mr-1.5 size-3.5" />Details
                    </Button>
                    {row.checkedInAt ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void saveCheckIn(row, null)} disabled={update.isPending}>Undo</Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => void saveCheckIn(row, new Date().toISOString(), { station: station.trim() || null })} disabled={update.isPending}>
                        <UserCheck className="mr-1.5 size-3.5" />Check in
                      </Button>
                    )}
                  </div>
                </div>
                {editingId === row.id ? (
                  <CheckInDetails
                    row={row}
                    onClose={() => setEditingId(null)}
                    onSave={(nextStation, notes) => saveCheckIn(row, row.checkedInAt, { station: nextStation, notes })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {visible.length > displayed.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
            <p className="text-xs text-muted-foreground">Showing {displayed.length} of {visible.length} guests</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setVisibleLimit((current) => current + 50)}>
              Load 50 more
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
