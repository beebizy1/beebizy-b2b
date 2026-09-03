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
  useCreateRegistration,
  useDeleteRegistration,
  useEventRegistrations,
  useSetRegistrationStatus,
} from "@/data/hooks";
import { REGISTRATION_STATUSES, type Event, type RegistrationStatus } from "@/data/entities";

function AddGuest({ event }: { event: Event }) {
  const { data: guests } = useGuests();
  const { data: registrations } = useEventRegistrations(event.id);
  const createRegistration = useCreateRegistration();
  const [guestId, setGuestId] = useState("");
  const [status, setStatus] = useState<"pending" | "confirmed">("pending");

  // Anyone already registered (and not cancelled) shouldn't appear as an option.
  const available = useMemo(() => {
    const taken = new Set((registrations ?? []).filter((r) => r.status !== "cancelled").map((r) => r.guestId));
    return (guests ?? []).filter((guest) => !taken.has(guest.id));
  }, [guests, registrations]);

  const atCapacity = event.capacity !== null && event.registrationCount >= event.capacity;

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!guestId) return;
        createRegistration.mutate(
          { eventId: event.id, guestId, status },
          {
            onSuccess: () => setGuestId(""),
            onError: (error) => toast({ title: "Couldn't register", description: error.message }),
          },
        );
      }}
    >
      <Select value={guestId} onValueChange={setGuestId} disabled={available.length === 0}>
        <SelectTrigger className="min-w-[14rem] flex-1" aria-label="Choose someone to invite">
          <SelectValue placeholder={available.length === 0 ? "Everyone is already on the list" : "Choose a guest…"} />
        </SelectTrigger>
        <SelectContent>
          {available.map((guest) => (
            <SelectItem key={guest.id} value={guest.id}>
              {guest.name} · {guest.contact}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(value) => setStatus(value as "pending" | "confirmed")}>
        <SelectTrigger className="w-[178px]" aria-label="Invitation status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Invite - awaiting RSVP</SelectItem>
          <SelectItem value="confirmed">Add as confirmed</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={!guestId || createRegistration.isPending}>
        <UserPlus className="mr-1.5 size-3.5" />
        {status === "pending" ? "Add invitation" : "Register"}
      </Button>
      {atCapacity ? (
        <p className="w-full text-xs text-warning-text">
          This event is at capacity. Raise the capacity in Edit before adding more.
        </p>
      ) : null}
    </form>
  );
}

export default function GuestsSection({ event }: { event: Event }) {
  const { data: registrations, isLoading, isError, error, refetch } = useEventRegistrations(event.id);
  const setStatus = useSetRegistrationStatus();
  const removeRegistration = useDeleteRegistration();
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const rows = registrations ?? [];
    return {
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      pending: rows.filter((r) => r.status === "pending").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
    };
  }, [registrations]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return registrations ?? [];
    return (registrations ?? []).filter((row) =>
      [row.guest?.name ?? "", row.guest?.contact ?? "", row.guest?.notes ?? ""].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [registrations, search]);

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

      <Panel>
        <PanelHeader
          title="Invites & registrations"
          description={`${registrations?.length ?? 0} on the list`}
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
            title={search ? "No guests match that search" : "Nobody registered yet"}
            description={
              search ? "Try a name or an email address." : "Register someone above, or share the ticket link from Share."
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
