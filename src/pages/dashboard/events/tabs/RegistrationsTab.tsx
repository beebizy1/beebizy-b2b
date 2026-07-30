import { useRef, useState } from "react";
import {
  useListEventRegistrations,
  useCreateAttendee,
  useCreateRegistration,
  getListEventRegistrationsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  Upload, Download, AlertCircle, CheckCircle2, FileText,
  UserPlus, ExternalLink, Globe, Mail, Ticket, ClipboardCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type ParsedRow = { name: string; contact: string; notes: string; errors: string[] };

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const firstLower = lines[0].toLowerCase();
  const dataLines = (firstLower.includes("name") || firstLower.includes("contact")) ? lines.slice(1) : lines;
  return dataLines.filter((l) => l.trim()).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name = cols[0] ?? "";
    const contact = cols[1] ?? "";
    const notes = cols[2] ?? "";
    const errors: string[] = [];
    if (!name) errors.push("Name required");
    if (!contact) errors.push("Contact required");
    return { name, contact, notes, errors };
  });
}

const TEMPLATE_CSV = "name,contact,notes\nJane Doe,jane@example.com,\nJohn Smith,+1 (555) 000-0001,VIP guest";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "registrations-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const PLATFORMS = [
  {
    name: "Luma",
    url: "https://lu.ma",
    tagline: "Modern event pages with RSVP tracking and waitlists",
    description: "Create a Luma event page and sync RSVPs directly into Beebizy.",
    color: "from-indigo-500 to-violet-600",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    icon: Globe,
    iconColor: "text-indigo-600",
  },
  {
    name: "Paperless Post",
    url: "https://paperlesspost.com",
    tagline: "Digital invitations with real-time RSVP tracking",
    description: "Send beautiful digital invites and pull your guest list into Beebizy automatically.",
    color: "from-rose-500 to-pink-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
    icon: Mail,
    iconColor: "text-rose-600",
  },
  {
    name: "Eventbrite",
    url: "https://eventbrite.com",
    tagline: "Ticketing and paid registration pages",
    description: "Sell tickets on Eventbrite and sync attendee data into your Beebizy event.",
    color: "from-orange-500 to-amber-500",
    bg: "bg-orange-50",
    border: "border-orange-100",
    icon: Ticket,
    iconColor: "text-orange-600",
  },
  {
    name: "RSVPify",
    url: "https://rsvpify.com",
    tagline: "Custom RSVP forms and guest management",
    description: "Build custom RSVP flows and import confirmed guests into Beebizy.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50",
    border: "border-blue-100",
    icon: ClipboardCheck,
    iconColor: "text-blue-600",
  },
];

type ImportState =
  | { phase: "idle" }
  | { phase: "importing"; done: number; total: number }
  | { phase: "done"; succeeded: number; failed: number };

export function RegistrationsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: registrations, isLoading } = useListEventRegistrations(eventId, {
    query: { queryKey: getListEventRegistrationsQueryKey(eventId) },
  });
  const createAttendee = useCreateAttendee();
  const createRegistration = useCreateRegistration();

  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addName, setAddName] = useState("");
  const [addContact, setAddContact] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListEventRegistrationsQueryKey(eventId) });

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast({ title: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setImportState({ phase: "idle" });
    const reader = new FileReader();
    reader.onload = (e) => setRows(parseCsv(e.target?.result as string));
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function runImport() {
    if (!validRows.length) return;
    setImportState({ phase: "importing", done: 0, total: validRows.length });
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < validRows.length; i++) {
      try {
        const row = validRows[i];
        const attendee = await new Promise<{ id: string }>((res, rej) =>
          createAttendee.mutate(
            { data: { name: row.name, contact: row.contact, notes: row.notes || undefined } },
            { onSuccess: res, onError: rej }
          )
        );
        await new Promise<void>((res, rej) =>
          createRegistration.mutate(
            { data: { eventId, attendeeId: attendee.id } },
            { onSuccess: () => res(), onError: rej }
          )
        );
        succeeded++;
      } catch {
        failed++;
      }
      setImportState({ phase: "importing", done: i + 1, total: validRows.length });
    }
    await invalidate();
    setImportState({ phase: "done", succeeded, failed });
  }

  function closeCsvDialog() {
    if (importState.phase === "importing") return;
    setCsvOpen(false);
    setRows([]);
    setFileName("");
    setImportState({ phase: "idle" });
  }

  async function handleManualAdd() {
    if (!addName.trim() || !addContact.trim()) return;
    setAddSaving(true);
    try {
      const attendee = await new Promise<{ id: string }>((res, rej) =>
        createAttendee.mutate(
          { data: { name: addName.trim(), contact: addContact.trim(), notes: addNotes.trim() || undefined } },
          { onSuccess: res, onError: rej }
        )
      );
      await new Promise<void>((res, rej) =>
        createRegistration.mutate(
          { data: { eventId, attendeeId: attendee.id } },
          { onSuccess: () => res(), onError: rej }
        )
      );
      await invalidate();
      toast({ title: `${addName.trim()} registered` });
      setAddName(""); setAddContact(""); setAddNotes("");
      setAddOpen(false);
    } catch {
      toast({ title: "Failed to add registration", variant: "destructive" });
    } finally {
      setAddSaving(false);
    }
  }

  const confirmed = registrations?.filter((r) => r.status === "confirmed").length ?? 0;
  const pending = registrations?.filter((r) => r.status !== "confirmed").length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Registrations</h2>
          {!isLoading && registrations && (
            <div className="flex gap-2">
              <Badge variant="default">{confirmed} confirmed</Badge>
              {pending > 0 && <Badge variant="secondary">{pending} pending</Badge>}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setCsvOpen(true)}>
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4" /> Add Guest
          </Button>
        </div>
      </div>

      {/* Registration table */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                </TableRow>
              ))
            ) : registrations?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserPlus className="w-8 h-8 opacity-25" />
                    <span className="text-sm">No registrations yet.</span>
                    <div className="flex gap-2 mt-1">
                      <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>Import CSV</Button>
                      <Button size="sm" onClick={() => setAddOpen(true)}>Add Guest</Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              registrations?.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell>
                    <div className="font-medium">{reg.attendee.name}</div>
                    <div className="text-xs text-muted-foreground">{reg.attendee.contact}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={reg.status === "confirmed" ? "default" : "secondary"} className="capitalize">
                      {reg.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(reg.registeredAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invitation platforms */}
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold">Invitation Platforms</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect your invitation tool to sync RSVPs directly into this event.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLATFORMS.map((p) => (
            <div key={p.name} className={`rounded-xl border ${p.border} ${p.bg} p-5 flex gap-4`}>
              <div className={`w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0`}>
                <p.icon className={`w-5 h-5 ${p.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-sm">{p.name}</p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{p.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-semibold bg-white"
                  onClick={() =>
                    toast({
                      title: `${p.name} integration coming soon`,
                      description: `Connect your ${p.name} account to sync RSVPs automatically.`,
                    })
                  }
                >
                  Connect & Sync
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={csvOpen} onOpenChange={(v) => { if (!v) closeCsvDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Registrations from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns: <span className="font-mono text-xs">name, contact, notes</span>. Each row creates a guest and registers them for this event.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {rows.length === 0 && importState.phase === "idle" && (
              <>
                <div
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <FileText className="w-10 h-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-semibold text-sm">Drop your CSV here, or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Accepts .csv files</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download example template
                </button>
              </>
            )}

            {rows.length > 0 && importState.phase !== "done" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{fileName}</p>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="default">{validRows.length} valid</Badge>
                    {invalidRows.length > 0 && <Badge variant="destructive">{invalidRows.length} with errors</Badge>}
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-6" />
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={i} className={row.errors.length ? "bg-destructive/5" : ""}>
                          <TableCell>
                            {row.errors.length
                              ? <AlertCircle className="w-4 h-4 text-destructive" />
                              : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          </TableCell>
                          <TableCell className="font-medium">{row.name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                          <TableCell>
                            {row.contact || <span className="text-muted-foreground italic">empty</span>}
                            {row.errors.length > 0 && <p className="text-[10px] text-destructive mt-0.5">{row.errors.join(", ")}</p>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {importState.phase === "importing" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Registering guests…</span>
                      <span>{importState.done} / {importState.total}</span>
                    </div>
                    <Progress value={(importState.done / importState.total) * 100} />
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setRows([]); setFileName(""); }}
                    disabled={importState.phase === "importing"}
                  >
                    Choose a different file
                  </button>
                  <Button
                    onClick={runImport}
                    disabled={!validRows.length || importState.phase === "importing"}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {importState.phase === "importing"
                      ? "Registering…"
                      : `Register ${validRows.length} guest${validRows.length !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            )}

            {importState.phase === "done" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <div>
                  <p className="text-lg font-bold">Import complete</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {importState.succeeded} guest{importState.succeeded !== 1 ? "s" : ""} registered
                    {importState.failed > 0 && `, ${importState.failed} failed`}.
                  </p>
                </div>
                <Button onClick={closeCsvDialog}>Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Guest Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) { setAddName(""); setAddContact(""); setAddNotes(""); setAddOpen(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Guest</DialogTitle>
            <DialogDescription>
              Enter the guest's details to register them for this event.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
              <Input
                className="mt-1.5"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleManualAdd(); }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</label>
              <Input
                className="mt-1.5"
                placeholder="jane@example.com or +1 (555) 000-0000"
                value={addContact}
                onChange={(e) => setAddContact(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleManualAdd(); }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes (Optional)</label>
              <Input
                className="mt-1.5"
                placeholder="Dietary restrictions, VIP status, etc."
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleManualAdd(); }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
            <Button
              onClick={handleManualAdd}
              disabled={!addName.trim() || !addContact.trim() || addSaving}
              className="gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {addSaving ? "Registering…" : "Register Guest"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
