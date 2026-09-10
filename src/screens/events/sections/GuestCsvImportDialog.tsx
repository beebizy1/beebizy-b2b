/**
 * Bulk-import guests onto an event from a spreadsheet.
 *
 * Every parsed row is shown, valid or not, with the reason a bad one can't be imported.
 * Only valid rows are sent. Import runs sequentially so a capacity rejection from the
 * data layer stops the run with a truthful count of what did land, rather than firing
 * fifty writes and reporting a number nobody can reconcile.
 */

import { useMemo, useRef, useState } from "react";
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
import { toast } from "@/hooks/use-toast";
import { Pill } from "@/components/primitives";
import { useCreateGuest, useCreateRegistration, useLoadGoogleSheet } from "@/data/hooks";
import { GUEST_CSV_TEMPLATE, parseGuestCsv } from "@/data/guestImport";
import type { Event } from "@/data/entities";

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
  const createGuest = useCreateGuest();
  const createRegistration = useCreateRegistration();
  const loadGoogleSheet = useLoadGoogleSheet();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => (source.trim() ? parseGuestCsv(source) : null), [source]);
  /*
   * Say which columns were recognised, and show the optional ones in the preview.
   *
   * A HubSpot export carries company and lifecycle columns, and they are read and
   * imported onto the registration - but the preview listed only name and email, so the
   * two fields that decide how a guest is grouped at the door were applied without ever
   * being shown. An import preview that hides part of what it imports is not a preview.
   */
  const showOrganization = preview?.matched.organization != null;
  const showSegment = preview?.matched.segment != null;
  const readColumns = preview
    ? [
        preview.matched.name ?? "no name column",
        preview.matched.contact ?? "no email column",
        preview.matched.organization,
        preview.matched.segment,
        preview.matched.notes,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const valid = preview?.rows.filter((row) => row.problem === null) ?? [];
  const invalid = preview?.rows.filter((row) => row.problem !== null) ?? [];

  const reset = () => {
    setSource("");
    setGoogleUrl("");
    setBusy(false);
  };

  const runImport = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    let imported = 0;
    try {
      for (const row of valid) {
        const guest = await createGuest.mutateAsync({
          name: row.name,
          contact: row.contact,
          notes: row.notes,
        });
        await createRegistration.mutateAsync({
          eventId: event.id,
          guestId: guest.id,
          status: registrationStatus,
          segment: row.segment,
          organization: row.organization,
        });
        imported += 1;
      }
      toast({
        title: `${imported} ${imported === 1 ? "guest" : "guests"} imported`,
        description: invalid.length ? `${invalid.length} row(s) were skipped.` : undefined,
      });
      setOpen(false);
      reset();
    } catch (error) {
      // Capacity is enforced by the data layer, so this is the honest place to say how
      // far the run got before it was refused.
      toast({
        title: imported === 0 ? "Nothing was imported" : `Imported ${imported} before stopping`,
        description: error instanceof Error ? error.message : undefined,
      });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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

      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import guests from CSV</DialogTitle>
          <DialogDescription>
            Export a guest list from HubSpot or Google Sheets as CSV, then upload or paste it here. Guests import as {registrationStatus === "confirmed" ? "confirmed registrants" : "pending registrations"}.
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
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!googleUrl.trim() || loadGoogleSheet.isPending}
                onClick={() => {
                  void loadGoogleSheet.mutateAsync(googleUrl).then(
                    (loaded) => setSource(loaded.csv),
                    (error) => toast({
                      title: "The Google Sheet could not be read",
                      description: error instanceof Error ? error.message : undefined,
                    }),
                  );
                }}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5" aria-hidden="true" />
                {loadGoogleSheet.isPending ? "Reading…" : "Load sheet"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (changeEvent) => {
                const file = changeEvent.target.files?.[0];
                if (file) setSource(await file.text());
                changeEvent.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp className="mr-1.5 size-3.5" aria-hidden="true" />
              Choose file
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 size-3.5" aria-hidden="true" />
              Download template
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-source">Or paste CSV</Label>
            <Textarea
              id="csv-source"
              value={source}
              onChange={(changeEvent) => setSource(changeEvent.target.value)}
              rows={5}
              placeholder={GUEST_CSV_TEMPLATE}
              className="font-mono text-xs"
            />
          </div>

          {preview ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={valid.length > 0 ? "success" : "neutral"}>{valid.length} ready</Pill>
                {invalid.length > 0 ? <Pill tone="warning">{invalid.length} skipped</Pill> : null}
                <span className="text-muted-foreground">Read {readColumns}</span>
              </div>

              {preview.matched.name === null || preview.matched.contact === null ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Couldn't find a name and email column. Use <code>name</code> or <code>first name</code> and <code>last name</code>, plus <code>email</code>, or download the template.
                </p>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-lg border border-hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Line</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      {showOrganization ? <TableHead>Organization</TableHead> : null}
                      {showSegment ? <TableHead>Group</TableHead> : null}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.line}>
                        <TableCell data-numeric className="text-muted-foreground">
                          {row.line}
                        </TableCell>
                        <TableCell>{row.name || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-muted-foreground">{row.contact || "—"}</TableCell>
                        {showOrganization ? (
                          <TableCell className="text-muted-foreground">{row.organization || "—"}</TableCell>
                        ) : null}
                        {showSegment ? (
                          <TableCell className="text-muted-foreground">{row.segment || "—"}</TableCell>
                        ) : null}
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
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={valid.length === 0 || busy} onClick={() => void runImport()}>
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
            Import {valid.length > 0 ? valid.length : ""} {valid.length === 1 ? "guest" : "guests"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
