/**
 * People: who is coming, and whether that fits.
 *
 * Capacity is enforced by the data layer, so adding the 25th guest to a 24-seat room
 * fails with a real message instead of silently over-filling the event — which is what
 * the old registration form did.
 */

import { useMemo, useState } from "react";
import { Mail, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  useSetRegistrationSegment,
  useSetRegistrationStatus,
} from "@/data/hooks";
import {
  REGISTRATION_SEGMENTS,
  REGISTRATION_STATUSES,
  type Event,
  type RegistrationStatus,
  type RegistrationWithGuest,
} from "@/data/entities";

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

export default function GuestsSection({ event }: { event: Event }) {
  const { data: registrations, isLoading, isError, error, refetch } = useEventRegistrations(event.id);
  const setStatus = useSetRegistrationStatus();
  const setSegment = useSetRegistrationSegment();
  const removeRegistration = useDeleteRegistration();
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);

  const counts = useMemo(() => {
    const rows = registrations ?? [];
    return {
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      pending: rows.filter((r) => r.status === "pending").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
    };
  }, [registrations]);

  /**
   * How the list breaks down, cancellations excluded — a cancelled sponsor is not a
   * sponsor you are catering for, and counting them would overstate every segment.
   */
  const segments = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of registrations ?? []) {
      if (row.status === "cancelled") continue;
      const key = row.segment ?? UNCATEGORISED;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()].sort(([a], [b]) =>
      a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b),
    );
  }, [registrations]);

  const options = useMemo(() => segmentOptions(registrations ?? []), [registrations]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (registrations ?? []).filter((row) => {
      if (segmentFilter !== null) {
        const key = row.segment ?? UNCATEGORISED;
        if (key !== segmentFilter) return false;
      }
      if (!needle) return true;
      return [row.guest?.name ?? "", row.guest?.contact ?? "", row.guest?.notes ?? "", row.segment ?? ""].some(
        (field) => field.toLowerCase().includes(needle),
      );
    });
  }, [registrations, search, segmentFilter]);

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

      {segments.length > 0 ? (
        <Panel className="p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Segments</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSegmentFilter(null)}
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
                onClick={() => setSegmentFilter(segmentFilter === key ? null : key)}
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
              <Input
                type="search"
                value={search}
                onChange={(inputEvent) => setSearch(inputEvent.target.value)}
                placeholder="Search guests"
                aria-label="Search guests"
                className="h-8 w-44"
              />
              <GuestCsvImportDialog event={event} />
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
                : "Register someone above, or share the ticket link from Share."
            }
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{row.guest?.name ?? "Unknown guest"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.guest?.contact ?? "No contact"}
                    {row.guest?.notes ? ` · ${row.guest.notes}` : ""}
                  </p>
                </div>

                <RegistrationStatusBadge status={row.status} />

                {row.status === "pending" && row.guest?.contact.includes("@") ? (
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
    </div>
  );
}
