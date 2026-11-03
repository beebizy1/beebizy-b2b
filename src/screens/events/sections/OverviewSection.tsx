/** Event overview shaped like an operating brief: status first, then the next work and schedule. */

import { Link } from "wouter";
import { ArrowRight, CheckSquare, ChevronRight, ClipboardList, Clock, Store, Users } from "lucide-react";
import { EmptyState, LoadingRows, Panel, ReadinessRing } from "@/components/primitives";
import { useChecklist, useEventVendors, useRunOfShow } from "@/data/hooks";
import { eventTabHref } from "@/app/shell/nav";
import type { Event, EventHealth } from "@/data/entities";
import { formatClockTime } from "@/lib/datetime";

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
        <Panel className="flex min-h-28 items-center gap-4 p-4">
          <ReadinessRing value={health?.readiness ?? 0} size={66} label={`${event.title} readiness`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Event Readiness</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {health ? `${health.vendorsConfirmed} of ${health.vendorsTotal} vendors confirmed` : "Calculating event progress"}
            </p>
          </div>
        </Panel>

        <Panel className="flex min-h-28 items-center gap-4 p-4">
          <Store className="size-7 shrink-0 text-[#9a6a00]" />
          <div>
            <p className="text-sm font-semibold text-foreground">Vendors</p>
            <p data-numeric className="mt-1 text-2xl font-bold leading-none text-foreground">{confirmedVendors} / {vendors?.length ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Confirmed</p>
          </div>
        </Panel>

        <Panel className="flex min-h-28 items-center gap-4 p-4">
          <Users className="size-7 shrink-0 text-[#9a6a00]" />
          <div>
            <p className="text-sm font-semibold text-foreground">Registrations</p>
            <p data-numeric className="mt-1 text-2xl font-bold leading-none text-foreground">{event.registrationCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Registered</p>
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2"><CheckSquare className="size-4 text-primary-text" /><h2 className="text-sm font-semibold text-foreground">Next Steps</h2></div>
            <Link href={eventTabHref(event.id, "checklist")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline">View All Tasks <ArrowRight className="size-3" /></Link>
          </div>
          {checklistLoading ? (
            <LoadingRows rows={5} className="p-4" />
          ) : openTasks.length === 0 ? (
            <EmptyState icon={CheckSquare} title="Everything is complete" description="New open tasks will appear here." />
          ) : (
            <ul className="divide-y divide-hairline px-4">
              {openTasks.map((item) => (
                <li key={item.id}>
                  <Link href={eventTabHref(event.id, "checklist")} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary-text">
                    <span className="size-3.5 shrink-0 rounded-[3px] border border-muted-foreground/45 bg-white" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.title}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2"><ClipboardList className="size-4 text-primary-text" /><h2 className="text-sm font-semibold text-foreground">Run of Show</h2></div>
            <Link href={eventTabHref(event.id, "run-of-show")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline">View Full Schedule <ArrowRight className="size-3" /></Link>
          </div>
          {rosLoading ? (
            <LoadingRows rows={5} className="p-4" />
          ) : upcomingCues.length === 0 ? (
            <EmptyState icon={Clock} title="No schedule yet" description="Add the first cue in Run of Show." />
          ) : (
            <ol className="relative px-5 py-3 before:absolute before:bottom-5 before:left-[1.65rem] before:top-5 before:w-px before:bg-primary/70">
              {upcomingCues.map((cue) => (
                <li key={cue.id} className="relative flex items-center gap-3 py-2">
                  <span className="relative z-10 size-3 shrink-0 rounded-full border-2 border-primary bg-white" aria-hidden="true" />
                  <time data-numeric className="w-16 shrink-0 font-mono text-xs font-semibold text-foreground">{formatClockTime(cue.startTime)}</time>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{cue.title}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>
    </div>
  );
}
