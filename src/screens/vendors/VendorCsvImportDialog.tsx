import { useMemo, useRef, useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/primitives";
import { useAddEventVendor, useCreateVendor, useVendors } from "@/data/hooks";
import { parseVendorCsv, VENDOR_CSV_TEMPLATE } from "@/data/vendorImport";
import { toast } from "@/hooks/use-toast";

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([VENDOR_CSV_TEMPLATE], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "beebizy-vendors-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function VendorCsvImportDialog({ eventId }: { eventId?: string }) {
  const create = useCreateVendor();
  const addToEvent = useAddEventVendor();
  const { data: existing } = useVendors();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => source.trim() ? parseVendorCsv(source) : null, [source]);
  const existingKeys = useMemo(() => new Set((existing ?? []).flatMap((vendor) => [vendor.name.toLowerCase(), vendor.contactEmail?.toLowerCase()].filter(Boolean) as string[])), [existing]);
  const ready = (preview?.rows ?? []).filter((row) => !row.problem && !existingKeys.has(row.name.toLowerCase()) && (!row.contactEmail || !existingKeys.has(row.contactEmail.toLowerCase())));
  const skipped = (preview?.rows.length ?? 0) - ready.length;

  const importRows = async () => {
    setBusy(true);
    let imported = 0;
    try {
      for (const row of ready) {
        const vendor = await create.mutateAsync({
          name: row.name,
          category: row.category,
          description: row.description,
          contactEmail: row.contactEmail,
          contactPhone: row.contactPhone,
          website: row.website,
          city: row.city,
          state: row.state,
          country: row.country,
        });
        if (eventId) {
          await addToEvent.mutateAsync({ eventId, draft: { vendorId: vendor.id } });
        }
        imported += 1;
      }
      toast({
        title: `${imported} ${imported === 1 ? "vendor" : "vendors"} imported${eventId ? " and added to this event" : ""}`,
        description: skipped ? `${skipped} duplicate or invalid row(s) were skipped.` : undefined,
      });
      setOpen(false);
      setSource("");
    } catch (error) {
      toast({ title: imported ? `Imported ${imported} before stopping` : "Nothing was imported", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm"><Upload className="mr-1.5 size-4" />Import vendor CSV</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import your existing vendors</DialogTitle>
          <DialogDescription>Export the vendor list from Excel or Google Sheets as CSV. Review every row before it is added to the shared vendor directory{eventId ? " and booked on this event" : ""}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setSource(await file.text()); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FileUp className="mr-1.5 size-4" />Choose CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-1.5 size-4" />Download template</Button>
          </div>
          <Textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder={VENDOR_CSV_TEMPLATE} rows={5} className="font-mono text-xs" aria-label="Vendor CSV contents" />
          {preview ? <>
            <div className="flex gap-2"><Pill tone={ready.length ? "success" : "neutral"}>{ready.length} ready</Pill>{skipped ? <Pill tone="warning">{skipped} skipped</Pill> : null}</div>
            <div className="max-h-72 overflow-auto rounded-lg border border-hairline">
              <Table><TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Vendor</TableHead><TableHead>Category</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{preview.rows.map((row) => {
                  const duplicate = existingKeys.has(row.name.toLowerCase()) || Boolean(row.contactEmail && existingKeys.has(row.contactEmail.toLowerCase()));
                  return <TableRow key={row.line}><TableCell>{row.line}</TableCell><TableCell>{row.name || "-"}</TableCell><TableCell>{row.category}</TableCell><TableCell>{row.contactEmail ?? "-"}</TableCell><TableCell><Pill tone={row.problem || duplicate ? "warning" : "success"}>{row.problem ?? (duplicate ? "Already saved" : "Ready")}</Pill></TableCell></TableRow>;
                })}</TableBody>
              </Table>
            </div>
          </> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!ready.length || busy} onClick={() => void importRows()}>Import {ready.length || ""} vendors</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
