import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Loader2, Store, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import {
  useAddBudgetItem,
  useAddChecklistItem,
  useAddMoodBoardImage,
  useAddRunOfShowItem,
  useCreateEvent,
  useCreateGuest,
  useCreateRegistration,
  useCreateVendor,
  useAddEventVendor,
  useLoadGoogleSheet,
} from "@/data/hooks";
import {
  buildEventImportPlan,
  parseCsvTable,
  readSpreadsheetFile,
  type EventImportPlan,
} from "@/data/import";
import { EVENT_CATEGORIES } from "@/data/entities";
import { formatMoney } from "@/data/money";
import { formatClockTime } from "@/lib/datetime";
import { toast } from "@/hooks/use-toast";

function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateFromInput(value: string, hour: number): string {
  return new Date(`${value}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
}

function ImportedList({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline bg-primary-wash px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Pill tone="info">{count}</Pill>
      </div>
      <ul className="divide-y divide-hairline">{children}</ul>
    </section>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-tint hover:text-danger-text"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

export default function SpreadsheetImporter({ onBack }: { onBack: () => void }) {
  const [, navigate] = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<EventImportPlan | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const loadGoogleSheet = useLoadGoogleSheet();
  const createEvent = useCreateEvent();
  const createVendor = useCreateVendor();
  const addEventVendor = useAddEventVendor();
  const addBudget = useAddBudgetItem();
  const addChecklist = useAddChecklistItem();
  const addRunOfShow = useAddRunOfShowItem();
  const addMood = useAddMoodBoardImage();
  const createGuest = useCreateGuest();
  const createRegistration = useCreateRegistration();

  const readFile = async (file: File) => {
    setIsReading(true);
    try {
      const tables = await readSpreadsheetFile(file);
      setPlan(buildEventImportPlan(tables, file.name));
    } catch (error) {
      toast({ title: "The spreadsheet could not be read", description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsReading(false);
    }
  };

  const loadGoogle = async () => {
    try {
      const source = await loadGoogleSheet.mutateAsync(googleUrl);
      const table = parseCsvTable(source.csv, source.name);
      setPlan(buildEventImportPlan([table], source.name));
    } catch (error) {
      toast({ title: "The Google Sheet could not be read", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const createImportedEvent = async () => {
    if (!plan || !plan.event.title.trim()) return;
    setIsCreating(true);
    try {
      const created = await createEvent.mutateAsync(plan.event);
      const writes: Promise<unknown>[] = [
        ...plan.budget.map((draft) => addBudget.mutateAsync({ eventId: created.id, draft })),
        ...plan.checklist.map((draft) => addChecklist.mutateAsync({ eventId: created.id, draft })),
        ...plan.runOfShow.map((draft) => addRunOfShow.mutateAsync({ eventId: created.id, draft })),
        ...plan.moodBoard.map((reference) => addMood.mutateAsync({ eventId: created.id, ...reference })),
        ...plan.guests.map(async (draft) => {
          const guest = await createGuest.mutateAsync(draft);
          return createRegistration.mutateAsync({ eventId: created.id, guestId: guest.id, status: "confirmed" });
        }),
        // A service on the sheet becomes a vendor in the directory and a booking on this
        // event, so the fee lands on the budget rather than only in the address book.
        ...plan.vendors.map(async (imported) => {
          const vendor = await createVendor.mutateAsync(imported.vendor);
          return addEventVendor.mutateAsync({
            eventId: created.id,
            draft: { vendorId: vendor.id, feeCents: imported.feeCents, notes: imported.notes },
          });
        }),
      ];
      const results = await Promise.allSettled(writes);
      const failed = results.filter((result) => result.status === "rejected").length;
      toast({
        title: failed ? "Event created with some import issues" : "Spreadsheet imported",
        description: failed
          ? `${results.length - failed} of ${results.length} supporting records were added. Review the event workspace.`
          : "The event and its planning records are ready to review.",
      });
      navigate(`/app/events/${created.id}/plan`);
    } catch (error) {
      toast({ title: "The event could not be created", description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsCreating(false);
    }
  };

  if (!plan) {
    return (
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Bring an existing plan into Beebizy"
          description="Upload Excel or CSV, or paste a public Google Sheets link. Nothing is created until you review the result."
          actions={<Pill tone="info">Import</Pill>}
        />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className="group grid min-h-64 place-items-center rounded-2xl border-2 border-dashed border-primary/45 bg-primary-wash/70 p-8 text-center transition hover:border-primary hover:bg-primary-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                {isReading ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </span>
              <span className="mt-5 block text-lg font-bold text-foreground">Drop an Excel or CSV file</span>
              <span className="mt-2 block text-sm text-muted-foreground">Up to 10 MB. Multi-sheet Excel files are supported.</span>
              <span className="mt-4 inline-flex items-center rounded-full border border-primary/30 bg-surface px-3 py-1 text-xs font-semibold text-primary-text">
                Choose file
              </span>
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />

          <div className="flex min-h-64 flex-col justify-center rounded-2xl border border-hairline bg-surface p-7">
            <span className="grid size-12 place-items-center rounded-xl bg-primary-muted text-primary-text">
              <Link2 className="size-5" />
            </span>
            <h3 className="mt-5 text-lg font-bold text-foreground">Import a Google Sheet</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Set the sheet to “Anyone with the link can view,” then paste the link to the tab you want to import.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Input
                type="url"
                value={googleUrl}
                onChange={(event) => setGoogleUrl(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                aria-label="Google Sheets link"
                className="flex-1"
              />
              <Button onClick={() => void loadGoogle()} disabled={!googleUrl.trim() || loadGoogleSheet.isPending}>
                {loadGoogleSheet.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 size-4" />}
                Read sheet
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-hairline px-5 py-3">
          <Button variant="outline" onClick={onBack}>Back</Button>
        </div>
      </Panel>
    );
  }

  const supportingCount =
    plan.checklist.length +
    plan.runOfShow.length +
    plan.budget.length +
    plan.moodBoard.length +
    plan.guests.length +
    plan.vendors.length;
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Review the imported event"
          description={`${plan.sourceName} produced one draft event and ${supportingCount} supporting records.`}
          actions={<Pill tone="warning">Nothing saved yet</Pill>}
        />
        {plan.warnings.length > 0 ? (
          <div className="space-y-2 border-b border-warning/30 bg-warning-tint px-5 py-3">
            {plan.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2 text-sm text-warning-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />{warning}
              </p>
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="import-title">Event name</Label>
            <Input
              id="import-title"
              value={plan.event.title}
              onChange={(event) => setPlan({ ...plan, event: { ...plan.event, title: event.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-date">Event date</Label>
            <Input
              id="import-date"
              type="date"
              value={dateInputValue(plan.event.date)}
              onChange={(event) => setPlan({ ...plan, event: { ...plan.event, date: dateFromInput(event.target.value, 9) } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Event type</Label>
            <Select value={plan.event.category} onValueChange={(category) => setPlan({ ...plan, event: { ...plan.event, category } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...EVENT_CATEGORIES, plan.event.category])).map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="import-location">Location</Label>
            <Input
              id="import-location"
              value={plan.event.location ?? ""}
              onChange={(event) => setPlan({ ...plan, event: { ...plan.event, location: event.target.value || null } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-capacity">Expected guests</Label>
            <Input
              id="import-capacity"
              type="number"
              min={0}
              value={plan.event.capacity ?? ""}
              onChange={(event) => setPlan({ ...plan, event: { ...plan.event, capacity: event.target.value ? Number(event.target.value) : null } })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
            <Label htmlFor="import-description">Description</Label>
            <Textarea
              id="import-description"
              value={plan.event.description ?? ""}
              onChange={(event) => setPlan({ ...plan, event: { ...plan.event, description: event.target.value || null } })}
              rows={3}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ImportedList title="Services and vendors" count={plan.vendors.length}>
          {plan.vendors.map((imported, index) => (
            <li key={`${imported.vendor.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Store className="size-4 shrink-0 text-primary-text" />
              <span className="min-w-0 flex-1 truncate text-foreground">{imported.vendor.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[imported.vendor.category, imported.notes].filter(Boolean).join(" · ")}
              </span>
              {imported.feeCents == null ? null : (
                <span data-numeric className="text-xs font-medium text-foreground">
                  {formatMoney(imported.feeCents)}
                </span>
              )}
              <RemoveButton
                label={imported.vendor.name}
                onClick={() => setPlan({ ...plan, vendors: plan.vendors.filter((_, i) => i !== index) })}
              />
            </li>
          ))}
        </ImportedList>

        <ImportedList title="Checklist" count={plan.checklist.length}>
          {plan.checklist.map((item, index) => (
            <li key={`${item.title}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-primary-text" />
              <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.category}</span>
              <RemoveButton label={item.title} onClick={() => setPlan({ ...plan, checklist: plan.checklist.filter((_, itemIndex) => itemIndex !== index) })} />
            </li>
          ))}
        </ImportedList>

        <ImportedList title="Run of show" count={plan.runOfShow.length}>
          {plan.runOfShow.map((cue, index) => (
            <li key={`${cue.startTime}-${cue.title}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-16 shrink-0 font-mono text-xs font-semibold text-primary-text">{formatClockTime(cue.startTime)}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{cue.title}</span>
              <RemoveButton label={cue.title} onClick={() => setPlan({ ...plan, runOfShow: plan.runOfShow.filter((_, itemIndex) => itemIndex !== index) })} />
            </li>
          ))}
        </ImportedList>

        <ImportedList title="Budget" count={plan.budget.length}>
          {plan.budget.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
              <span data-numeric className="font-semibold text-foreground">{formatMoney(item.estimatedCents)}</span>
              <RemoveButton label={item.name} onClick={() => setPlan({ ...plan, budget: plan.budget.filter((_, itemIndex) => itemIndex !== index) })} />
            </li>
          ))}
        </ImportedList>

        <ImportedList title="Mood references and guests" count={plan.moodBoard.length + plan.guests.length}>
          {plan.moodBoard.map((reference, index) => (
            <li key={`${reference.url}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{reference.caption ?? reference.url}</span>
              <RemoveButton label="mood reference" onClick={() => setPlan({ ...plan, moodBoard: plan.moodBoard.filter((_, itemIndex) => itemIndex !== index) })} />
            </li>
          ))}
          {plan.guests.map((guest, index) => (
            <li key={`${guest.contact}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{guest.name}</span>
              <span className="truncate text-xs text-muted-foreground">{guest.contact}</span>
              <RemoveButton label={guest.name} onClick={() => setPlan({ ...plan, guests: plan.guests.filter((_, itemIndex) => itemIndex !== index) })} />
            </li>
          ))}
        </ImportedList>
      </div>

      <div className="flex flex-wrap justify-between gap-3 rounded-xl border border-hairline bg-surface p-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPlan(null)}>Choose another file</Button>
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
        </div>
        <Button onClick={() => void createImportedEvent()} disabled={!plan.event.title.trim() || isCreating}>
          {isCreating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 size-4" />}
          Create imported event
        </Button>
      </div>
    </div>
  );
}
