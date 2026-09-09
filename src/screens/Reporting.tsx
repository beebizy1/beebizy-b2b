import { useMemo, useState } from "react";
import { Download, FileChartColumn, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PageHeader, StatTile } from "@/components/primitives";
import { useCustomReport } from "@/data/hooks";
import { formatMoney, sumCents } from "@/data/money";
import { usePreferences } from "@/app/preferences";

const csvCell = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function Reporting() {
  const { date: formatDate } = usePreferences();
  const { data: rows, isLoading, isError, error, refetch } = useCustomReport();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => (status === "all" || row.status === status) && (category === "all" || row.category === category),
      ),
    [rows, status, category],
  );

  const exportCsv = () => {
    const headings = [
      "Event",
      "Date",
      "Status",
      "Category",
      "Location",
      "Registrations",
      "Capacity",
      "Readiness percent",
      "Budget planned",
      "Budget spent",
      "Revenue",
      "Open risks",
    ];
    const lines = filtered.map((row) =>
      [
        row.title,
        row.date,
        row.status,
        row.category,
        row.location,
        row.registrations,
        row.capacity,
        row.readiness,
        (row.budgetPlannedCents / 100).toFixed(2),
        (row.budgetSpentCents / 100).toFixed(2),
        (row.revenueCents / 100).toFixed(2),
        row.riskCount,
      ]
        .map(csvCell)
        .join(","),
    );
    const url = URL.createObjectURL(new Blob([[headings.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `beebizy-event-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom reporting"
        description="Filter the event portfolio and export a finance, attendance, readiness, and risk dataset."
        actions={
          <Button onClick={exportCsv} disabled={filtered.length === 0}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Events" value={filtered.length} icon={FileChartColumn} loading={isLoading} />
        <StatTile label="Registrations" value={filtered.reduce((total, row) => total + row.registrations, 0)} icon={FileChartColumn} loading={isLoading} />
        <StatTile label="Spend" value={formatMoney(sumCents(filtered.map((row) => row.budgetSpentCents)), { compact: true })} icon={FileChartColumn} loading={isLoading} />
        <StatTile label="Open risks" value={filtered.reduce((total, row) => total + row.riskCount, 0)} icon={TriangleAlert} loading={isLoading} />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load the report" onRetry={() => void refetch()} /> : null}

      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-hairline p-4">
          <label className="text-sm font-semibold text-foreground">
            Status
            <select className="ml-2 rounded-lg border border-input bg-background px-3 py-2 font-normal" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-foreground">
            Category
            <select className="ml-2 rounded-lg border border-input bg-background px-3 py-2 font-normal" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        {isLoading ? (
          <LoadingRows rows={5} className="p-4" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileChartColumn} title="No events match" description="Change the filters or add event data first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Attendance</th>
                  <th className="px-3 py-2 text-right font-semibold">Readiness</th>
                  <th className="px-3 py-2 text-right font-semibold">Plan</th>
                  <th className="px-3 py-2 text-right font-semibold">Spent</th>
                  <th className="px-5 py-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventId} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-foreground">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.date, "dayMonthYear")} · {row.category}</p>
                    </td>
                    <td className="px-3 py-3 capitalize">{row.status}</td>
                    <td className="px-3 py-3 text-right" data-numeric>{row.registrations}{row.capacity ? ` / ${row.capacity}` : ""}</td>
                    <td className="px-3 py-3 text-right" data-numeric>{row.readiness}%</td>
                    <td className="px-3 py-3 text-right" data-numeric>{formatMoney(row.budgetPlannedCents)}</td>
                    <td className="px-3 py-3 text-right" data-numeric>{formatMoney(row.budgetSpentCents)}</td>
                    <td className="px-5 py-3 text-right" data-numeric>{formatMoney(row.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
