import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pill } from "@/components/primitives";
import { toast } from "@/hooks/use-toast";
import { useAddVolunteer, useLoadGoogleSheet } from "@/data/hooks";
import { parseVolunteerTable, volunteerShiftImportKey, VOLUNTEER_CSV_TEMPLATE, type VolunteerImportPreview } from "@/data/volunteerImport";
import { parseCsvTable, readSpreadsheetFile } from "@/data/import";
import type { Event, VolunteerShift } from "@/data/entities";

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([VOLUNTEER_CSV_TEMPLATE], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "beebizy-volunteer-shifts-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function VolunteerCsvImportDialog({ event: eventRecord, existingShifts }: { event: Event; existingShifts: VolunteerShift[] }) {
  const addVolunteer = useAddVolunteer();
  const loadGoogleSheet = useLoadGoogleSheet();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<VolunteerImportPreview | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [completedKeys, setCompletedKeys] = useState<string[]>([]);
  const preview = useMemo(
    () => source.trim() ? parseVolunteerTable(parseCsvTable(source, "Volunteers"), { eventStartDate: eventRecord.date }) : spreadsheetPreview,
    [eventRecord.date, source, spreadsheetPreview],
  );
  const valid = preview?.rows.filter((row) => row.problem === null) ?? [];
  const invalid = preview?.rows.filter((row) => row.problem !== null) ?? [];
  const existingKeys = useMemo(() => new Set(existingShifts.map(volunteerShiftImportKey)), [existingShifts]);
  const completed = useMemo(() => new Set(completedKeys), [completedKeys]);
  const ready = valid.filter((row) => !existingKeys.has(volunteerShiftImportKey(row)) && !completed.has(volunteerShiftImportKey(row)));
  const duplicateCount = valid.length - ready.length;
  useEffect(() => setCompletedKeys([]), [source, spreadsheetPreview]);

  const reset = () => {
    setSource("");
    setSpreadsheetPreview(null);
    setGoogleUrl("");
    setBusy(false);
  };

  const runImport = async () => {
    if (ready.length === 0) return;
    setBusy(true);
    let imported = 0;
    const importedKeys = new Set(completedKeys);
    try {
      for (const { line: _line, problem: _problem, ...draft } of ready) {
        await addVolunteer.mutateAsync({ eventId: eventRecord.id, draft });
        importedKeys.add(volunteerShiftImportKey(draft));
        imported += 1;
      }
      toast({
        title: `${imported} volunteer ${imported === 1 ? "shift" : "shifts"} imported`,
        description: invalid.length ? `${invalid.length} row(s) were skipped.` : undefined,
      });
      setOpen(false);
      reset();
    } catch (caught) {
      setCompletedKeys([...importedKeys]);
      toast({
        title: imported ? `Imported ${imported} before stopping` : "Nothing was imported",
        description: caught instanceof Error ? caught.message : undefined,
      });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 size-3.5" aria-hidden="true" />Import volunteer sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import volunteer shifts</DialogTitle>
          <DialogDescription>
            Upload Excel or CSV, or load a public Google Sheet. Every valid row becomes an editable volunteer assignment with its contact, role, event day, time slot and notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5 rounded-lg border border-hairline bg-surface-sunken/40 p-3">
            <Label htmlFor="volunteer-google-sheet">Public Google Sheet</Label>
            <p className="text-xs text-muted-foreground">Set sharing to “Anyone with the link can view,” then paste the link.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="volunteer-google-sheet" type="url" value={googleUrl} onChange={(event) => setGoogleUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="min-w-0 flex-1" />
              <Button type="button" variant="outline" size="sm" disabled={!googleUrl.trim() || loadGoogleSheet.isPending} onClick={() => {
                void loadGoogleSheet.mutateAsync(googleUrl).then(
                  (loaded) => { setSpreadsheetPreview(null); setSource(loaded.csv); },
                  (caught) => toast({ title: "The Google Sheet could not be read", description: caught instanceof Error ? caught.message : undefined }),
                );
              }}>
                <FileSpreadsheet className="mr-1.5 size-3.5" />{loadGoogleSheet.isPending ? "Reading…" : "Load sheet"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                try {
                  if (file.name.toLowerCase().endsWith(".csv")) {
                    setSpreadsheetPreview(null);
                    setSource(await file.text());
                  } else {
                    const parsed = (await readSpreadsheetFile(file)).map((table) => parseVolunteerTable(table, { eventStartDate: eventRecord.date }));
                    const match = parsed.find((candidate) => candidate.matched.name && candidate.matched.role && candidate.matched.startTime && candidate.matched.endTime);
                    if (!match) throw new Error("No sheet with volunteer name, role, start time and end time columns was found.");
                    setSource("");
                    setSpreadsheetPreview(match);
                  }
                } catch (caught) {
                  toast({ title: "The volunteer sheet could not be read", description: caught instanceof Error ? caught.message : undefined });
                }
              }
              event.target.value = "";
            }} />
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FileUp className="mr-1.5 size-3.5" />Choose Excel or CSV</Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1.5 size-3.5" />Download template</Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="volunteer-csv-source">Or paste CSV</Label>
            <Textarea id="volunteer-csv-source" value={source} onChange={(event) => { setSpreadsheetPreview(null); setSource(event.target.value); }} rows={5} placeholder={VOLUNTEER_CSV_TEMPLATE} className="font-mono text-xs" />
          </div>

          {preview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={ready.length ? "success" : "neutral"}>{ready.length} ready</Pill>
                {invalid.length ? <Pill tone="warning">{invalid.length} skipped</Pill> : null}
                {duplicateCount ? <Pill tone="neutral">{duplicateCount} already imported</Pill> : null}
              </div>
              {preview.matched.name === null || preview.matched.role === null || preview.matched.startTime === null || preview.matched.endTime === null ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />The sheet needs volunteer name, role, start time and end time columns. Download the template for the exact format.
                </p>
              ) : null}
              <div className="max-h-72 overflow-auto rounded-lg border border-hairline">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-14">Line</TableHead><TableHead>Volunteer</TableHead><TableHead>Role</TableHead><TableHead>Shift</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.line}>
                        <TableCell data-numeric className="text-muted-foreground">{row.line}</TableCell>
                        <TableCell><span className="block font-medium">{row.name || "—"}</span><span className="block text-xs text-muted-foreground">{row.email ?? row.phone ?? "No contact"}</span></TableCell>
                        <TableCell>{row.role || "—"}</TableCell>
                        <TableCell data-numeric>{row.startTime && row.endTime ? `${row.dayNumber && row.dayNumber > 1 ? `Day ${row.dayNumber} · ` : ""}${row.startTime}–${row.endTime}` : "—"}</TableCell>
                        <TableCell>{row.problem ? <span className="text-xs text-warning-text">{row.problem}</span> : <Pill tone="success">Ready</Pill>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void runImport()} disabled={!ready.length || busy}>{busy ? "Importing…" : `Import ${ready.length || ""} shift${ready.length === 1 ? "" : "s"}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
