/**
 * Post-event summary.
 *
 * The read-back after the day: who came, what it cost, what it returned, and how the
 * plan actually ran. Everything is derived from the event's own records, so this page
 * is a view of the truth rather than a separate report someone has to keep up to date.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  Save,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  EmptyState,
  ErrorNotice,
  EventStatusBadge,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePreferences } from "@/app/preferences";
import { formatMoney, sumCents } from "@/data/money";
import { attendanceNamesCsv, buildUniqueAttendanceReport, type UniqueAttendeeRecord } from "@/data/attendanceReport";
import { normalizeRegistrationPage } from "@/data/registrationPage";
import {
  useBudget,
  useChecklist,
  useEvent,
  useEventRegistrations,
  usePostEventCopyGenerator,
  useRunOfShow,
  useSponsorships,
  useTeamHours,
  useUpdateRegistrationPage,
} from "@/data/hooks";

async function copyDraft(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied` });
  } catch {
    toast({ title: "Couldn't copy", description: "Select the text and copy it manually." });
  }
}

export default function PostEventSummary({ id }: { id: string }) {
  const { date: formatDate } = usePreferences();
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const { data: registrations } = useEventRegistrations(id);
  const { data: budget } = useBudget(id);
  const { data: checklist } = useChecklist(id);
  const { data: runOfShow } = useRunOfShow(id);
  const { data: sponsorships } = useSponsorships(id);
  const { data: teamHours } = useTeamHours(id);
  const generateCopy = usePostEventCopyGenerator();
  const updateEvent = useUpdateRegistrationPage();
  const [postEventSubject, setPostEventSubject] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [postEventWrapUp, setPostEventWrapUp] = useState("");

  useEffect(() => {
    if (!event) return;
    const page = normalizeRegistrationPage(event.registrationPage);
    setPostEventSubject(page.postEventSubject);
    setThankYouMessage(page.postEventThankYou);
    setPostEventWrapUp(page.postEventWrapUp);
  }, [event]);

  if (isError) return <ErrorNotice error={error} title="Couldn't load this event" onRetry={() => void refetch()} />;
  if (isLoading) return <LoadingRows rows={6} />;

  if (!event) {
    return (
      <Panel>
        <EmptyState
          icon={FileText}
          title="That event doesn't exist"
          description="It may have been deleted."
          action={
            <Button asChild variant="outline">
              <Link href="/app/events">Back to events</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const attendance = buildUniqueAttendanceReport(registrations ?? []);
  const { summary: attendanceSummary } = attendance;
  const noShows = Math.max(0, attendanceSummary.uniqueRegistered - attendanceSummary.uniqueCheckedIn);
  const attendanceRate = attendanceSummary.uniqueCheckedIn > 0 ? attendanceSummary.attendanceRate : null;

  const countBy = (read: (row: UniqueAttendeeRecord) => string | null) =>
    [...attendance.attendees.reduce((counts, row) => {
      const label = read(row)?.trim() || "Not specified";
      counts.set(label, (counts.get(label) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const guestTypes = countBy((row) => row.guestType);
  const sources = countBy((row) => row.registrationSource);
  const maxGuestType = Math.max(1, ...guestTypes.map(([, count]) => count));
  const maxSource = Math.max(1, ...sources.map(([, count]) => count));

  const downloadAttendanceCsv = () => {
    const rows = attendance.attendees;
    const url = URL.createObjectURL(new Blob([attendanceNamesCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    const eventName = event.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
    anchor.href = url;
    anchor.download = `beebizy-${eventName}-unique-attendee-names.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const expenses = (budget ?? []).filter((line) => line.type === "expense");
  const estimated = sumCents(expenses.map((line) => line.estimatedCents));
  const actual = sumCents(expenses.map((line) => line.actualCents));
  const spend = actual || estimated;

  const revenue =
    sumCents((budget ?? []).filter((line) => line.type === "revenue").map((line) => line.actualCents)) +
    sumCents((sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents));

  // Return on what was actually spent. With no spend there is nothing to divide by, so
  // the tile shows a dash rather than a fabricated percentage.
  const roiPct = spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : null;
  const roiPositive = roiPct !== null && roiPct >= 0;

  const checklistDone = (checklist ?? []).filter((item) => item.completed).length;
  const checklistTotal = checklist?.length ?? 0;
  const totalHours = (teamHours ?? []).reduce((sum, entry) => sum + entry.hours, 0);

  const generatePostEventDrafts = () => {
    generateCopy.mutate(
      { eventId: event.id },
      {
        onSuccess: (suggestion) => {
          setPostEventSubject(suggestion.subject);
          setThankYouMessage(suggestion.thankYouMessage);
          setPostEventWrapUp(suggestion.wrapUp);
          toast({
            title: "Post-event drafts are ready",
            description: suggestion.source === "ai" ? "Review every word, make any edits, then save." : "A clear starter draft is ready to edit and save.",
          });
        },
        onError: (error) => toast({ title: "Couldn't create the drafts", description: error.message }),
      },
    );
  };

  const savePostEventDrafts = () => {
    updateEvent.mutate(
      {
        id: event.id,
        patch: {
          postEventSubject,
          postEventThankYou: thankYouMessage,
          postEventWrapUp,
        },
      },
      {
        onSuccess: () => toast({ title: "Post-event drafts saved", description: "They will still be here when you return." }),
        onError: (error) => toast({ title: "Couldn't save the drafts", description: error.message }),
      },
    );
  };

  const openThankYouEmail = () => {
    const body = thankYouMessage.trim();
    if (!body) {
      toast({ title: "Write or generate the thank-you message first" });
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(postEventSubject.trim())}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/app/events/${event.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to event
      </Link>

      <header className="border-b border-hairline pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="size-4 text-primary-text" aria-hidden="true" />
              Post-Event Summary
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{event.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatDate(event.date, "dayMonthYear")}
                {event.endDate ? ` – ${formatDate(event.endDate, "dayMonthYear")}` : ""}
              </span>
              {event.location ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {event.location}
                </span>
              ) : null}
              {event.category ? <Pill>{event.category}</Pill> : null}
              <EventStatusBadge status={event.status} />
            </div>
            {event.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{event.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={downloadAttendanceCsv} disabled={attendance.attendees.length === 0}>
              <Download className="mr-1.5 size-3.5" />Download full names
            </Button>
            <p className="basis-full text-right text-xs text-muted-foreground">Generated {formatDate(new Date(), "dayMonthYear")}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Unique registrations"
          value={String(attendanceSummary.uniqueRegistered)}
          icon={Users}
          sublabel={`${attendanceSummary.registrationRows} registration rows`}
        />
        <StatTile
          label="Attended"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          icon={CheckCircle2}
          tone={attendanceRate === null ? "neutral" : attendanceRate >= 75 ? "success" : "warning"}
          sublabel={
            attendanceRate === null
              ? "No check-in data"
              : `${attendanceSummary.uniqueCheckedIn} unique attendees · ${noShows} no-show${noShows === 1 ? "" : "s"}`
          }
        />
        <StatTile
          label="Total spend"
          value={formatMoney(spend)}
          icon={DollarSign}
          sublabel={actual ? `vs ${formatMoney(estimated)} budgeted` : "Estimated"}
        />
        <StatTile
          label="ROI"
          value={roiPct === null ? "—" : `${roiPct}%`}
          icon={roiPositive ? TrendingUp : TrendingDown}
          tone={roiPct === null ? "neutral" : roiPositive ? "success" : "danger"}
          sublabel={revenue > 0 ? `${formatMoney(revenue)} revenue` : "Cost-only event"}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Post-event communications"
          description="Turn the real event results into an editable thank-you email and internal wrap-up. Nothing sends automatically."
          actions={
            <Button type="button" onClick={generatePostEventDrafts} disabled={generateCopy.isPending}>
              <Sparkles className="mr-1.5 size-4" />{generateCopy.isPending ? "Creating drafts..." : "Generate with AI"}
            </Button>
          }
        />
        <div className="grid gap-6 border-t border-hairline p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="post-event-subject">Thank-you email subject</Label>
              <Input id="post-event-subject" value={postEventSubject} maxLength={160} disabled={generateCopy.isPending} placeholder={`Thank you for joining ${event.title}`} onChange={(input) => setPostEventSubject(input.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-event-thank-you">Attendee thank-you message</Label>
              <Textarea id="post-event-thank-you" value={thankYouMessage} maxLength={3000} rows={10} disabled={generateCopy.isPending} placeholder="Thank guests and share the event's measured attendance without exposing internal details." onChange={(input) => setThankYouMessage(input.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void copyDraft(thankYouMessage, "Thank-you message")} disabled={!thankYouMessage.trim()}><Copy className="mr-1.5 size-4" />Copy</Button>
              <Button type="button" variant="outline" onClick={openThankYouEmail} disabled={!thankYouMessage.trim()}><Mail className="mr-1.5 size-4" />Open email draft</Button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="post-event-wrap-up">Internal post-event wrap-up</Label>
              <Textarea id="post-event-wrap-up" value={postEventWrapUp} maxLength={4000} rows={15} disabled={generateCopy.isPending} placeholder="Summarize attendance, delivery, and recorded results for your team." onChange={(input) => setPostEventWrapUp(input.target.value)} />
              <p className="text-xs text-muted-foreground">The generator only uses measured event records. Review and edit the draft before sharing it.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void copyDraft(postEventWrapUp, "Post-event wrap-up")} disabled={!postEventWrapUp.trim()}><Copy className="mr-1.5 size-4" />Copy wrap-up</Button>
          </div>
        </div>
        <div className="flex justify-end border-t border-hairline px-5 py-4">
          <Button type="button" onClick={savePostEventDrafts} disabled={updateEvent.isPending}><Save className="mr-1.5 size-4" />{updateEvent.isPending ? "Saving..." : "Save drafts"}</Button>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Attendance dashboard"
          description="Unique totals only. Repeated names are consolidated before these figures are calculated."
        />
        <div className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unique attendees</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{attendanceSummary.uniqueCheckedIn}</p>
            <p className="mt-1 text-xs text-muted-foreground">From {attendanceSummary.checkedInRows} check-in records</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No-shows</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{noShows}</p>
            <p className="mt-1 text-xs text-muted-foreground">Registered but not checked in</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duplicates consolidated</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{attendanceSummary.duplicateCheckedInRows}</p>
            <p className="mt-1 text-xs text-muted-foreground">Not counted twice in this dashboard</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance rate</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{attendanceRate === null ? "—" : `${attendanceRate}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{noShows} registered people did not check in</p>
          </div>
        </div>
        <div className="grid gap-6 border-t border-hairline p-5 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-bold text-foreground">Attendees by guest type</h2>
            <div className="mt-4 space-y-3">
              {guestTypes.map(([label, count]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (count / maxGuestType) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Where attendance records came from</h2>
            <div className="mt-4 space-y-3">
              {sources.map(([label, count]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(2, (count / maxSource) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Budget breakdown"
            description={`Budgeted ${formatMoney(estimated)} · Actual ${formatMoney(actual)}`}
          />
          {expenses.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No budget data.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{line.name}</p>
                        <p className="text-sm text-muted-foreground">{line.category}</p>
                      </TableCell>
                      <TableCell data-numeric className="text-right text-muted-foreground">
                        {formatMoney(line.estimatedCents)}
                      </TableCell>
                      <TableCell data-numeric className="text-right">
                        {formatMoney(line.actualCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Delivery"
            description="How much of the plan was completed, and what it took"
          />
          <div className="divide-y divide-hairline">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Checklist completed</span>
              <span data-numeric className="font-medium text-foreground">
                {checklistDone} / {checklistTotal}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Run-of-show cues</span>
              <span data-numeric className="font-medium text-foreground">
                {runOfShow?.length ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Staff hours booked</span>
              <span data-numeric className="font-medium text-foreground">
                {totalHours}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Sponsorship confirmed</span>
              <span data-numeric className="font-medium text-foreground">
                {formatMoney(
                  sumCents((sponsorships ?? []).filter((s) => s.status === "confirmed").map((s) => s.amountCents)),
                )}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {(teamHours?.length ?? 0) > 0 ? (
        <Panel className="overflow-hidden">
          <PanelHeader title="Team hours" description="Who worked on this, and for how long" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamHours?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-foreground">{entry.staffMember}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.role}</TableCell>
                    <TableCell data-numeric className="text-right">
                      {entry.hours}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
