/**
 * People: who is coming, and whether that fits.
 *
 * Capacity is enforced by the data layer, so adding the 25th guest to a 24-seat room
 * fails with a real message instead of silently over-filling the event — which is what
 * the old registration form did.
 */

import { useEffect, useMemo, useState } from "react";
import { Columns3, Copy, List, ListFilter, Mail, Pencil, UserPlus, Users } from "lucide-react";
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
  useCreateGuest,
  useCreateRegistration,
  useDeleteRegistration,
  useEventRegistrations,
  useSetRegistrationOrganization,
  useSetRegistrationSegment,
  useSetRegistrationStatus,
  useShareEvent,
  useUpdateRegistrationDetails,
} from "@/data/hooks";
import {
  REGISTRATION_SEGMENTS,
  REGISTRATION_STATUSES,
  type Event,
  type RegistrationStatus,
  type RegistrationWithGuest,
} from "@/data/entities";
import { registrationSegmentSummary } from "@/data/santaClara";
import { normalizeRegistrationPage } from "@/data/registrationPage";

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

const DEFAULT_SPREADSHEET_HEADERS = [
  "Full Name",
  "Email Address",
  "RSVP Response",
  "Company Name",
  "Guest Type",
  "Notes",
  "Attendees",
  "Phone",
  "Source",
] as const;

type SpreadsheetFieldKind =
  | "name"
  | "email"
  | "status"
  | "organization"
  | "segment"
  | "notes"
  | "quantity"
  | "custom";

function spreadsheetFieldKind(header: string): SpreadsheetFieldKind {
  const key = header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["full name", "name", "guest", "guest name", "attendee"].includes(key)) return "name";
  if (["email", "e mail", "email address", "e mail address", "contact email"].includes(key)) return "email";
  if (["rsvp", "rsvp response", "attendance", "response", "yes/no"].includes(key)) return "status";
  if (["company", "company name", "organization", "organisation", "school"].includes(key)) return "organization";
  if (["guest type", "segment", "category", "registration type", "lifecycle stage"].includes(key)) return "segment";
  if (["notes", "note", "comment", "comments"].includes(key)) return "notes";
  if (["attendees", "attendee count", "guest count", "number of guests", "party size", "seats", "quantity"].includes(key)) {
    return "quantity";
  }
  return "custom";
}

function spreadsheetHeaders(rows: RegistrationWithGuest[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const field of row.importedFields ?? []) {
      if (seen.has(field.label)) continue;
      seen.add(field.label);
      headers.push(field.label);
    }
  }
  return headers.length > 0 ? headers : [...DEFAULT_SPREADSHEET_HEADERS];
}

function spreadsheetValue(row: RegistrationWithGuest, header: string): string {
  const imported = row.importedFields?.find((field) => field.label === header);
  if (imported) return imported.value;
  const kind = spreadsheetFieldKind(header);
  if (kind === "name") return row.guest?.name ?? "";
  if (kind === "email") return row.guest?.contact ?? "";
  if (kind === "status") {
    return row.status === "confirmed" ? "Yes" : row.status === "cancelled" ? "No" : "Pending";
  }
  if (kind === "organization") return row.organization ?? "";
  if (kind === "segment") return row.segment ?? "";
  if (kind === "notes") return row.guest?.notes ?? "";
  if (kind === "quantity") return String(row.quantity);
  return "";
}

function registrationStatusFromSpreadsheet(value: string): RegistrationStatus {
  const normalised = value.trim().toLowerCase();
  if (["yes", "y", "confirmed", "attending", "accepted", "true"].includes(normalised)) return "confirmed";
  if (["no", "n", "cancelled", "canceled", "declined", "not attending", "false"].includes(normalised)) {
    return "cancelled";
  }
  return "pending";
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
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(headers.map((header) => [header, spreadsheetValue(row, header)])),
  );

  const valueForKind = (kind: SpreadsheetFieldKind, fallback: string) => {
    const header = headers.find((candidate) => spreadsheetFieldKind(candidate) === kind);
    return header ? draft[header] ?? "" : fallback;
  };

  const save = async () => {
    const name = valueForKind("name", row.guest?.name ?? "").trim();
    const rawQuantity = valueForKind("quantity", String(row.quantity)).trim();
    const quantity = Number(rawQuantity);
    if (!name) {
      toast({ title: "Name is required" });
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) {
      toast({ title: "Attendee count must be between 1 and 10,000" });
      return;
    }

    try {
      await update.mutateAsync({
        id: row.id,
        eventId,
        patch: {
          name,
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
          importedFields: headers.map((label) => ({ label, value: draft[label] ?? "" })),
        },
      });
      toast({ title: "Registration updated" });
      onClose();
    } catch (error) {
      toast({ title: "Couldn't update registration", description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit registration</DialogTitle>
          <DialogDescription>
            Update the RSVP and every value from the imported spreadsheet. All changes save together.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {headers.map((header) => {
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={update.isPending}>
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
  const createGuest = useCreateGuest();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [guestId, setGuestId] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"pending" | "confirmed">("pending");
  const [segment, setSegment] = useState("");
  const [organization, setOrganization] = useState("");

  // Anyone already registered (and not cancelled) shouldn't appear as an option.
  const available = useMemo(() => {
    const taken = new Set((registrations ?? []).filter((r) => r.status !== "cancelled").map((r) => r.guestId));
    return (guests ?? []).filter((guest) => !taken.has(guest.id));
  }, [guests, registrations]);

  const atCapacity = event.capacity !== null && event.registrationCount >= event.capacity;
  const pending = createRegistration.isPending || createGuest.isPending;
  const canSubmit = mode === "new" ? name.trim().length > 0 : guestId !== "";

  const submit = async () => {
    try {
      const id =
        mode === "existing"
          ? guestId
          : (await createGuest.mutateAsync({ name: name.trim(), contact: contact.trim() })).id;

      await createRegistration.mutateAsync({
        eventId: event.id,
        guestId: id,
        status,
        segment: segment.trim() || null,
        organization: organization.trim() || null,
      });
      setGuestId("");
      setName("");
      setContact("");
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
      <div className="flex gap-1">
        {(["new", "existing"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
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
              value={name}
              onChange={(inputEvent) => setName(inputEvent.target.value)}
              placeholder="Full name"
              aria-label="Guest name"
              className="min-w-[10rem] flex-1"
            />
            <Input
              type="email"
              value={contact}
              onChange={(inputEvent) => setContact(inputEvent.target.value)}
              placeholder="Email (optional)"
              aria-label="Guest email"
              className="min-w-[10rem] flex-1"
            />
          </>
        ) : (
          <Select value={guestId} onValueChange={setGuestId} disabled={available.length === 0}>
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
          onChange={(inputEvent) => setSegment(inputEvent.target.value)}
          placeholder="Category (optional)"
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
          onChange={(inputEvent) => setOrganization(inputEvent.target.value)}
          placeholder="Organization (optional)"
          aria-label="Guest organization"
          list="guest-organization-suggestions"
          className="w-[170px]"
        />
        <datalist id="guest-organization-suggestions">
          {organizationOptions(registrations ?? []).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <Select value={status} onValueChange={(value) => setStatus(value as "pending" | "confirmed")}>
          <SelectTrigger className="w-[178px]" aria-label="Invitation status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Invite - awaiting RSVP</SelectItem>
            <SelectItem value="confirmed">Add as confirmed</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" size="sm" disabled={!canSubmit || pending}>
          <UserPlus className="mr-1.5 size-3.5" />
          {status === "pending" ? "Add invitation" : "Register"}
        </Button>
      </div>

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
