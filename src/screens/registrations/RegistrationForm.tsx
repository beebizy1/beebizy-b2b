/**
 * Register an existing attendee onto an event.
 *
 * Three fields, all of them choices: which event, which attendee, and what state the
 * registration starts in. Creating the attendee is a separate step, so this form never
 * has to be two forms at once.
 */

import { useState } from "react";
import { Link, useLocation as useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageHeader, Panel, PanelHeader } from "@/components/primitives";
import { useCreateRegistration, useEvents, useGuests } from "@/data/hooks";
import { REGISTRATION_STATUSES, type RegistrationStatus } from "@/data/entities";

export default function RegistrationForm() {
  const [, navigate] = useRoute();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: guests, isLoading: guestsLoading } = useGuests();
  const createRegistration = useCreateRegistration();

  const [eventId, setEventId] = useState("");
  const [guestId, setGuestId] = useState("");
  const [status, setStatus] = useState<RegistrationStatus>("confirmed");
  const [touched, setTouched] = useState(false);

  const eventProblem = !eventId ? "Choose an event." : undefined;
  const guestProblem = !guestId ? "Choose an attendee." : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/app/registrations"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Registrations
      </Link>

      <PageHeader title="New Registration" />

      <Panel>
        <PanelHeader title="Registration details" />
        <form
          className="space-y-5 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            setTouched(true);
            if (eventProblem || guestProblem) return;

            createRegistration.mutate(
              { eventId, guestId, status },
              {
                onSuccess: () => {
                  toast({ title: "Registration created" });
                  navigate("/app/registrations");
                },
                onError: (error) => toast({ title: "Couldn't create registration", description: error.message }),
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="registration-event">Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger
                id="registration-event"
                disabled={eventsLoading}
                aria-invalid={Boolean(touched && eventProblem)}
              >
                <SelectValue placeholder={eventsLoading ? "Loading events…" : "Select an event"} />
              </SelectTrigger>
              <SelectContent>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && eventProblem ? <p className="text-xs text-danger-text">{eventProblem}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="registration-attendee">Attendee</Label>
            <Select value={guestId} onValueChange={setGuestId}>
              <SelectTrigger
                id="registration-attendee"
                disabled={guestsLoading}
                aria-invalid={Boolean(touched && guestProblem)}
              >
                <SelectValue placeholder={guestsLoading ? "Loading attendees…" : "Select an attendee"} />
              </SelectTrigger>
              <SelectContent>
                {guests?.map((guest) => (
                  <SelectItem key={guest.id} value={guest.id}>
                    {guest.name} ({guest.contact})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && guestProblem ? <p className="text-xs text-danger-text">{guestProblem}</p> : null}
            <p className="text-xs text-muted-foreground">
              Not in the list?{" "}
              <Link href="/app/attendees" className="font-medium text-foreground underline underline-offset-2">
                Add the attendee first
              </Link>
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="registration-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as RegistrationStatus)}>
              <SelectTrigger id="registration-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGISTRATION_STATUSES.map((option) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <Button asChild variant="outline" type="button">
              <Link href="/app/registrations">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createRegistration.isPending}>
              <Save className="mr-1.5 size-4" aria-hidden="true" />
              Create Registration
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
