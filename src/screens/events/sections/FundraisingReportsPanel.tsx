import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingRows, Panel, PanelHeader } from "@/components/primitives";
import { useFundraisingReports } from "@/data/hooks";
import type { Event, FundraisingReports } from "@/data/entities";
import { csvCell, spreadsheetHtmlCell } from "@/data/spreadsheet";

const REPORTS: Array<{ key: keyof FundraisingReports; label: string }> = [
  { key: "bidders", label: "Bidders" },
  { key: "bids", label: "Bid history" },
  { key: "items", label: "Item results" },
  { key: "attendance", label: "Attendance" },
  { key: "grades", label: "Giving by grade" },
  { key: "payments", label: "Payments" },
  { key: "acknowledgments", label: "Donor acknowledgments" },
  { key: "historical", label: "Year over year" },
  { key: "familyHistory", label: "Family history" },
  { key: "itemIntelligence", label: "Item intelligence" },
];

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function FundraisingReportsPanel({ event }: { event: Event }) {
  const { data, isLoading } = useFundraisingReports(event.id);
  const [reportKey, setReportKey] = useState<keyof FundraisingReports>("bidders");
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const source = data?.[reportKey] ?? [];
    const term = filter.trim().toLowerCase();
    return term ? source.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(term))) : source;
  }, [data, filter, reportKey]);
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  const baseName = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${String(reportKey).replaceAll("_", "-")}`;
  const exportCsv = () => downloadFile(`${baseName}.csv`, [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  const exportExcel = () => {
    const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${columns.map((column) => `<th>${spreadsheetHtmlCell(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${spreadsheetHtmlCell(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    downloadFile(`${baseName}.xls`, html, "application/vnd.ms-excel");
  };
  return (
    <Panel>
      <PanelHeader title="Fundraising reports" description="Filter every report by person, grade, or in-room versus remote status, then export to CSV or Excel." actions={<div className="flex gap-2"><Button size="sm" variant="outline" disabled={!rows.length} onClick={exportCsv}><Download className="mr-1.5 size-4" />CSV</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={exportExcel}><FileSpreadsheet className="mr-1.5 size-4" />Excel</Button></div>} />
      <div className="flex flex-wrap gap-2 border-b border-hairline p-4">{REPORTS.map((report) => <Button key={report.key} size="sm" variant={reportKey === report.key ? "default" : "outline"} onClick={() => setReportKey(report.key)}>{report.label}</Button>)}</div>
      <div className="border-b border-hairline p-4"><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by name, grade, in room, remote, status..." /></div>
      {isLoading ? <LoadingRows rows={5} /> : rows.length === 0 ? <EmptyState icon={FileSpreadsheet} title="No report rows yet" description="This report populates as families donate, bid, check in, and pay." /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-hairline bg-surface-sunken">{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</th>)}</tr></thead><tbody className="divide-y divide-hairline">{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} className="whitespace-nowrap px-4 py-3">{typeof row[column] === "boolean" ? (row[column] ? "Yes" : "No") : String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>}
    </Panel>
  );
}
