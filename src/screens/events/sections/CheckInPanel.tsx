import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  CheckCircle2,
  CircleUserRound,
  DoorOpen,
  Laptop,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  UserCheck,
  UsersRound,
  Tablet,
  Wifi,
} from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { useSession } from "@/app/session";
import { eventTabHref } from "@/app/shell/nav";
import GuestCsvImportDialog from "./GuestCsvImportDialog";
import {
  connectBrotherQl800,
  printBrotherNameLabel,
  supportsBrotherWebUsb,
  type BrotherQl800Printer,
} from "./BrotherLabelPrinter";
import { CheckInPrintSheet, type CheckInPrintJob } from "./CheckInPrintSheet";
import { OnSiteRegistration } from "./OnSiteRegistration";
import {
  useAddChecklistItem,
  useAddCheckInStation,
  useCheckInStations,
  useChecklist,
  useEventRegistrations,
  useRemoveCheckInStation,
  useSetRegistrationCheckIn,
  useUpdateCheckInStation,
  useVolunteers,
} from "@/data/hooks";
import {
  type CheckInStation,
  type CheckInStationDraft,
  type Event,
  type RegistrationWithGuest,
  type VolunteerShift,
} from "@/data/entities";
import { ALPHABETICAL_CHECK_IN_LANES, guestMatchesLane, parseAlphabeticalLane } from "@/data/checkInLanes";

const CHECK_IN_STARTER = [
  ["Assign check-in stations and leads", "Name a lead and backup for every entrance or desk."],
  ["Prepare signs and guest-list lanes", "Plan alphabetical, VIP, walk-in and accessibility lanes."],
  ["Test devices, scanners and internet", "Charge equipment and document the offline fallback."],
  ["Confirm the walk-in and plus-one policy", "Give desk staff one clear approval and badge process."],
  ["Brief accessibility and escalation support", "Document who can resolve access, safety and guest-list issues."],
  ["Print the emergency contact sheet", "Include venue, security, medical and event-lead contacts at each station."],
] as const;

function StationEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  volunteers,
}: {
  initial?: CheckInStation;
  volunteers: VolunteerShift[];
  submitLabel: string;
  onSubmit: (draft: CheckInStationDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [lane, setLane] = useState(initial?.lane ?? "");
  const [leadVolunteerId, setLeadVolunteerId] = useState(initial?.leadVolunteerId ?? (initial?.lead ? "legacy" : "unassigned"));
  const [deviceCount, setDeviceCount] = useState(String(initial?.deviceCount ?? 1));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const valid = name.trim() && lane.trim() && Number.isFinite(Number(deviceCount)) && Number(deviceCount) >= 0;

  return (
    <form
      className="grid gap-3 border-b border-hairline bg-surface-sunken/40 p-4 md:grid-cols-2 xl:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        setSaving(true);
        const selectedVolunteer = volunteers.find((volunteer) => volunteer.id === leadVolunteerId);
        const legacyLead = leadVolunteerId === "legacy" ? initial?.lead ?? null : null;
        void onSubmit({
          name: name.trim(),
          lane: lane.trim(),
          ...(legacyLead
            ? { lead: legacyLead }
            : { leadVolunteerId: selectedVolunteer?.id ?? null, lead: selectedVolunteer?.name ?? null }),
          deviceCount: Math.max(0, Math.trunc(Number(deviceCount))),
          notes: notes.trim() || null,
        }).finally(() => setSaving(false));
      }}
    >
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Station name
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="East entrance" maxLength={80} required />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Guest lane
        <Input value={lane} onChange={(event) => setLane(event.target.value)} placeholder="Last names A-M, VIPs…" maxLength={120} required />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Assigned volunteer
        <Select value={leadVolunteerId} onValueChange={setLeadVolunteerId}>
          <SelectTrigger><SelectValue placeholder="Choose a volunteer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">No volunteer assigned</SelectItem>
            {initial?.lead && !initial.leadVolunteerId ? <SelectItem value="legacy">{initial.lead} · Previously entered</SelectItem> : null}
            {volunteers.filter((volunteer) => volunteer.status !== "cancelled").map((volunteer) => (
              <SelectItem key={volunteer.id} value={volunteer.id}>{volunteer.name} · {volunteer.role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Devices
        <Input type="number" min={0} max={50} value={deviceCount} onChange={(event) => setDeviceCount(event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Station notes
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Badge stock, accessibility or escalation notes" className="min-h-9" maxLength={500} />
      </label>
      <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

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
  const { data: stations, isLoading: stationsLoading } = useCheckInStations(event.id);
  const { data: volunteers } = useVolunteers(event.id);
  const update = useSetRegistrationCheckIn();
  const addChecklist = useAddChecklistItem();
  const addStation = useAddCheckInStation();
  const updateStation = useUpdateCheckInStation();
  const removeStation = useRemoveCheckInStation();
  const { date: formatDate, timeZoneLabel } = usePreferences();
  const { user } = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "confirmed" | "waiting" | "arrived" | "pending">("all");
  const [station, setStation] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showStationForm, setShowStationForm] = useState(false);
  const [editingStation, setEditingStation] = useState<CheckInStation | null>(null);
  const [deleteStation, setDeleteStation] = useState<CheckInStation | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [printJob, setPrintJob] = useState<CheckInPrintJob | null>(null);
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [settingUpCounters, setSettingUpCounters] = useState(false);
  const [testBadgeName, setTestBadgeName] = useState(user?.name ?? "");
  const [brotherPrinterState, setBrotherPrinterState] = useState<"idle" | "connecting" | "connected" | "printing">("idle");
  const brotherPrinterRef = useRef<BrotherQl800Printer | null>(null);
  const stationRows = useMemo(() => stations ?? [], [stations]);

  const rows = useMemo(
    () => (data ?? [])
      .filter((row) => row.status !== "cancelled")
      .sort((a, b) => (a.guest?.name ?? "").localeCompare(b.guest?.name ?? "")),
    [data],
  );
  const confirmedRows = rows.filter((row) => row.status === "confirmed");
  const expected = confirmedRows.reduce((total, row) => total + row.quantity, 0);
  const arrived = confirmedRows
    .filter((row) => row.checkedInAt !== null)
    .reduce((total, row) => total + row.quantity, 0);
  const pending = rows
    .filter((row) => row.status === "pending")
    .reduce((total, row) => total + row.quantity, 0);
  const remaining = expected - arrived;
  const eventFinished = event.status === "completed" || Boolean(event.endDate && new Date(event.endDate).getTime() < Date.now());
  const activeStation = stationRows.find((planned) => planned.name === station);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeStation && parseAlphabeticalLane(activeStation.lane) && !guestMatchesLane(row.guest?.name ?? "", activeStation.lane)) return false;
      if (filter === "confirmed" && row.status !== "confirmed") return false;
      if (filter === "waiting" && (row.status !== "confirmed" || row.checkedInAt)) return false;
      if (filter === "arrived" && !row.checkedInAt) return false;
      if (filter === "pending" && row.status !== "pending") return false;
      if (!needle) return true;
      return [row.guest?.name, row.guest?.contact, row.segment, row.organization, row.checkInStation]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [activeStation, filter, rows, search]);

  // A 900-person event should search instantly without mounting 900 interactive rows.
  useEffect(() => setVisibleLimit(50), [filter, search, station]);
  useEffect(() => {
    if (!station && stationRows[0]) setStation(stationRows[0].name);
  }, [station, stationRows]);
  useEffect(() => {
    if (!printJob) return;
    const frame = window.requestAnimationFrame(() => {
      window.print();
      setPrintJob(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printJob]);
  useEffect(() => () => {
    const printer = brotherPrinterRef.current;
    brotherPrinterRef.current = null;
    if (printer) void printer.close();
  }, []);
  const displayed = visible.slice(0, visibleLimit);

  const existingTasks = new Set((checklist ?? []).map((item) => item.title.trim().toLowerCase()));
  const missingTasks = CHECK_IN_STARTER.filter(([title]) => !existingTasks.has(title.toLowerCase()));
  const alphabeticStations = ALPHABETICAL_CHECK_IN_LANES.flatMap((lane) => stationRows.filter((planned) => {
    const range = parseAlphabeticalLane(planned.lane);
    return range?.start === lane.start && range.end === lane.end;
  }));
  const alphabeticStationCount = alphabeticStations.length;
  const alphabeticAssignedCount = alphabeticStations.filter((planned) => planned.leadVolunteerId).length;
  const alphabeticCountersReady = alphabeticStationCount === 6 && alphabeticAssignedCount === 6;

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
      return true;
    } catch (caught) {
      toast({ title: "Couldn't update check-in", description: caught instanceof Error ? caught.message : undefined });
      return false;
    }
  };

  const printBadge = async (row: RegistrationWithGuest) => {
    if (row.checkedInAt) {
      setPrintJob({ kind: "badge", row });
      return;
    }
    const saved = await saveCheckIn(row, new Date().toISOString(), { station: station.trim() || null });
    if (saved) setPrintJob({ kind: "badge", row });
  };

  const brotherErrorMessage = (caught: unknown): string => {
    if (caught instanceof DOMException && caught.name === "NotFoundError") return "No printer was selected. Choose Brother QL-800 and try again.";
    if (caught instanceof DOMException && caught.name === "NetworkError") return "The Brother printer is busy. Turn it off and on once, then reconnect.";
    return caught instanceof Error ? caught.message : "The Brother printer could not be reached.";
  };

  const printNameDirectly = async (name: string, allowConnectionPrompt = true) => {
    try {
      let printer = brotherPrinterRef.current;
      if (!printer?.connected) {
        if (!allowConnectionPrompt) {
          toast({ title: "Connect the Brother printer first", description: "Open iPad & printer setup, then choose Connect & print one label." });
          return;
        }
        setBrotherPrinterState("connecting");
        printer = await connectBrotherQl800();
        brotherPrinterRef.current = printer;
      }
      setBrotherPrinterState("printing");
      await printBrotherNameLabel(printer, name);
      setBrotherPrinterState("connected");
      toast({ title: "Badge sent to Brother QL-800", description: `${name.trim()} is centered on one label.` });
    } catch (caught) {
      const printer = brotherPrinterRef.current;
      brotherPrinterRef.current = null;
      if (printer) void printer.close();
      setBrotherPrinterState("idle");
      toast({ title: "Badge did not print", description: brotherErrorMessage(caught), variant: "destructive" });
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

  const setUpAlphabeticalCounters = async () => {
    if (settingUpCounters) return;
    setSettingUpCounters(true);
    try {
      const activeVolunteers = (volunteers ?? [])
        .filter((volunteer) => volunteer.status !== "cancelled" && Boolean(volunteer.email))
        .sort((a, b) => {
          const score = (volunteer: VolunteerShift) => /check.?in|registration|welcome|front.?door/i.test(volunteer.role) ? 0 : 1;
          return score(a) - score(b) || a.sortOrder - b.sortOrder;
        });
      const uniqueVolunteers = activeVolunteers.filter((volunteer, index, list) =>
        list.findIndex((candidate) => candidate.email?.toLowerCase() === volunteer.email?.toLowerCase()) === index);
      const usedVolunteerIds = new Set(stationRows.flatMap((planned) => planned.leadVolunteerId ? [planned.leadVolunteerId] : []));
      let created = 0;
      let newlyAssigned = 0;

      for (const lane of ALPHABETICAL_CHECK_IN_LANES) {
        const existing = stationRows.find((planned) => {
          const range = parseAlphabeticalLane(planned.lane);
          return range?.start === lane.start && range.end === lane.end;
        });
        const volunteer = uniqueVolunteers.find((candidate) => !usedVolunteerIds.has(candidate.id));
        if (existing) {
          if (!existing.leadVolunteerId && volunteer) {
            await updateStation.mutateAsync({
              eventId: event.id,
              id: existing.id,
              patch: { leadVolunteerId: volunteer.id, lead: volunteer.name },
            });
            usedVolunteerIds.add(volunteer.id);
            newlyAssigned += 1;
          }
          continue;
        }
        await addStation.mutateAsync({
          eventId: event.id,
          draft: {
            name: lane.stationName,
            lane: lane.label,
            leadVolunteerId: volunteer?.id ?? null,
            lead: volunteer?.name ?? null,
            deviceCount: 1,
            notes: "Private volunteer counter for badge printing and guest check-in.",
            sortOrder: lane.counter,
          },
        });
        if (volunteer) {
          usedVolunteerIds.add(volunteer.id);
          newlyAssigned += 1;
        }
        created += 1;
      }
      const existingAlphabeticAssigned = stationRows.filter((planned) => planned.leadVolunteerId && parseAlphabeticalLane(planned.lane)).length;
      const totalAssigned = existingAlphabeticAssigned + newlyAssigned;
      toast({
        title: totalAssigned === 6 ? "Six alphabetical counters are ready" : "Six alphabetical counters are set up",
        description: `${created} counter${created === 1 ? "" : "s"} created. ${Math.min(6, totalAssigned)} of 6 have a volunteer with private check-in access.`,
      });
    } catch (caught) {
      toast({ title: "Couldn't finish counter setup", description: caught instanceof Error ? caught.message : undefined, variant: "destructive" });
    } finally {
      setSettingUpCounters(false);
    }
  };

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Expected" value={expected} icon={UsersRound} sublabel={`${pending} awaiting RSVP`} loading={isLoading} />
        <StatTile label="Checked in" value={arrived} icon={UserCheck} tone="success" loading={isLoading} />
        <StatTile label={eventFinished ? "No-shows" : "Still expected"} value={remaining} icon={DoorOpen} tone={remaining > 0 ? "warning" : "success"} loading={isLoading} />
        <StatTile label="Arrival rate" value={expected ? `${Math.round((arrived / expected) * 100)}%` : "0%"} loading={isLoading} />
      </div>

      <Panel className="overflow-hidden border-l-4 border-l-primary">
        <PanelHeader
          title="Event-day desk"
          description="Bring in HubSpot or Google Sheets guest lists, register walk-ins, and print what the door team needs."
          actions={
            <div className="flex flex-wrap gap-2">
              <GuestCsvImportDialog event={event} triggerLabel="Import HubSpot / Sheets CSV" registrationStatus="confirmed" />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPrinterSetup(true)}>
                <Tablet className="mr-1.5 size-3.5" aria-hidden="true" />iPad & printer setup
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPrintJob({ kind: "guest-list" })} disabled={rows.length === 0}>
                <Printer className="mr-1.5 size-3.5" aria-hidden="true" />Print guest list
              </Button>
            </div>
          }
        />
        <OnSiteRegistration
          event={event}
          station={station}
          onRegistered={(row, printBadge) => {
            if (printBadge) void printNameDirectly(row.guest?.name ?? "Guest", false);
          }}
        />
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Front-door plan"
          description="Save each entrance or lane, who leads it, and the equipment it needs."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void setUpAlphabeticalCounters()} disabled={settingUpCounters || alphabeticCountersReady}>
                <UsersRound className="mr-1.5 size-3.5" />
                {settingUpCounters ? "Setting up…" : alphabeticCountersReady ? "6 counters ready" : alphabeticStationCount === 6 ? "Assign volunteers to counters" : "Set up 6 counters"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowStationForm(true); setEditingStation(null); }}>
                <Plus className="mr-1.5 size-3.5" />Add station
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={eventTabHref(event.id, "checklist")}>Open checklist</Link>
              </Button>
              <Button size="sm" onClick={() => void addStarter()} disabled={missingTasks.length === 0 || addChecklist.isPending}>
                {missingTasks.length === 0 ? "Setup added" : `Add ${missingTasks.length} setup tasks`}
              </Button>
            </div>
          }
        />
        {showStationForm || editingStation ? (
          <StationEditor
            key={editingStation?.id ?? "new-station"}
            initial={editingStation ?? undefined}
            volunteers={volunteers ?? []}
            submitLabel={editingStation ? "Save station" : "Add station"}
            onCancel={() => { setShowStationForm(false); setEditingStation(null); }}
            onSubmit={async (draft) => {
              try {
                if (editingStation) {
                  const previousName = editingStation.name;
                  await updateStation.mutateAsync({ eventId: event.id, id: editingStation.id, patch: draft });
                  if (station === previousName) setStation(draft.name);
                  toast({ title: "Station updated" });
                } else {
                  const created = await addStation.mutateAsync({ eventId: event.id, draft });
                  setStation(created.name);
                  toast({ title: "Station added", description: `${created.name} is ready for the event-day team.` });
                }
                setShowStationForm(false);
                setEditingStation(null);
              } catch (caught) {
                toast({ title: "Couldn't save station", description: caught instanceof Error ? caught.message : undefined });
              }
            }}
          />
        ) : null}
        {stationsLoading ? <LoadingRows rows={2} /> : null}
        {!stationsLoading && stationRows.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No check-in stations planned"
            description="For a large guest list, split the front door into named lanes and give each one a lead."
            action={<Button size="sm" onClick={() => setShowStationForm(true)}>Plan the first station</Button>}
            className="border-b border-hairline"
          />
        ) : null}
        {stationRows.length > 0 ? (
          <ul className="grid gap-3 border-b border-hairline p-4 md:grid-cols-2 xl:grid-cols-3">
            {stationRows.map((planned) => {
              const stationArrivals = rows
                .filter((row) => row.checkedInAt && row.checkInStation === planned.name)
                .reduce((total, row) => total + row.quantity, 0);
              const assignedGuests = parseAlphabeticalLane(planned.lane)
                ? rows.filter((row) => guestMatchesLane(row.guest?.name ?? "", planned.lane)).length
                : null;
              const linkedVolunteer = volunteers?.find((volunteer) => volunteer.id === planned.leadVolunteerId);
              return (
                <li key={planned.id} className="rounded-lg border border-hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{planned.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{planned.lane}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {assignedGuests !== null ? <Pill tone="brand">{assignedGuests} assigned</Pill> : null}
                      <Pill tone={stationArrivals ? "success" : "neutral"}>{stationArrivals} arrived</Pill>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Lead: {linkedVolunteer?.name ?? (planned.leadVolunteerId ? "Volunteer no longer assigned" : planned.lead ?? "Unassigned")}</span>
                    <span className="inline-flex items-center gap-1">
                      <Laptop className="size-3.5" />{planned.deviceCount} device{planned.deviceCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className={cn("mt-2 text-xs font-medium", linkedVolunteer?.email ? "text-success-text" : "text-warning-text")}>
                    {linkedVolunteer?.email
                      ? `Private check-in access enabled for ${linkedVolunteer.email}`
                      : planned.leadVolunteerId
                        ? "Add an email to this volunteer to enable private access"
                        : "Assign one volunteer with an email to enable private access"}
                  </p>
                  {planned.notes ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{planned.notes}</p> : null}
                  <div className="mt-3 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingStation(planned); setShowStationForm(false); }}>
                      <Pencil className="mr-1.5 size-3.5" />Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteStation(planned)}>
                      <Trash2 className="mr-1.5 size-3.5 text-danger-text" />Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="px-4 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup checklist</p>
          <p className="mt-1 text-xs text-muted-foreground">Add these as owned, editable tasks in the event checklist.</p>
        </div>
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
              <Link href={eventTabHref(event.id, "registrations")}>Manage registrations</Link>
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
                <SelectItem value="all">All imported guests</SelectItem>
                <SelectItem value="confirmed">Confirmed list</SelectItem>
                <SelectItem value="waiting">{eventFinished ? "No-shows" : "Still expected"}</SelectItem>
                <SelectItem value="arrived">Checked in</SelectItem>
                <SelectItem value="pending">Awaiting RSVP</SelectItem>
              </SelectContent>
            </Select>
            {stationRows.length > 0 ? (
              <Select value={station} onValueChange={setStation}>
                <SelectTrigger className="w-[210px]" aria-label="Active check-in station"><SelectValue placeholder="Choose station" /></SelectTrigger>
                <SelectContent>
                  {stationRows.map((planned) => <SelectItem key={planned.id} value={planned.name}>{planned.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={station} onChange={(event) => setStation(event.target.value)} placeholder="Active station" aria-label="Active check-in station" className="w-[180px]" maxLength={80} />
            )}
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
                      {row.quantity > 1 ? <Pill tone="neutral">{row.quantity} people</Pill> : null}
                      {row.segment ? <Pill>{row.segment}</Pill> : null}
                      {row.checkedInAt ? (
                        <Pill tone="success">Checked in</Pill>
                      ) : row.status === "pending" ? (
                        <Pill tone="neutral">Awaiting RSVP</Pill>
                      ) : (
                        <Pill tone="warning">{eventFinished ? "No-show" : "Expected"}</Pill>
                      )}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => void printBadge(row)} disabled={update.isPending}>
                      <Printer className="mr-1.5 size-3.5" />{row.checkedInAt ? "Reprint badge" : "Print badge & check in"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(editingId === row.id ? null : row.id)}>
                      <Pencil className="mr-1.5 size-3.5" />Details
                    </Button>
                    {row.checkedInAt ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void saveCheckIn(row, null)} disabled={update.isPending}>Undo</Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => void saveCheckIn(row, new Date().toISOString(), { station: station.trim() || null })} disabled={update.isPending}>
                        <UserCheck className="mr-1.5 size-3.5" />{row.status === "pending" ? "Confirm & check in" : "Check in"}
                      </Button>
                    )}
                  </div>
                </div>
                {editingId === row.id ? (
                  <CheckInDetails
                    row={row}
                    onClose={() => setEditingId(null)}
                    onSave={async (nextStation, notes) => { await saveCheckIn(row, row.checkedInAt, { station: nextStation, notes }); }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {visible.length > displayed.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
            <p className="text-xs text-muted-foreground">Showing {displayed.length} of {visible.length} registration rows</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setVisibleLimit((current) => current + 50)}>
              Load 50 more
            </Button>
          </div>
        ) : null}
      </Panel>
      <AlertDialog open={deleteStation !== null} onOpenChange={(open) => { if (!open) setDeleteStation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteStation?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing arrival records keep the station name, but this station will no longer be available for new check-ins.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep station</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteStation) return;
                removeStation.mutate(
                  { eventId: event.id, id: deleteStation.id },
                  {
                    onSuccess: () => {
                      if (station === deleteStation.name) setStation("");
                      setDeleteStation(null);
                      toast({ title: "Station removed" });
                    },
                    onError: (caught) => toast({ title: "Couldn't remove station", description: caught.message }),
                  },
                );
              }}
            >
              Remove station
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={showPrinterSetup} onOpenChange={setShowPrinterSetup}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test the Brother label printer</DialogTitle>
            <DialogDescription>Print one centered full name directly to the Brother QL-800. This bypasses the macOS print queue.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-muted text-xs font-bold">1</span><span>Keep the QL-800 connected by USB, powered on, and loaded with the DK-22251 roll.</span></li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-muted text-xs font-bold">2</span><span>Click Connect &amp; print, then choose Brother QL-800 in Chrome's USB window.</span></li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-muted text-xs font-bold">3</span><span>Beebizy will center the name, print one label, and cut it automatically.</span></li>
          </ol>
          <label className="space-y-1.5 text-sm font-medium text-foreground">
            Full name for the test label
            <Input
              value={testBadgeName}
              onChange={(inputEvent) => setTestBadgeName(inputEvent.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
          </label>
          <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-xs", brotherPrinterState === "connected" ? "border-success/30 bg-success-tint text-success-text" : "border-info/30 bg-info-tint text-info-text")}>
            <Wifi className="mt-0.5 size-4 shrink-0" />
            {brotherPrinterState === "connected"
              ? "Brother QL-800 is connected and ready for badge buttons on this page."
              : supportsBrotherWebUsb()
                ? "Chrome will ask for USB access the first time. Beebizy does not use the macOS print queue."
                : "Open Beebizy in Chrome or Edge to print directly to the Brother QL-800."}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!testBadgeName.trim() || brotherPrinterState === "connecting" || brotherPrinterState === "printing"}
              onClick={() => {
                setShowPrinterSetup(false);
                setPrintJob({ kind: "printer-test", name: testBadgeName.trim() });
              }}
            >
              Use system print
            </Button>
            <Button
              disabled={!testBadgeName.trim() || !supportsBrotherWebUsb() || brotherPrinterState === "connecting" || brotherPrinterState === "printing"}
              onClick={() => void printNameDirectly(testBadgeName.trim())}
            >
              <Printer className="mr-1.5 size-4" />
              {brotherPrinterState === "connecting" ? "Connecting…" : brotherPrinterState === "printing" ? "Printing…" : brotherPrinterState === "connected" ? "Print one label" : "Connect & print one label"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CheckInPrintSheet event={event} job={printJob} rows={rows} formatDate={formatDate} timeZoneLabel={timeZoneLabel} />
    </div>
  );
}
