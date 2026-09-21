import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/primitives";
import type { PublicAssignmentPayload } from "@/data/entities";
import { PublicFrame } from "./PublicEvent";

export default function PublicAssignment({ token }: { token: string }) {
  const [assignment, setAssignment] = useState<PublicAssignmentPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`/api/public/assignments/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<PublicAssignmentPayload> : null)
      .then((result) => { if (active) setAssignment(result); })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setAssignment(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  if (loading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!assignment) {
    return <PublicFrame><Panel><EmptyState icon={CheckCircle2} title="This assignment link is no longer active" description="The assignment may have been changed or removed. Ask the event organizer for a fresh link." /></Panel></PublicFrame>;
  }

  const date = new Date(assignment.eventDate).toLocaleDateString("en-US", { dateStyle: "full" });
  return (
    <PublicFrame>
      <Panel className="overflow-hidden">
        <div className="border-b border-hairline bg-primary-muted/40 p-6">
          <Pill tone="brand">{assignment.kind === "volunteer" ? "Volunteer shift" : "Checklist assignment"}</Pill>
          <h1 className="mt-3 text-2xl font-bold text-foreground">{assignment.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assigned to {assignment.assignee}</p>
        </div>
        <div className="space-y-4 p-6">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event</p><p className="mt-1 font-semibold text-foreground">{assignment.eventTitle}</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{date}</span>
            {assignment.startTime && assignment.endTime ? <span className="inline-flex items-center gap-1.5"><Clock3 className="size-4" />{assignment.dayNumber ? `Day ${assignment.dayNumber}, ` : ""}{assignment.startTime} - {assignment.endTime}</span> : null}
            {assignment.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{assignment.location}</span> : null}
          </div>
          {assignment.dueDate ? <p className="rounded-lg bg-warning-tint p-3 text-sm text-warning-text">Due {new Date(assignment.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })}</p> : null}
          {assignment.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{assignment.description}</p> : null}
          <p className="border-t border-hairline pt-4 text-xs text-muted-foreground">This private link only shows this assignment. Contact the event organizer if anything needs to change.</p>
        </div>
      </Panel>
    </PublicFrame>
  );
}
