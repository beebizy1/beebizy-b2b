/**
 * Bulk-import guests onto an event from a spreadsheet.
 *
 * Every parsed row is shown, valid or not, with the reason a bad one can't be imported.
 * Only valid rows are sent. The server imports the full batch atomically, so a failed
 * spreadsheet never leaves a partial guest list behind.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, FileUp, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Pill } from "@/components/primitives";
import { useImportGuestRegistrations, useLoadGoogleSheet } from "@/data/hooks";
import {
  GUEST_CSV_TEMPLATE,
  parseGuestCsv,
  parseGuestTable,
  suggestGuestSpreadsheetTableIndex,
  type GuestImportColumnMapping,
} from "@/data/guestImport";
import { parseCsvTable, readSpreadsheetFile, type SpreadsheetTable } from "@/data/import";
import type { Event } from "@/data/entities";

const IGNORE_COLUMN = "__ignore__";

function ColumnPicker({
  label,
  value,
  headers,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | null;
  headers: string[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select disabled={disabled} value={value ?? IGNORE_COLUMN} onValueChange={(next) => onChange(next === IGNORE_COLUMN ? null : next)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={IGNORE_COLUMN}>Do not import</SelectItem>
          {headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function downloadTemplate() {
  const blob = new Blob([GUEST_CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "beebizy-guests-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function GuestCsvImportDialog({
  event,
  triggerLabel = "Import CSV",
  registrationStatus = "pending",
}: {
  event: Event;
  triggerLabel?: string;
  registrationStatus?: "pending" | "confirmed";
}) {
  const importGuests = useImportGuestRegistrations();
  const loadGoogleSheet = useLoadGoogleSheet();
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceRequest = useRef(0);
  const importInFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [spreadsheetTables, setSpreadsheetTables] = useState<SpreadsheetTable[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [googleUrl, setGoogleUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [readingSource, setReadingSource] = useState(false);
  const [mapping, setMapping] = useState<Partial<GuestImportColumnMapping>>({});

  const preview = useMemo(() => {
    if (source.trim()) return parseGuestCsv(source, mapping);
    const selectedSheet = spreadsheetTables[selectedSheetIndex];
    if (selectedSheet) return parseGuestTable(selectedSheet, mapping);
    return null;
  }, [mapping, selectedSheetIndex, source, spreadsheetTables]);
  /*
   * Say which columns were recognised, and show the optional ones in the preview.
   *
   * A HubSpot export carries company and lifecycle columns, and they are read and
   * imported onto the registration - but the preview listed only name and email, so the
   * two fields that decide how a guest is grouped at the door were applied without ever
   * being shown. An import preview that hides part of what it imports is not a preview.
   */
  const readColumns = preview
    ? [
        preview.matched.name ?? "no name column",
        preview.matched.contact ?? "no email column",
        preview.matched.attendance,
        preview.matched.organization,
        preview.matched.segment,
        preview.matched.notes,
        preview.matched.partySize,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const valid = preview?.rows.filter((row) => row.problem === null) ?? [];
  const ready = valid;
  const invalid = preview?.rows.filter((row) => row.problem !== null) ?? [];
  const peopleReady = ready.reduce((total, row) => total + row.partySize, 0);

  const replaceSource = (next: string) => {
    const currentHeaders = source.trim() ? parseCsvTable(source).headers : [];
    const nextHeaders = next.trim() ? parseCsvTable(next).headers : [];
    sourceRequest.current += 1;
    setReadingSource(false);
    setSource(next);
    setSpreadsheetTables([]);
    setSelectedSheetIndex(0);
    if (currentHeaders.join("\u0000") !== nextHeaders.join("\u0000")) setMapping({});
  };

  const replaceSpreadsheet = (tables: SpreadsheetTable[]) => {
    setSource("");
    setSpreadsheetTables(tables);
    setSelectedSheetIndex(suggestGuestSpreadsheetTableIndex(tables));
    setMapping({});
  };

  const setColumn = (field: keyof GuestImportColumnMapping, value: string | null) => {
    setMapping((current) => ({ ...current, [field]: value }));
  };

  const reset = () => {
    sourceRequest.current += 1;
    setSource("");
    setSpreadsheetTables([]);
    setSelectedSheetIndex(0);
    setGoogleUrl("");
    setReadingSource(false);
    setMapping({});
  };

  const runImport = async () => {
    if (ready.length === 0 || importInFlight.current) return;
    if (event.capacity !== null && event.registrationCount + peopleReady > event.capacity) {
      toast({
        title: "This import exceeds the event capacity",
        description: `${peopleReady} people are ready to import, but only ${Math.max(0, event.capacity - event.registrationCount)} places remain.`,
      });
      return;
    }
    importInFlight.current = true;
    setBusy(true);
    try {
      const imported = await importGuests.mutateAsync(ready.map((row) => ({
          eventId: event.id,
          name: row.name,
          contact: row.contact,
          notes: row.notes,
          status: registrationStatus,
          segment: row.segment,
          organization: row.organization,
          quantity: row.partySize,
          importedFields: row.importedFields,
      })));
      toast({
        title: `${imported.length} ${imported.length === 1 ? "row" : "rows"} imported`,
        description: `${peopleReady} ${peopleReady === 1 ? "person" : "people"} added${invalid.length ? `; ${invalid.length} row(s) skipped.` : "."}`,
      });
      importInFlight.current = false;
      setBusy(false);
      setOpen(false);
      reset();
    } catch (error) {
      toast({
        title: "Nothing was imported",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      importInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && (busy || importInFlight.current)) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import guests from Excel (.xlsx), CSV or Google Sheets</DialogTitle>
          <DialogDescription>
            Upload an existing guest list and review the suggested columns before importing. Guests import as {registrationStatus === "confirmed" ? "confirmed registrants" : "pending registrations"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5 rounded-lg border border-hairline bg-surface-sunken/40 p-3">
            <Label htmlFor="guest-google-sheet">Public Google Sheet</Label>
            <p className="text-xs text-muted-foreground">Set sharing to “Anyone with the link can view,” then paste the link.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="guest-google-sheet"
                type="url"
                value={googleUrl}
                onChange={(changeEvent) => setGoogleUrl(changeEvent.target.value)}
                disabled={busy || readingSource}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!googleUrl.trim() || readingSource || busy}
                onClick={() => {
                  const requestId = ++sourceRequest.current;
                  setReadingSource(true);
                  setSource("");
                  setSpreadsheetTables([]);
                  setSelectedSheetIndex(0);
                  setMapping({});
                  void loadGoogleSheet.mutateAsync(googleUrl).then((loaded) => {
                    if (sourceRequest.current !== requestId) return;
                    setSource(loaded.csv);
                    setReadingSource(false);
                  }, (error) => {
                    if (sourceRequest.current !== requestId) return;
                    setReadingSource(false);
                    toast({
                      title: "The Google Sheet could not be read",
                      description: error instanceof Error ? error.message : undefined,
                    });
                  });
                }}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5" aria-hidden="true" />
                {readingSource ? "Reading…" : "Load sheet"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              disabled={busy || readingSource}
              className="sr-only"
              onChange={async (changeEvent) => {
                const file = changeEvent.target.files?.[0];
                if (file) {
                  const requestId = ++sourceRequest.current;
                  setReadingSource(true);
                  setSource("");
                  setSpreadsheetTables([]);
                  setSelectedSheetIndex(0);
                  setMapping({});
                  try {
                    if (file.name.toLowerCase().endsWith(".csv")) {
                      const nextSource = await file.text();
                      if (sourceRequest.current === requestId) setSource(nextSource);
                    } else {
                      const tables = await readSpreadsheetFile(file);
                      if (sourceRequest.current === requestId) replaceSpreadsheet(tables);
                    }
                  } catch (error) {
                    if (sourceRequest.current !== requestId) return;
                    toast({
                      title: "The guest list could not be read",
                      description: error instanceof Error ? error.message : undefined,
                    });
                  } finally {
                    if (sourceRequest.current === requestId) setReadingSource(false);
                  }
                }
                changeEvent.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" disabled={readingSource || busy} onClick={() => fileInput.current?.click()}>
              <FileUp className="mr-1.5 size-3.5" aria-hidden="true" />
              {readingSource ? "Reading file…" : "Choose Excel (.xlsx) or CSV"}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 size-3.5" aria-hidden="true" />
              Download template
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="csv-source">Or paste CSV</Label>
              {spreadsheetTables.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setSpreadsheetTables([]);
                    setSelectedSheetIndex(0);
                    setMapping({});
                  }}
                >
                  Switch to pasted CSV
                </Button>
              ) : null}
            </div>
            <Textarea
              id="csv-source"
              value={source}
              onChange={(changeEvent) => replaceSource(changeEvent.target.value)}
              disabled={readingSource || busy || spreadsheetTables.length > 0}
              rows={5}
              placeholder={GUEST_CSV_TEMPLATE}
              className="font-mono text-xs"
            />
          </div>

          {preview ? (
            <>
              {spreadsheetTables.length > 0 ? (
                <div className="space-y-1.5 rounded-lg border border-hairline bg-surface-sunken/40 p-3">
                  <Label htmlFor="guest-workbook-sheet">Worksheet</Label>
                  <Select
                    disabled={busy}
                    value={String(selectedSheetIndex)}
                    onValueChange={(value) => {
                      setSelectedSheetIndex(Number(value));
                      setMapping({});
                    }}
                  >
                    <SelectTrigger id="guest-workbook-sheet" className="h-9 sm:max-w-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {spreadsheetTables.map((table, index) => (
                        <SelectItem key={`${table.name}-${index}`} value={String(index)}>{table.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Importing “{spreadsheetTables[selectedSheetIndex]?.name}”. Choose another worksheet if your guest list is on a different tab.
                  </p>
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border border-hairline bg-surface-sunken/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Match your columns</p>
                    <p className="text-xs text-muted-foreground">
                      Beebizy suggested these matches from the headers and cell values. Change any field before importing.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMapping({})} disabled={busy || Object.keys(mapping).length === 0}>
                    <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                    Reset suggestions
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ColumnPicker disabled={busy} label="Full name" value={preview.mapping.name} headers={preview.headers} onChange={(value) => setColumn("name", value)} />
                  <ColumnPicker disabled={busy} label="First name" value={preview.mapping.firstName} headers={preview.headers} onChange={(value) => setColumn("firstName", value)} />
                  <ColumnPicker disabled={busy} label="Last name" value={preview.mapping.lastName} headers={preview.headers} onChange={(value) => setColumn("lastName", value)} />
                  <ColumnPicker disabled={busy} label="Email (optional)" value={preview.mapping.contact} headers={preview.headers} onChange={(value) => setColumn("contact", value)} />
                  <ColumnPicker disabled={busy} label="RSVP response" value={preview.mapping.attendance} headers={preview.headers} onChange={(value) => setColumn("attendance", value)} />
                  <ColumnPicker disabled={busy} label="Attendee count" value={preview.mapping.partySize} headers={preview.headers} onChange={(value) => setColumn("partySize", value)} />
                  <ColumnPicker disabled={busy} label="Guest type" value={preview.mapping.segment} headers={preview.headers} onChange={(value) => setColumn("segment", value)} />
                  <ColumnPicker disabled={busy} label="Organization" value={preview.mapping.organization} headers={preview.headers} onChange={(value) => setColumn("organization", value)} />
                  <ColumnPicker disabled={busy} label="Notes" value={preview.mapping.notes} headers={preview.headers} onChange={(value) => setColumn("notes", value)} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={ready.length > 0 ? "success" : "neutral"}>{ready.length} rows · {peopleReady} people ready</Pill>
                {invalid.length > 0 ? <Pill tone="warning">{invalid.length} skipped</Pill> : null}
                <span className="text-muted-foreground">Read {readColumns}</span>
                <span className="text-muted-foreground">All {preview.headers.length} source columns will be kept.</span>
              </div>

              {preview.matched.name === null ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Choose a full-name column, or first-name and last-name columns, before importing.
                </p>
              ) : null}

              {preview.matched.name !== null && preview.matched.contact === null ? (
                <p className="rounded-lg border border-info/30 bg-info-tint px-3 py-2 text-xs text-info-text">
                  No email column is selected. These guests can still be imported and checked in, but Beebizy cannot email them invitations or confirmations.
                </p>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-lg border border-hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Line</TableHead>
                      {preview.headers.map((header) => <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>)}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.line}>
                        <TableCell data-numeric className="text-muted-foreground">
                          {row.line}
                        </TableCell>
                        {row.importedFields.map((field) => (
                          <TableCell key={field.label} className="max-w-64 truncate text-muted-foreground" title={field.value || undefined}>
                            {field.value || "-"}
                          </TableCell>
                        ))}
                        <TableCell>
                          {row.problem ? (
                            <Pill tone="warning">{row.problem}</Pill>
                          ) : (
                            <Pill tone="success">Ready</Pill>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={ready.length === 0 || busy || readingSource} onClick={() => void runImport()}>
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
            Import {ready.length > 0 ? `${ready.length} ${ready.length === 1 ? "row" : "rows"}` : "guests"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
