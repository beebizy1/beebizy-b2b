import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { RegistrationWithGuest } from "@/data/entities";
import { registrationCsv, registrationExportTable } from "@/data/registrationExport";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RegistrationDownloads({ rows, visible, eventTitle, loading }: { rows: RegistrationWithGuest[]; visible: RegistrationWithGuest[]; eventTitle: string; loading: boolean }) {
  const [filtered, setFiltered] = useState(false); const [busy, setBusy] = useState(false);
  const selected = filtered ? visible : rows;
  const filename = `${eventTitle.normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 90) || "event"}-registrations`;
  const disabled = loading || busy || !selected.length;
  async function excel() {
    setBusy(true);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const table = registrationExportTable(selected);
      const blob = await writeExcelFile(table, { sheet: "Registrations", stickyRowsCount: 1, columns: table[0]!.map(() => ({ width: 26 })) }).toBlob();
      download(blob, `${filename}.xlsx`);
    } catch (error) { toast({ title: "Couldn't download Excel", description: error instanceof Error ? error.message : "Try the CSV download." }); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface-sunken/30 px-5 py-3">
    <div className="space-y-1"><p className="text-sm font-medium">Download guest list</p><p className="text-xs text-muted-foreground">{selected.length} registration{selected.length === 1 ? "" : "s"}, including names, email, RSVP status and every answer.</p><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={filtered} disabled={busy} onChange={event => setFiltered(event.target.checked)} />Only guests matching the current filters</label></div>
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={disabled} onClick={() => download(new Blob([registrationCsv(selected)], { type: "text/csv;charset=utf-8" }), `${filename}.csv`)}><Download className="size-4" />Download CSV</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => void excel()}><FileSpreadsheet className="size-4" />{busy ? "Preparing Excel…" : "Download Excel"}</Button></div>
  </div>;
}
