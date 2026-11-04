/** Event overview shaped like an operating brief: status first, then the next work and schedule. */

import { Link } from "wouter";
import { ArrowRight, CheckSquare, ChevronRight, ClipboardList, Clock, Store, Users } from "lucide-react";
import { EmptyState, LoadingRows, Panel, ReadinessRing } from "@/components/primitives";
import { useChecklist, useEventVendors, useRunOfShow } from "@/data/hooks";
import { eventTabHref } from "@/app/shell/nav";
import type { Event, EventHealth } from "@/data/entities";
import { formatClockTime } from "@/lib/datetime";

function SummaryCardLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Panel className="relative flex min-h-36 h-full items-center gap-5 rounded-2xl p-6 pr-12 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        {children}
        <ChevronRight className="absolute right-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground/55 transition group-hover:translate-x-0.5 group-hover:text-primary-text" aria-hidden="true" />
      </Panel>
    </Link>
  );
}

export default function OverviewSection({ event, health }: { event: Event; health: EventHealth | null | undefined }) {
  const { data: checklist, isLoading: checklistLoading } = useChecklist(event.id);
  const { data: vendors } = useEventVendors(event.id);
  const { data: runOfShow, isLoading: rosLoading } = useRunOfShow(event.id);
  const confirmedVendors = (vendors ?? []).filter((vendor) => vendor.status === "confirmed").length;
  const openTasks = (checklist ?? []).filter((item) => !item.completed).slice(0, 5);
  const upcomingCues = [...(runOfShow ?? [])]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <section aria-label="Event summary" className="grid gap-5 md:grid-cols-3">
        <SummaryCardLink href={eventTabHref(event.id, "checklist")} label="Open event readiness details in Checklist">
          <ReadinessRing value={health?.readiness ?? 0} size={86} label={`${event.title} readiness`} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">Event Readiness</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {health ? `${health.vendorsConfirmed} of ${health.vendorsTotal} vendors confirmed` : "Calculating event progress"}
            </p>
          </div>
        </SummaryCardLink>

        <SummaryCardLink href={eventTabHref(event.id, "vendors")} label="Open Vendors">
          <Store className="size-8 shrink-0 text-[#9a6a00]" />
          <div>
            <p className="text-lg font-bold text-foreground">Vendors</p>
            <p data-numeric className="mt-2 text-4xl font-extrabold leading-none text-foreground">{confirmedVendors} / {vendors?.length ?? 0}</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">Confirmed</p>
          </div>
        </SummaryCardLink>

        <SummaryCardLink href={eventTabHref(event.id, "registrations")} label="Open Registrations">
          <Users className="size-8 shrink-0 text-[#9a6a00]" />
          <div>
            <p className="text-lg font-bold text-foreground">Registrations</p>
            <p data-numeric className="mt-2 text-4xl font-extrabold leading-none text-foreground">{event.registrationCount}</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">Registered</p>
          </div>
        </SummaryCardLink>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel className="min-h-[22rem] overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-5">
            <div className="flex items-center gap-3"><CheckSquare className="size-5 text-primary-text" /><h2 className="text-lg font-bold text-foreground">Next Steps</h2></div>
            <Link href={eventTabHref(event.id, "checklist")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">View All Tasks <ArrowRight className="size-4" /></Link>
          </div>
          {checklistLoading ? (
            <LoadingRows rows={5} className="p-4" />
          ) : openTasks.length === 0 ? (
            <EmptyState icon={CheckSquare} title="Everything is complete" description="New open tasks will appear here." />
          ) : (
            <ul className="divide-y divide-hairline px-6">
              {openTasks.map((item) => (
                <li key={item.id}>
                  <Link href={eventTabHref(event.id, "checklist")} className="flex items-center gap-4 py-3.5 text-base hover:text-primary-text">
                    <span className="size-4 shrink-0 rounded-[3px] border border-muted-foreground/45 bg-white" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.title}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="min-h-[22rem] overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-5">
            <div className="flex items-center gap-3"><ClipboardList className="size-5 text-primary-text" /><h2 className="text-lg font-bold text-foreground">Run of Show</h2></div>
            <Link href={eventTabHref(event.id, "run-of-show")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">View Full Schedule <ArrowRight className="size-4" /></Link>
          </div>
          {rosLoading ? (
            <LoadingRows rows={5} className="p-4" />
          ) : upcomingCues.length === 0 ? (
            <EmptyState icon={Clock} title="No schedule yet" description="Add the first cue in Run of Show." />
          ) : (
            <ol className="relative px-7 py-4 before:absolute before:bottom-7 before:left-[2.2rem] before:top-7 before:w-px before:bg-primary">
              {upcomingCues.map((cue) => (
                <li key={cue.id} className="relative flex items-center gap-4 py-3">
                  <span className="relative z-10 size-4 shrink-0 rounded-full border-[3px] border-primary bg-white" aria-hidden="true" />
                  <time data-numeric className="w-20 shrink-0 font-mono text-sm font-bold text-foreground">{formatClockTime(cue.startTime)}</time>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{cue.title}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>
    </div>
  );
}
