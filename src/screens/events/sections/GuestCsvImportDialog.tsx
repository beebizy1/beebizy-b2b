/**
 * Bulk-import guests onto an event from a spreadsheet.
 *
 * Every parsed row is shown, valid or not, with the reason a bad one can't be imported.
 * Only valid rows are sent. Import runs sequentially so a capacity rejection from the
 * data layer stops the run with a truthful count of what did land, rather than firing
 * fifty writes and reporting a number nobody can reconcile.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useCreateGuest, useCreateRegistration } from "@/data/hooks";
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

export default function GuestCsvImportDialog({ event }: { event: Event }) {
  const createGuest = useCreateGuest();
  const createRegistration = useCreateRegistration();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => (source.trim() ? parseGuestCsv(source) : null), [source]);
  const valid = preview?.rows.filter((row) => row.problem === null) ?? [];
  const invalid = preview?.rows.filter((row) => row.problem !== null) ?? [];

  const reset = () => {
    setSource("");
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
          status: "pending",
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
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import guests from CSV</DialogTitle>
          <DialogDescription>
            Upload or paste a file with name and email columns. Everything imports as a pending registration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
                <span className="text-muted-foreground">
                  Read {preview.matched.name ?? "no name column"} / {preview.matched.contact ?? "no email column"}
                </span>
              </div>

              {preview.matched.name === null || preview.matched.contact === null ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Couldn't find a name and email column. Rename your headers to <code>name</code> and{" "}
                  <code>email</code>, or download the template.
                </p>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-lg border border-hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Line</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
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
