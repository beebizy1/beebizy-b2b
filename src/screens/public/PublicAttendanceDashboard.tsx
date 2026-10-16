import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, CopyCheck, TrendingUp, Users } from "lucide-react";
import { EmptyState, LoadingRows, Panel, PanelHeader, StatTile } from "@/components/primitives";
import { SantaClaraLogo } from "@/components/SantaClaraLogo";
import type { PublicAttendanceDashboardPayload } from "@/data/entities";
import { formatInZone, timeZoneLabel } from "@/lib/datetime";
import { PublicFrame } from "./PublicEvent";

function Breakdown({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  tone: "primary" | "info";
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <Panel className="p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No attendance data available.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-4 text-xs">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">{row.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={tone === "primary" ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-info"}
                  style={{ width: `${Math.max(2, (row.count / maximum) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function PublicAttendanceDashboard({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<PublicAttendanceDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`/api/public/attendance/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<PublicAttendanceDashboardPayload> : null)
      .then((result) => { if (active) setDashboard(result); })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setDashboard(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  if (loading) return <PublicFrame><LoadingRows rows={6} /></PublicFrame>;
  if (!dashboard) {
    return (
      <PublicFrame>
        <Panel>
          <EmptyState
            icon={Users}
            title="This attendance dashboard is not available"
            description="Ask the event organizer for the current public dashboard link."
          />
        </Panel>
      </PublicFrame>
    );
  }

  const summary = dashboard.summary;
  return (
    <PublicFrame>
      <div className="space-y-6">
        <header className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 bg-[#f7f1e8] px-6 py-5 sm:px-8">
            <SantaClaraLogo className="w-48" />
          </div>
          <div className="space-y-4 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#8c1515]">Post-event attendance</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{dashboard.eventTitle}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatInZone(dashboard.eventDate, dashboard.timeZone, "full")} {timeZoneLabel(dashboard.timeZone, new Date(dashboard.eventDate))}
              </span>
              <span>Updated {formatInZone(dashboard.generatedAt, dashboard.timeZone, "full")}</span>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              Aggregate attendance only. Repeated full names are consolidated before totals are calculated.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Unique registrations" value={summary.uniqueRegistered} icon={Users} sublabel={`${summary.registrationRows} registration rows`} />
          <StatTile label="Unique attendees" value={summary.uniqueCheckedIn} icon={CheckCircle2} tone="success" sublabel={`${summary.checkedInRows} check-in records`} />
          <StatTile label="Attendance rate" value={`${summary.attendanceRate}%`} icon={TrendingUp} tone="success" sublabel={`${summary.noShows} did not check in`} />
          <StatTile label="Duplicates consolidated" value={summary.duplicateCheckedInRows} icon={CopyCheck} sublabel="Not counted twice" />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader title="Attendance overview" description="A privacy-safe summary with no attendee names or contact details" />
          <div className="grid gap-px bg-hairline sm:grid-cols-3">
            <div className="bg-card px-5 py-5 text-center">
              <p className="text-4xl font-bold tabular-nums text-foreground">{summary.uniqueCheckedIn}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People attended</p>
            </div>
            <div className="bg-card px-5 py-5 text-center">
              <p className="text-4xl font-bold tabular-nums text-foreground">{summary.noShows}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">No-shows</p>
            </div>
            <div className="bg-card px-5 py-5 text-center">
              <p className="text-4xl font-bold tabular-nums text-foreground">{summary.attendanceRate}%</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show rate</p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Breakdown title="Attendees by guest type" rows={dashboard.guestTypes} tone="primary" />
          <Breakdown title="Attendance records by source" rows={dashboard.registrationSources} tone="info" />
        </div>
      </div>
    </PublicFrame>
  );
}
