/**
 * People.
 *
 * Guests and Registrations were two separate nav items in the old build, which meant
 * "who is this person and what are they coming to?" needed two pages and a mental join.
 * One list, with each person's registrations inline.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Mail, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  Panel,
  PanelHeader,
  PageHeader,
  Pill,
  RegistrationStatusBadge,
  StatTile,
} from "@/components/primitives";
import { useGuests, useCreateGuest, useDeleteGuest, useRegistrations } from "@/data/hooks";
import type { RegistrationWithGuest } from "@/data/entities";

function AddPersonForm() {
  const create = useCreateGuest();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const trimmedName = name.trim();
        const trimmedContact = contact.trim();
        if (!trimmedName || !trimmedContact) return;
        create.mutate(
          { name: trimmedName, contact: trimmedContact },
          {
            onSuccess: () => {
              setName("");
              setContact("");
            },
            onError: (error) => toast({ title: "Couldn't add", description: error.message }),
          },
        );
      }}
    >
      <Input
        value={name}
        onChange={(inputEvent) => setName(inputEvent.target.value)}
        placeholder="Full name"
        aria-label="Full name"
        className="min-w-[9rem] flex-1"
      />
      <Input
        type="email"
        value={contact}
        onChange={(inputEvent) => setContact(inputEvent.target.value)}
        placeholder="Email"
        aria-label="Email"
        className="min-w-[11rem] flex-1"
      />
      <Button type="submit" size="sm" disabled={!name.trim() || !contact.trim() || create.isPending}>
        <UserPlus className="mr-1.5 size-3.5" />
        Add
      </Button>
    </form>
  );
}

export default function Guests() {
  const { data: guests, isLoading, isError, error, refetch } = useGuests();
  const { data: registrations } = useRegistrations();
  const removePerson = useDeleteGuest();
  const [search, setSearch] = useState("");

  const byGuest = useMemo(() => {
    const map = new Map<string, RegistrationWithGuest[]>();
    for (const registration of registrations ?? []) {
      const bucket = map.get(registration.guestId);
      if (bucket) bucket.push(registration);
      else map.set(registration.guestId, [registration]);
    }
    return map;
  }, [registrations]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return guests ?? [];
    return (guests ?? []).filter((guest) =>
      [guest.name, guest.contact, guest.notes ?? ""].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [guests, search]);

  const confirmed = (registrations ?? []).filter((r) => r.status === "confirmed").length;
  const pending = (registrations ?? []).filter((r) => r.status === "pending").length;
  const withNotes = (guests ?? []).filter((a) => a.notes).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Everyone you invite"
        description="One record per person, with every event they're registered for. Notes carry dietary and access requirements through to the caterer."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Guests" value={guests?.length ?? 0} icon={Users} loading={isLoading} />
        <StatTile label="Confirmed registrations" value={confirmed} tone="success" loading={isLoading} />
        <StatTile label="Pending" value={pending} tone="warning" loading={isLoading} />
        <StatTile label="With requirements" value={withNotes} tone="info" loading={isLoading} />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load guests" onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHeader
          title={`${visible.length} ${visible.length === 1 ? "guest" : "guests"}`}
          actions={
            <div className="relative w-52">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(inputEvent) => setSearch(inputEvent.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="h-8 pl-9"
              />
            </div>
          }
        />

        <AddPersonForm />

        {isLoading ? (
          <LoadingRows rows={6} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "Nobody matches that search" : "No people yet"}
            description={
              search
                ? "Try a name or an email address."
                : "Add people above, or let them add themselves by sharing an event's ticket link."
            }
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((guest) => {
              const theirRegistrations = byGuest.get(guest.id) ?? [];
              return (
                <li key={guest.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{guest.name}</span>
                      {guest.notes ? <Pill tone="info">{guest.notes}</Pill> : null}
                    </div>
                    <a
                      href={`mailto:${guest.contact}`}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="size-3" aria-hidden="true" />
                      {guest.contact}
                    </a>
                    {theirRegistrations.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {theirRegistrations.map((registration) => (
                          <li key={registration.id}>
                            <Link
                              href={`/app/events/${registration.eventId}/people`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs transition-colors hover:bg-accent/60"
                            >
                              <span className="max-w-[16rem] truncate text-foreground">{registration.eventTitle}</span>
                              <RegistrationStatusBadge status={registration.status} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Not registered for anything yet</p>
                    )}
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" aria-label={`Delete ${guest.name}`}>
                        <Trash2 className="size-3.5 text-danger-text" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {guest.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {theirRegistrations.length > 0
                            ? `This also removes ${theirRegistrations.length} registration${theirRegistrations.length === 1 ? "" : "s"} and updates those events' counts.`
                            : "They have no registrations, so nothing else changes."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            removePerson.mutate(
                              { id: guest.id },
                              {
                                onSuccess: () => toast({ title: "Deleted", description: `${guest.name} was removed.` }),
                                onError: (mutationError) =>
                                  toast({ title: "Couldn't delete", description: mutationError.message }),
                              },
                            )
                          }
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
