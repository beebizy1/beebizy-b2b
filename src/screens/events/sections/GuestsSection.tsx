/**
 * People: who is coming, and whether that fits.
 *
 * Capacity is enforced by the data layer, so adding the 25th guest to a 24-seat room
 * fails with a real message instead of silently over-filling the event — which is what
 * the old registration form did.
 */

import { useEffect, useMemo, useState } from "react";
import { spreadsheetHeaders, spreadsheetFieldKind, spreadsheetValue, type SpreadsheetFieldKind } from "@/data/registrationSpreadsheet";
import { Columns3, ContactRound, Copy, List, ListFilter, Mail, Pencil, RefreshCw, UserPlus, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import GuestCsvImportDialog from "./GuestCsvImportDialog";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  Meter,
  Panel,
  PanelHeader,
  RegistrationStatusBadge,
  StatTile,
} from "@/components/primitives";
import {
  useGuests,
  useHubSpotStatus,
  useImportGuestRegistrations,
  useCreateRegistration,
  useDeleteRegistration,
  useEventRegistrations,
  useSetRegistrationOrganization,
  useSetRegistrationSegment,
  useSetRegistrationStatus,
  useShareEvent,
  useSetHubSpotEventSync,
  useSyncHubSpotEvent,
  useUpdateRegistrationDetails,
} from "@/data/hooks";
import {
  REGISTRATION_SEGMENTS,
  REGISTRATION_STATUSES,
  type Event,
  type RegistrationStatus,
  type RegistrationDraft,
  type RegistrationWithGuest,
} from "@/data/entities";
import { registrationSegmentSummary } from "@/data/santaClara";
import { normalizeRegistrationPage } from "@/data/registrationPage";
import { registrationNameParts, registrationNameUpdate, staffRegistrationIdentity } from "@/data/registrationNames";
import { useRegistrationGuestDraft } from "@/hooks/useRegistrationGuestDraft";
import type { GuestDraftState, RegistrationGuestDraftRecovery } from "@/data/registrationGuestDraft";

/** No category is a real choice in a Select, and "" is not a usable option value. */
const UNCATEGORISED = "__none__";

/**
 * Every category on offer: the suggested ones plus whatever this event already uses, so a
 * label someone typed once is a one-click choice from then on.
 */
function segmentOptions(rows: RegistrationWithGuest[]): string[] {
  const used = rows.map((row) => row.segment).filter((segment): segment is string => Boolean(segment));
  return [...new Set([...REGISTRATION_SEGMENTS, ...used])].sort((a, b) => a.localeCompare(b));
}

/** Organizations already on the event, offered back as suggestions so spelling stays consistent. */
function organizationOptions(rows: RegistrationWithGuest[]): string[] {
  const used = rows.map((row) => row.organization).filter((name): name is string => Boolean(name));
  return [...new Set(used)].sort((a, b) => a.localeCompare(b));
}

function registrationStatusFromSpreadsheet(value: string): RegistrationStatus {
  const normalised = value.trim().toLowerCase();
  if (["yes", "y", "confirmed", "attending", "accepted", "true"].includes(normalised)) return "confirmed";
  if (["no", "n", "cancelled", "canceled", "declined", "not attending", "false"].includes(normalised)) {
    return "cancelled";
  }
  return "pending";
}

function GuestDraftStatus({ state, recovery }: { state: GuestDraftState; recovery: RegistrationGuestDraftRecovery }) {
  return <div className="space-y-2 text-xs text-muted-foreground" role="status">
    {state.message ? <p>{state.message}</p> : null}
    {state.remote ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => recovery.resolve(true)}>Use saved draft</Button><Button type="button" size="sm" variant="outline" onClick={() => recovery.resolve(false)}>Keep this device's changes</Button></div> : null}
    {state.message.includes("failed") && !state.remote ? <Button type="button" size="sm" variant="outline" onClick={() => void recovery.flush()}>Retry saving draft</Button> : null}
  </div>;
}

function EditRegistrationDialog({
  row,
  headers,
  eventId,
  onClose,
}: {
  row: RegistrationWithGuest;
  headers: string[];
  eventId: string;
  onClose: () => void;
}) {
  const update = useUpdateRegistrationDetails();
  const parts = registrationNameParts(row);
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(eventId, `edit-${row.id}`, {
    ...Object.fromEntries(headers.map((header) => [header, spreadsheetValue(row, header)])),
    "First Name": parts.firstName, "Last Name": parts.lastName,
  });

  const valueForKind = (kind: SpreadsheetFieldKind, fallback: string) => {
    const header = headers.find((candidate) => spreadsheetFieldKind(candidate) === kind);
    return header ? draft[header] ?? "" : fallback;
  };

  const save = async () => {
    const submitted = { ...draft };
    const rawQuantity = valueForKind("quantity", String(row.quantity)).trim();
    const quantity = Number(rawQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) {
      toast({ title: "Attendee count must be between 1 and 10,000" });
      return;
    }

    try {
      const identity = registrationNameUpdate(row, draft["First Name"] ?? "", draft["Last Name"] ?? "", headers.map(label => ({ label, value: draft[label] ?? "" })));
      await update.mutateAsync({
        id: row.id,
        eventId,
        patch: {
          name: identity.name,
          contact: valueForKind("email", row.guest?.contact ?? "").trim().toLowerCase() || null,
          notes: valueForKind("notes", row.guest?.notes ?? "").trim() || null,
          status: registrationStatusFromSpreadsheet(
            valueForKind(
              "status",
              row.status === "confirmed" ? "Yes" : row.status === "cancelled" ? "No" : "Pending",
            ),
          ),
          segment: valueForKind("segment", row.segment ?? "").trim() || null,
          organization: valueForKind("organization", row.organization ?? "").trim() || null,
          quantity,
          importedFields: identity.importedFields,
        },
      });
      recovery.complete(submitted);
      toast({ title: "Registration updated" });
      onClose();
    } catch (error) {
      toast({ title: "Couldn't update registration", description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit registration</DialogTitle>
          <DialogDescription>
            Update the RSVP and every value from the imported spreadsheet. All changes save together.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={update.isPending} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="edit-guest-first-name">First name</Label><Input id="edit-guest-first-name" autoComplete="given-name" maxLength={120} value={draft["First Name"] ?? ""} onChange={e => setDraft(current => ({ ...current, "First Name": e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-guest-last-name">Last name</Label><Input id="edit-guest-last-name" autoComplete="family-name" maxLength={120} value={draft["Last Name"] ?? ""} onChange={e => setDraft(current => ({ ...current, "Last Name": e.target.value }))} /></div>
          {parts.inferred ? <p className="text-xs text-muted-foreground sm:col-span-2">This older registration stored one full name. Please check the first and last name split before saving.</p> : null}
          {headers.filter(header => !["name", "firstName", "lastName"].includes(spreadsheetFieldKind(header))).map((header) => {
            const kind = spreadsheetFieldKind(header);
            const fieldId = `registration-${row.id}-${header.replace(/[^a-z0-9]/gi, "-")}`;
            return (
              <div key={header} className={cn("space-y-1.5", kind === "notes" && "sm:col-span-2")}>
                <Label htmlFor={fieldId}>{header}</Label>
                {kind === "status" ? (
                  <Select
                    value={draft[header]?.trim() || "Pending"}
                    onValueChange={(value) => setDraft((current) => ({ ...current, [header]: value }))}
                  >
                    <SelectTrigger id={fieldId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {draft[header]?.trim() && !["Pending", "Yes", "No"].includes(draft[header] ?? "") ? (
                        <SelectItem value={draft[header]!}>{draft[header]}</SelectItem>
                      ) : null}
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : kind === "notes" ? (
                  <Textarea
                    id={fieldId}
                    value={draft[header] ?? ""}
                    onChange={(inputEvent) => setDraft((current) => ({ ...current, [header]: inputEvent.target.value }))}
                  />
                ) : (
                  <Input
                    id={fieldId}
                    type={kind === "email" ? "email" : kind === "quantity" ? "number" : "text"}
                    min={kind === "quantity" ? 1 : undefined}
                    max={kind === "quantity" ? 10_000 : undefined}
                    value={draft[header] ?? ""}
                    onChange={(inputEvent) => setDraft((current) => ({ ...current, [header]: inputEvent.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
        <GuestDraftStatus state={state} recovery={recovery} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { recovery.complete(draft); onClose(); }} disabled={update.isPending}>Discard changes</Button>
          <Button type="button" onClick={() => void save()} disabled={update.isPending || Boolean(state.remote)}>
            {update.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpreadsheetRegistrationTable({
  rows,
  sourceRows,
  onEdit,
}: {
  rows: RegistrationWithGuest[];
  sourceRows: RegistrationWithGuest[];
  onEdit: (row: RegistrationWithGuest) => void;
}) {
  const headers = spreadsheetHeaders(sourceRows);
  return (
    <div>
      <div className="border-b border-hairline bg-surface-sunken/40 px-5 py-2 text-xs text-muted-foreground">
        Spreadsheet view keeps the original headers and values. Use Edit to change any value.
      </div>
      <div className="max-h-[38rem] overflow-auto">
        <Table className="min-w-max">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {headers.map((header, index) => (
                <TableHead
                  key={header}
                  className={cn("whitespace-nowrap", index === 0 && "sticky left-0 z-20 min-w-44 bg-background")}
                >
                  {header}
                </TableHead>
              ))}
              <TableHead className="sticky right-0 z-20 bg-background text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {headers.map((header, index) => {
                  const value = spreadsheetValue(row, header);
                  return (
                    <TableCell
                      key={header}
                      title={value || undefined}
                      className={cn(
                        "max-w-80 whitespace-nowrap",
                        index === 0 && "sticky left-0 z-[1] bg-background font-medium",
                        header.toLowerCase() === "notes" && "max-w-[30rem] truncate",
                      )}
                    >
                      {value || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  );
                })}
                <TableCell className="sticky right-0 z-[1] bg-background text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(row)}>
                    <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Put someone on the guest list.
 *
 * Two ways in, because the address book starts empty. "New person" creates the guest and
 * registers them in one step — the previous form could only pick an existing guest, so on
 * a fresh workspace the only control on the page was a dropdown with nothing in it and no
 * hint that Attendees was where you had to go first.
 */
function AddGuest({ event }: { event: Event }) {
  const { data: guests } = useGuests();
  const { data: registrations } = useEventRegistrations(event.id);
  const createRegistration = useCreateRegistration();
  const importGuests = useImportGuestRegistrations();
  const { draft, setDraft, state, recovery } = useRegistrationGuestDraft(event.id, "add-guest", {
    mode: "new", guestId: "", firstName: "", lastName: "", contact: "", status: "pending", segment: "", organization: "",
  });
  const mode = draft.mode === "existing" ? "existing" : "new";
  const status = draft.status === "confirmed" ? "confirmed" : "pending";
  const { guestId = "", firstName = "", lastName = "", contact = "", segment = "", organization = "" } = draft;
  const field = (key: string, value: string) => setDraft(current => ({ ...current, [key]: value }));

  // Anyone already registered (and not cancelled) shouldn't appear as an option.
  const available = useMemo(() => {
    const taken = new Set((registrations ?? []).filter((r) => r.status !== "cancelled").map((r) => r.guestId));
    return (guests ?? []).filter((guest) => !taken.has(guest.id));
  }, [guests, registrations]);

  const atCapacity = event.capacity !== null && event.registrationCount >= event.capacity;
  const pending = createRegistration.isPending || importGuests.isPending;
  const canSubmit = (mode === "new" ? firstName.trim().length > 0 : guestId !== "") && !state.remote;

  const submit = async () => {
    const submitted = { ...draft };
    try {
      const registration: Pick<RegistrationDraft, "eventId" | "status" | "segment" | "organization"> = { eventId: event.id, status, segment: segment.trim() || null, organization: organization.trim() || null };
      if (mode === "existing") {
        if (!available.some(guest => guest.id === guestId)) throw new Error("Choose an available guest from the address book.");
        await createRegistration.mutateAsync({ ...registration, guestId });
      } else {
        const identity = staffRegistrationIdentity(firstName, lastName);
        // The existing import endpoint saves the person and registration atomically.
        await importGuests.mutateAsync([{ ...registration, name: identity.name, contact: contact.trim() || null, importedFields: identity.fields }]);
      }
      recovery.complete(submitted, { ...submitted, guestId: "", firstName: "", lastName: "", contact: "" });
      toast({ title: status === "pending" ? "Invitation added to the list" : "Guest registered" });
      // The category deliberately survives: guest lists are entered in runs of the same
      // kind, so clearing it would mean retyping "Sponsor" twelve times.

    } catch (error) {
      toast({
        title: "Couldn't add them to the list",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <form
      className="space-y-2 border-b border-hairline px-5 py-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <fieldset disabled={pending} className="space-y-2">
      <div className="flex gap-1">
        {(["new", "existing"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => field("mode", option)}
            aria-pressed={mode === option}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === option ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "new" ? "New person" : `From address book${available.length ? ` (${available.length})` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {mode === "new" ? (
          <>
            <Input
              value={firstName}
              onChange={(inputEvent) => field("firstName", inputEvent.target.value)}
              placeholder="First name"
              aria-label="Guest first name"
              autoComplete="given-name"
              maxLength={120}
              className="min-w-[10rem] flex-1"
            />
            <Input value={lastName} onChange={e => field("lastName", e.target.value)} placeholder="Last name" aria-label="Guest last name" autoComplete="family-name" maxLength={120} className="min-w-[10rem] flex-1" />
            <Input
              type="email"
              value={contact}
              onChange={(inputEvent) => field("contact", inputEvent.target.value)}
              placeholder="Email (optional)"
              aria-label="Guest email"
              className="min-w-[10rem] flex-1"
            />
          </>
        ) : (
          <Select value={guestId} onValueChange={value => field("guestId", value)} disabled={available.length === 0}>
            <SelectTrigger className="min-w-[14rem] flex-1" aria-label="Choose someone to invite">
              <SelectValue
                placeholder={available.length === 0 ? "Nobody left in the address book" : "Choose a guest…"}
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((guest) => (
                <SelectItem key={guest.id} value={guest.id}>
                  {guest.name} · {guest.contact}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          value={segment}
          onChange={(inputEvent) => field("segment", inputEvent.target.value)}
          placeholder="Category"
          aria-label="Guest category"
          list="guest-segment-suggestions"
          className="w-[150px]"
        />
        <datalist id="guest-segment-suggestions">
          {segmentOptions(registrations ?? []).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <Input
          value={organization}
          onChange={(inputEvent) => field("organization", inputEvent.target.value)}
          placeholder="Organization"
          aria-label="Guest organization"
          list="guest-organization-suggestions"
          className="w-[170px]"
        />
        <datalist id="guest-organization-suggestions">
          {organizationOptions(registrations ?? []).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <Select value={status} onValueChange={(value) => field("status", value)}>
          <SelectTrigger className="w-[178px]" aria-label="Invitation status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Awaiting RSVP</SelectItem>
            <SelectItem value="confirmed">Add as confirmed</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" size="sm" disabled={!canSubmit || pending}>
          <UserPlus className="mr-1.5 size-3.5" />
          {status === "pending" ? "Add invitation" : "Register"}
        </Button>
      </div>
      </fieldset>
      <GuestDraftStatus state={state} recovery={recovery} />
      {!state.discarded && !pending ? <Button type="button" size="sm" variant="ghost" onClick={() => recovery.complete(draft)}>Discard guest draft</Button> : null}

      {atCapacity ? (
        <p className="text-xs text-warning-text">
          This event is at capacity. Raise the capacity in Edit before adding more.
        </p>
      ) : null}
    </form>
  );
}

/**
 * A row's organization, edited in place.
 *
 * Free text with too many possible values for a picker, so it is a plain field that
 * saves when it loses focus — typing in it must not fire a request per keystroke.
 */
function OrganizationCell({
  row,
  eventId,
  options,
}: {
  row: RegistrationWithGuest;
  eventId: string;
  options: string[];
}) {
  const setOrganization = useSetRegistrationOrganization();
  const [draft, setDraft] = useState(row.organization ?? "");

  // The stored value wins when it changes underneath us — another edit, or a refetch.
  useEffect(() => setDraft(row.organization ?? ""), [row.organization]);

  const commit = () => {
    const next = draft.trim() || null;
    if (next === (row.organization ?? null)) return;
    setOrganization.mutate(
      { id: row.id, eventId, organization: next },
      {
        onError: (error) => {
          setDraft(row.organization ?? "");
          toast({ title: "Couldn't change organization", description: error.message });
        },
      },
    );
  };

  return (
    <>
      <Input
        value={draft}
        onChange={(inputEvent) => setDraft(inputEvent.target.value)}
        onBlur={commit}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter") keyEvent.currentTarget.blur();
          if (keyEvent.key === "Escape") setDraft(row.organization ?? "");
        }}
        placeholder="Organization"
        aria-label={`Organization for ${row.guest?.name ?? "guest"}`}
        list="guest-organization-suggestions"
        className="h-8 w-[150px]"
      />
      <datalist id="guest-organization-suggestions">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

export default function GuestsSection({ event }: { event: Event }) {
  const { data: registrations, isLoading, isError, error, refetch } = useEventRegistrations(event.id);
  const setStatus = useSetRegistrationStatus();
  const setSegment = useSetRegistrationSegment();
  const removeRegistration = useDeleteRegistration();
  const share = useShareEvent();
  const hubspot = useHubSpotStatus();
  const setHubSpotSync = useSetHubSpotEventSync();
  const syncHubSpot = useSyncHubSpotEvent();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"manage" | "spreadsheet">("spreadsheet");
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const [organizationFilter, setOrganizationFilter] = useState<string | null>(null);
  const [editingRegistration, setEditingRegistration] = useState<RegistrationWithGuest | null>(null);

  const counts = useMemo(() => {
    const rows = registrations ?? [];
    const peopleWithStatus = (status: RegistrationStatus) => rows
      .filter((row) => row.status === status)
      .reduce((total, row) => total + row.quantity, 0);
    return {
      confirmed: peopleWithStatus("confirmed"),
      pending: peopleWithStatus("pending"),
      cancelled: peopleWithStatus("cancelled"),
    };
  }, [registrations]);

  /**
   * How the list breaks down, cancellations excluded — a cancelled sponsor is not a
   * sponsor you are catering for, and counting them would overstate every segment.
   */
  const segments = useMemo(() => {
    const active = (registrations ?? []).filter((row) => row.status !== "cancelled");
    const summary = registrationSegmentSummary(active);
    const uncategorised = active
      .filter((row) => !row.segment?.trim())
      .reduce((total, row) => total + row.quantity, 0);
    return uncategorised ? [...summary, [UNCATEGORISED, uncategorised] as [string, number]] : summary;
  }, [registrations]);

  const copyRegistrationLink = async (segment: string) => {
    try {
      const token = event.shareToken ?? (await share.mutateAsync({ id: event.id })).shareToken;
      await navigator.clipboard.writeText(`${window.location.origin}/e/${token}/register/${encodeURIComponent(segment)}`);
      toast({ title: `${segment} registration link copied` });
    } catch (caught) {
      toast({ title: "Couldn't copy registration link", description: caught instanceof Error ? caught.message : undefined });
    }
  };

  /**
   * Which organizations are represented — counted *within* the chosen segment, because the
   * question a university is answering is "how many investors, and from which funds",
   * not the two lists side by side.
   */
  const organizations = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of registrations ?? []) {
      if (row.status === "cancelled") continue;
      if (segmentFilter !== null && (row.segment ?? UNCATEGORISED) !== segmentFilter) continue;
      const key = row.organization ?? UNCATEGORISED;
      tally.set(key, (tally.get(key) ?? 0) + row.quantity);
    }
    return [...tally.entries()].sort(([a, countA], [b, countB]) =>
      a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : countB - countA || a.localeCompare(b),
    );
  }, [registrations, segmentFilter]);

  const options = useMemo(() => segmentOptions(registrations ?? []), [registrations]);
  const orgOptions = useMemo(() => organizationOptions(registrations ?? []), [registrations]);
  const headers = useMemo(() => spreadsheetHeaders(registrations ?? []), [registrations]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (registrations ?? []).filter((row) => {
      if (segmentFilter !== null && (row.segment ?? UNCATEGORISED) !== segmentFilter) return false;
      if (organizationFilter !== null && (row.organization ?? UNCATEGORISED) !== organizationFilter) return false;
      if (!needle) return true;
      return [
        row.guest?.name ?? "",
        row.guest?.contact ?? "",
        row.guest?.notes ?? "",
        row.segment ?? "",
        row.organization ?? "",
      ].some((field) => field.toLowerCase().includes(needle));
    });
  }, [registrations, search, segmentFilter, organizationFilter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Confirmed" value={counts.confirmed} tone="success" loading={isLoading} />
        <StatTile label="Pending" value={counts.pending} tone="warning" loading={isLoading} />
        <StatTile label="Cancelled" value={counts.cancelled} tone="neutral" loading={isLoading} />
        <StatTile
          label="Capacity"
          value={event.capacity ? `${event.registrationCount}/${event.capacity}` : event.registrationCount}
          sublabel={event.capacity ? undefined : "No capacity set"}
          tone={event.capacity !== null && event.registrationCount > event.capacity ? "danger" : "neutral"}
          loading={isLoading}
        />
      </div>

      <Panel>
        <PanelHeader
          title="HubSpot contact sync"
          description="Match guests by email and keep one registration activity updated for this event."
          actions={<ContactRound className="size-4 text-muted-foreground" aria-hidden="true" />}
        />
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {hubspot.data?.state === "connected" || hubspot.data?.state === "error" ? (
            <>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {event.hubspotSyncEnabled ? "Automatic sync is on" : "Automatic sync is off"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.hubspotSyncEnabled
                    ? "New registrations, edits, and check-ins update HubSpot automatically."
                    : "Nothing from this event is sent until you turn syncing on."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {event.hubspotSyncEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncHubSpot.isPending}
                    onClick={() => syncHubSpot.mutate(event.id, {
                      onSuccess: (result) => toast({ title: "HubSpot is up to date", description: `${result.synced} synced · ${result.skipped} skipped · ${result.failed} failed` }),
                      onError: (syncError) => toast({ title: "Couldn't sync HubSpot", description: syncError.message }),
                    })}
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${syncHubSpot.isPending ? "animate-spin" : ""}`} />
                    Sync now
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={event.hubspotSyncEnabled ? "outline" : "default"}
                  disabled={setHubSpotSync.isPending}
                  onClick={() => setHubSpotSync.mutate(
                    { eventId: event.id, enabled: !event.hubspotSyncEnabled },
                    {
                      onSuccess: (result) => toast({
                        title: result.event.hubspotSyncEnabled ? "HubSpot sync enabled" : "HubSpot sync paused",
                        description: result.event.hubspotSyncEnabled ? `${result.synced} contacts synced now.` : "Existing HubSpot contacts stay in HubSpot.",
                      }),
                      onError: (syncError) => toast({ title: "Couldn't change HubSpot sync", description: syncError.message }),
                    },
                  )}
                >
                  {setHubSpotSync.isPending ? "Saving…" : event.hubspotSyncEnabled ? "Pause sync" : "Enable HubSpot sync"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Connect the workspace's HubSpot portal before enabling event sync.</p>
              <Button asChild variant="outline" size="sm"><Link href="/app/settings">Open Settings</Link></Button>
            </>
          )}
        </div>
      </Panel>

      {event.capacity ? (
        <Panel className="p-5">
          <Meter
            label="Registrations against capacity"
            value={event.registrationCount}
            max={event.capacity}
            tone={
              event.registrationCount > event.capacity
                ? "danger"
                : event.registrationCount / event.capacity >= 0.85
                  ? "warning"
                  : "brand"
            }
            caption={`${event.registrationCount} of ${event.capacity} · ${Math.round((event.registrationCount / event.capacity) * 100)}%`}
          />
        </Panel>
      ) : null}

      <Panel className="p-4">
        <p className="text-sm font-semibold text-foreground">Registration links by guest type</p>
        <p className="mt-1 text-xs text-muted-foreground">Share a separate form for each audience. Every response lands here with the category already applied.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {normalizeRegistrationPage(event.registrationPage).registrationTypes.map((segment) => (
            <Button key={segment} variant="outline" size="sm" disabled={share.isPending} onClick={() => void copyRegistrationLink(segment)}>
              <Copy className="mr-1.5 size-3.5" />{segment}
            </Button>
          ))}
        </div>
      </Panel>

      {segments.length > 0 ? (
        <Panel className="p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Segments</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSegmentFilter(null);
                setOrganizationFilter(null);
              }}
              aria-pressed={segmentFilter === null}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                segmentFilter === null
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-hairline text-muted-foreground hover:text-foreground",
              )}
            >
              Everyone · {segments.reduce((total, [, count]) => total + count, 0)}
            </button>
            {segments.map(([key, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSegmentFilter(segmentFilter === key ? null : key);
                  setOrganizationFilter(null);
                }}
                aria-pressed={segmentFilter === key}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  segmentFilter === key
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-hairline text-muted-foreground hover:text-foreground",
                )}
              >
                {key === UNCATEGORISED ? "Uncategorised" : key} · {count}
              </button>
            ))}
          </div>

          {organizations.length > 0 ? (
            <>
              <p className="mb-2 mt-4 text-xs font-medium text-muted-foreground">
                {segmentFilter === null || segmentFilter === UNCATEGORISED
                  ? "Organizations"
                  : `Organizations — ${segmentFilter}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {organizations.map(([key, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOrganizationFilter(organizationFilter === key ? null : key)}
                    aria-pressed={organizationFilter === key}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      organizationFilter === key
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-hairline text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {key === UNCATEGORISED ? "Not given" : key} · {count}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Invites & registrations"
          description={
            segmentFilter === null
              ? `${registrations?.length ?? 0} on the list`
              : `${visible.length} in ${segmentFilter === UNCATEGORISED ? "Uncategorised" : segmentFilter}`
          }
          actions={
            <>
              <div className="flex rounded-md border border-hairline p-0.5" aria-label="Registration view">
                <Button
                  type="button"
                  variant={viewMode === "spreadsheet" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("spreadsheet")}
                >
                  <Columns3 className="mr-1.5 size-3.5" aria-hidden="true" />
                  Spreadsheet
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "manage" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("manage")}
                >
                  <List className="mr-1.5 size-3.5" aria-hidden="true" />
                  Manage
                </Button>
              </div>
              <Select
                value={segmentFilter ?? "__all__"}
                onValueChange={(value) => {
                  setSegmentFilter(value === "__all__" ? null : value);
                  setOrganizationFilter(null);
                }}
              >
                <SelectTrigger className="h-8 w-[175px]" aria-label="Filter registrations by category">
                  <ListFilter className="mr-1.5 size-3.5" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories · {segments.reduce((total, [, count]) => total + count, 0)}</SelectItem>
                  {segments.map(([key, count]) => (
                    <SelectItem key={key} value={key}>{key === UNCATEGORISED ? "Uncategorised" : key} · {count}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="search"
                value={search}
                onChange={(inputEvent) => setSearch(inputEvent.target.value)}
                placeholder="Search guests"
                aria-label="Search guests"
                className="h-8 w-44"
              />
              <GuestCsvImportDialog event={event} triggerLabel="Import HubSpot / Sheets" />
            </>
          }
        />

        <AddGuest event={event} />

        {isError ? (
          <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
        ) : isLoading ? (
          <LoadingRows rows={5} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              search || segmentFilter !== null ? "No guests match that filter" : "Nobody registered yet"
            }
            description={
              search || segmentFilter !== null
                ? "Try a different category, or clear the search."
                : "Register someone above, or import the existing guest list."
            }
          />
        ) : viewMode === "spreadsheet" ? (
          <SpreadsheetRegistrationTable
            rows={visible}
            sourceRows={registrations ?? []}
            onEdit={setEditingRegistration}
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{row.guest?.name ?? "Unknown guest"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.guest?.contact ?? "No contact"}
                    {row.quantity > 1 ? ` · ${row.quantity} people` : ""}
                    {row.guest?.notes ? ` · ${row.guest.notes}` : ""}
                  </p>
                </div>

                <RegistrationStatusBadge status={row.status} />

                {row.status === "pending" && row.guest?.contact?.includes("@") ? (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`mailto:${row.guest.contact}?subject=${encodeURIComponent(`You're invited to ${event.title}`)}&body=${encodeURIComponent(
                        `You're invited to ${event.title}. Please reply to confirm your RSVP.${event.shareToken ? `\n\nEvent details: ${window.location.origin}/e/${event.shareToken}` : ""}`,
                      )}`}
                    >
                      <Mail className="mr-1.5 size-3.5" />
                      Send invite
                    </a>
                  </Button>
                ) : null}

                <OrganizationCell row={row} eventId={event.id} options={orgOptions} />

                <Select
                  value={row.segment ?? UNCATEGORISED}
                  onValueChange={(value) =>
                    setSegment.mutate(
                      { id: row.id, eventId: event.id, segment: value === UNCATEGORISED ? null : value },
                      {
                        onError: (mutationError) =>
                          toast({ title: "Couldn't change category", description: mutationError.message }),
                      },
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[136px]" aria-label={`Category for ${row.guest?.name ?? "guest"}`}>
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCATEGORISED}>No category</SelectItem>
                    {options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={row.status}
                  onValueChange={(value) =>
                    setStatus.mutate(
                      { id: row.id, eventId: event.id, status: value as RegistrationStatus },
                      { onError: (mutationError) => toast({ title: "Couldn't update", description: mutationError.message }) },
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[132px]" aria-label={`Status for ${row.guest?.name ?? "guest"}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button type="button" variant="outline" size="sm" onClick={() => setEditingRegistration(row)}>
                  <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                  Edit details
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    removeRegistration.mutate(
                      { id: row.id, eventId: event.id },
                      { onError: (mutationError) => toast({ title: "Couldn't remove", description: mutationError.message }) },
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editingRegistration ? (
        <EditRegistrationDialog
          key={editingRegistration.id}
          row={editingRegistration}
          headers={headers}
          eventId={event.id}
          onClose={() => setEditingRegistration(null)}
        />
      ) : null}
    </div>
  );
}
