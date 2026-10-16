/**
 * Create and edit an event.
 *
 * One form for both, because the fields are identical and the old build maintained two
 * 400-line pages that had already drifted apart. On create you can also start from a
 * template, which copies its checklist, run of show and budget in one write.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ErrorNotice, LoadingRows, Panel, PanelHeader, PageHeader } from "@/components/primitives";
import {
  useCreateEvent,
  useCreateEventFromTemplate,
  useEvent,
  useLocations,
  useShareAuction,
  useTemplates,
  useUpdateEvent,
} from "@/data/hooks";
import { EVENT_CATEGORIES, EVENT_STATUSES, type EventDraft, type EventStatus } from "@/data/entities";
import { useAccountExperience } from "@/app/useAccountExperience";
import type { AccountExperience } from "@/data/accountExperience";
import { eventDetailsReturnTarget, eventLaunchStepHref, type EventLaunchStepId } from "@/data/eventLaunchGuide";
import EventLaunchContextBar from "./EventLaunchContextBar";
import { useEventLaunchProgress } from "./useEventLaunchProgress";

const NO_VENUE = "__none__";
const NO_TEMPLATE = "__blank__";

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultStart(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(9, 0, 0, 0);
  return toLocalInput(date.toISOString());
}

interface FormState {
  experience: AccountExperience;
  title: string;
  description: string;
  start: string;
  end: string;
  locationId: string;
  freeTextVenue: string;
  capacity: string;
  status: EventStatus;
  category: string;
  templateId: string;
}

const EMPTY: FormState = {
  experience: "standard",
  title: "",
  description: "",
  start: defaultStart(),
  end: "",
  locationId: NO_VENUE,
  freeTextVenue: "",
  capacity: "",
  status: "draft",
  category: "Summit",
  templateId: NO_TEMPLATE,
};

export default function EventForm({ id }: { id?: string }) {
  const isEdit = Boolean(id);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { experience, canSwitchExperience } = useAccountExperience();
  const { data: locations } = useLocations();
  const { data: templates } = useTemplates();
  const { data: existing, isLoading, isError, error } = useEvent(id ?? "");

  const createEvent = useCreateEvent();
  const createFromTemplate = useCreateEventFromTemplate();
  const updateEvent = useUpdateEvent();
  const shareAuction = useShareAuction();

  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY, experience }));
  const [touched, setTouched] = useState(false);
  const [fundraiserHasAuction, setFundraiserHasAuction] = useState<boolean | null>(null);
  const launchProgress = useEventLaunchProgress(existing);
  const returnTarget = isEdit && id
    ? eventDetailsReturnTarget(id, search)
    : { href: "/app/events", label: "All events" as const };
  const guidedLaunchEdit = isEdit && returnTarget.label === "Back to launch guide";

  useEffect(() => {
    if (!existing) return;
    setForm({
      experience: existing.experience ?? "standard",
      title: existing.title,
      description: existing.description ?? "",
      start: toLocalInput(existing.date),
      end: toLocalInput(existing.endDate),
      locationId: existing.locationId ?? NO_VENUE,
      freeTextVenue: existing.locationId ? "" : (existing.location ?? ""),
      capacity: existing.capacity === null ? "" : String(existing.capacity),
      status: existing.status,
      category: existing.category,
      templateId: NO_TEMPLATE,
    });
    setFundraiserHasAuction(existing.category === "Fundraiser" && existing.auctionPublicToken ? true : null);
  }, [existing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const problems = useMemo(() => {
    const found: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) found.title = "Give the event a name.";
    if (!form.start) found.start = "Pick a start date and time.";
    if (form.end && form.start && new Date(form.end) < new Date(form.start)) {
      found.end = "The end can't be before the start.";
    }
    if (form.capacity.trim() !== "") {
      const parsed = Number.parseInt(form.capacity, 10);
      if (!Number.isFinite(parsed) || parsed < 0) found.capacity = "Capacity must be a whole number.";
    }
    return found;
  }, [form]);

  const submit = () => {
    setTouched(true);
    if (Object.keys(problems).length > 0 || (form.category === "Fundraiser" && fundraiserHasAuction === null)) return;

    const startIso = fromLocalInput(form.start);
    if (!startIso) return;

    const draft: EventDraft = {
      experience: form.experience,
      title: form.title.trim(),
      description: form.description.trim() || null,
      date: startIso,
      endDate: fromLocalInput(form.end),
      locationId: form.locationId === NO_VENUE ? null : form.locationId,
      location: form.locationId === NO_VENUE ? form.freeTextVenue.trim() || null : null,
      capacity: form.capacity.trim() === "" ? null : Number.parseInt(form.capacity, 10),
      status: form.status,
      category: form.category,
    };

    if (isEdit && id) {
      updateEvent.mutate(
        { id, patch: draft },
        {
          onSuccess: async () => {
            if (form.category === "Fundraiser" && fundraiserHasAuction && !existing?.auctionPublicToken) {
              try {
                await shareAuction.mutateAsync(id);
              } catch (linkError) {
                toast({ title: "Event saved, but the donor link needs another try", description: linkError instanceof Error ? linkError.message : "Open Fundraising to create it." });
              }
            }
            toast({ title: "Saved", description: `“${draft.title}” is up to date.` });
            navigate(form.category === "Fundraiser" && fundraiserHasAuction
              ? `/app/events/${id}/fundraising?setup=auction`
              : returnTarget.href);
          },
          onError: (mutationError) => toast({ title: "Couldn't save", description: mutationError.message }),
        },
      );
      return;
    }

    const onCreated = async (created: { id: string; title: string }) => {
      const auctionSetup = form.category === "Fundraiser" && fundraiserHasAuction;
      if (auctionSetup) {
        try {
          await shareAuction.mutateAsync(created.id);
        } catch (linkError) {
          toast({ title: "Event created, but the donor link needs another try", description: linkError instanceof Error ? linkError.message : "Open Fundraising to create it." });
        }
      }
      toast({
        title: "Event created",
        description: auctionSetup
          ? `Next, add auction items or copy the donor link for “${created.title}”.`
          : `Next, build the invite list for “${created.title}”.`,
      });
      navigate(auctionSetup ? `/app/events/${created.id}/fundraising?setup=auction` : `/app/events/${created.id}/share`);
    };

    if (form.templateId !== NO_TEMPLATE) {
      createFromTemplate.mutate(
        { templateId: form.templateId, draft },
        {
          onSuccess: onCreated,
          onError: (mutationError) => toast({ title: "Couldn't create", description: mutationError.message }),
        },
      );
      return;
    }

    createEvent.mutate(draft, {
      onSuccess: onCreated,
      onError: (mutationError) => toast({ title: "Couldn't create", description: mutationError.message }),
    });
  };

  const saving = createEvent.isPending || createFromTemplate.isPending || updateEvent.isPending || shareAuction.isPending;
  const showProblem = (key: keyof FormState) => (touched ? problems[key] : undefined);
  const selectLaunchStep = (step: EventLaunchStepId) => {
    if (!id || !launchProgress.unlocked[step]) return;
    navigate(eventLaunchStepHref(id, step));
  };

  if (isEdit && isLoading) return <LoadingRows rows={5} />;
  if (isEdit && isError) return <ErrorNotice error={error} title="Couldn't load this event" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {guidedLaunchEdit && existing ? (
        <EventLaunchContextBar
          activeStep={1}
          eventTitle={existing.title}
          backHref={returnTarget.href}
          completion={launchProgress.completion}
          unlocked={launchProgress.unlocked}
          onStepSelect={selectLaunchStep}
        />
      ) : (
        <>
          <Link
            href={returnTarget.href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {returnTarget.label}
          </Link>
          <PageHeader
            title={isEdit ? (existing?.title ?? "Edit event") : "Plan an event"}
            description={
              isEdit
                ? "Changes apply immediately. Moving the venue updates the event's venue snapshot."
                : "Start blank, or from a template that brings its checklist, run of show and budget with it."
            }
          />
        </>
      )}

      <Panel>
        <PanelHeader
          title={guidedLaunchEdit ? "Step 1. Event details" : "Details"}
          description={guidedLaunchEdit ? "Set the basics, then save to return to the checklist and continue." : undefined}
        />
        <form
          className="space-y-5 p-5"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            submit();
          }}
        >
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="template">Start from</Label>
              <Select value={form.templateId} onValueChange={(value) => set("templateId", value)}>
                <SelectTrigger id="template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Blank event</SelectItem>
                  {(templates ?? []).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} · {template.checklistCount} tasks, {template.budgetCount} budget lines
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {canSwitchExperience ? (
            <div className="space-y-1.5">
              <Label htmlFor="event-experience">Workspace view</Label>
              <Select value={form.experience} onValueChange={(value) => set("experience", value as AccountExperience)}>
                <SelectTrigger id="event-experience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Full Beebizy</SelectItem>
                  <SelectItem value="santa-clara">Santa Clara</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Controls which customer dashboard can see this event.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="title">Name</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(inputEvent) => set("title", inputEvent.target.value)}
              placeholder="Global Sales Kickoff 2027"
              aria-invalid={Boolean(showProblem("title"))}
            />
            {showProblem("title") ? <p className="text-xs text-danger-text">{problems.title}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(inputEvent) => set("description", inputEvent.target.value)}
              placeholder="What is this event, and what does a good outcome look like?"
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start">Starts</Label>
              <Input
                id="start"
                type="datetime-local"
                value={form.start}
                onChange={(inputEvent) => set("start", inputEvent.target.value)}
                aria-invalid={Boolean(showProblem("start"))}
              />
              {showProblem("start") ? <p className="text-xs text-danger-text">{problems.start}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Ends (optional)</Label>
              <Input
                id="end"
                type="datetime-local"
                value={form.end}
                onChange={(inputEvent) => set("end", inputEvent.target.value)}
                aria-invalid={Boolean(showProblem("end"))}
              />
              {showProblem("end") ? <p className="text-xs text-danger-text">{problems.end}</p> : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Add an end date on a later day to organize the run of show as Day 1, Day 2, and beyond.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="venue">Venue</Label>
            <Select value={form.locationId} onValueChange={(value) => set("locationId", value)}>
              <SelectTrigger id="venue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VENUE}>No saved venue</SelectItem>
                {(locations ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                    {location.city ? ` · ${location.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.locationId === NO_VENUE ? (
              <Input
                value={form.freeTextVenue}
                onChange={(inputEvent) => set("freeTextVenue", inputEvent.target.value)}
                placeholder="Or type a one-off venue"
                aria-label="One-off venue"
                className="mt-2"
              />
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(value) => {
                set("category", value);
                if (value !== "Fundraiser") setFundraiserHasAuction(null);
              }}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(value) => set("status", value as EventStatus)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                value={form.capacity}
                onChange={(inputEvent) => set("capacity", inputEvent.target.value)}
                placeholder="Leave blank for none"
                inputMode="numeric"
                aria-invalid={Boolean(showProblem("capacity"))}
              />
              {showProblem("capacity") ? <p className="text-xs text-danger-text">{problems.capacity}</p> : null}
            </div>
          </div>

          {form.category === "Fundraiser" ? (
            <fieldset className="rounded-xl border border-primary/25 bg-primary-muted/25 p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">Will this fundraiser include an auction?</legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">If yes, Beebizy will take you directly to auction setup after you save the event.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant={fundraiserHasAuction === true ? "default" : "outline"} onClick={() => setFundraiserHasAuction(true)}>Yes, set up an auction</Button>
                <Button type="button" variant={fundraiserHasAuction === false ? "default" : "outline"} onClick={() => setFundraiserHasAuction(false)}>No auction</Button>
              </div>
              {touched && fundraiserHasAuction === null ? <p className="mt-2 text-xs text-danger-text">Choose whether this fundraiser includes an auction.</p> : null}
            </fieldset>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <Button asChild variant="outline" type="button">
              <Link href={returnTarget.href}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-1.5 size-4" />
              {isEdit ? "Save changes" : "Create event"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
