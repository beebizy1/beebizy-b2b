import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Event } from "@/data/entities";
import SpreadsheetImporter from "@/screens/import/SpreadsheetImporter";

/** Adds any recognized planning sheets to an event that is already being built. */
export default function EventSpreadsheetImportDialog({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FileSpreadsheet className="mr-1.5 size-3.5" />
          Import spreadsheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Import planning records into {event.title}</DialogTitle>
          <DialogDescription>
            Upload Excel, CSV or a public Google Sheet and review every recognized record before adding it.
          </DialogDescription>
        </DialogHeader>
        <SpreadsheetImporter
          existingEvent={event}
          onBack={() => setOpen(false)}
          onComplete={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
