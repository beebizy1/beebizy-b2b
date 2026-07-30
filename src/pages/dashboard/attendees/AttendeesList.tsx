import { useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListAttendees,
  useCreateAttendee,
  useUpdateAttendee,
  useDeleteAttendee,
  getListAttendeesQueryKey,
  type Attendee,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Plus, Upload, Download, AlertCircle, CheckCircle2, FileText, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

type ParsedRow = {
  name: string;
  contact: string;
  notes: string;
  errors: string[];
};

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const firstLower = lines[0].toLowerCase();
  const hasHeader =
    firstLower.includes("name") || firstLower.includes("contact");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .filter((l) => l.trim())
    .map((line) => {
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

const TEMPLATE_CSV =
  "name,contact,notes\nJane Doe,jane@example.com,\nJohn Smith,+1 (555) 000-0001,VIP guest";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendees-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type ImportState =
  | { phase: "idle" }
  | { phase: "importing"; done: number; total: number }
  | { phase: "done"; succeeded: number; failed: number };

function EditAttendeeDialog({ attendee, open, onOpenChange }: { attendee: Attendee; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const updateAttendee = useUpdateAttendee();
  const [name, setName] = useState(attendee.name);
  const [contact, setContact] = useState(attendee.contact);
  const [notes, setNotes] = useState(attendee.notes ?? "");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setName(attendee.name);
      setContact(attendee.contact);
      setNotes(attendee.notes ?? "");
    }
    onOpenChange(next);
  };

  const handleSave = () => {
    if (!name.trim() || !contact.trim()) return;
    updateAttendee.mutate(
      { id: attendee.id, data: { name: name.trim(), contact: contact.trim(), notes: notes.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Attendee updated" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Failed to update attendee", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Attendee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</label>
            <Input className="mt-1.5" placeholder="jane@example.com or +1 (555) 000-0000" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
            <Textarea className="mt-1.5" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !contact.trim() || updateAttendee.isPending}>
            {updateAttendee.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendeesList() {
  const { data: attendees, isLoading, isError, error } = useListAttendees();
  const createAttendee = useCreateAttendee();
  const deleteAttendee = useDeleteAttendee();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attendee | null>(null);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteAttendee.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey() });
          toast({ title: "Attendee deleted" });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Failed to delete attendee", variant: "destructive" }),
      }
    );
  };

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast({ title: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setImportState({ phase: "idle" });
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseCsv(text));
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function runImport() {
    if (validRows.length === 0) return;
    setImportState({ phase: "importing", done: 0, total: validRows.length });
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        await new Promise<void>((resolve, reject) => {
          createAttendee.mutate(
            { data: { name: row.name, contact: row.contact, notes: row.notes || undefined } },
            { onSuccess: () => resolve(), onError: () => reject() }
          );
        });
        succeeded++;
      } catch {
        failed++;
      }
      setImportState({ phase: "importing", done: i + 1, total: validRows.length });
    }
    await queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey() });
    setImportState({ phase: "done", succeeded, failed });
  }

  function closeDialog() {
    if (importState.phase === "importing") return;
    setOpen(false);
    setRows([]);
    setFileName("");
    setImportState({ phase: "idle" });
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Attendees</h1>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
            <Link href="/dashboard/attendees/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Attendee
              </Button>
            </Link>
          </div>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Added On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <QueryError error={error} label="Failed to load attendees." />
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : attendees?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No attendees yet. Add one manually or import a CSV.
                  </TableCell>
                </TableRow>
              ) : (
                attendees?.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">{attendee.name}</TableCell>
                    <TableCell>{attendee.contact}</TableCell>
                    <TableCell className="text-muted-foreground">{attendee.notes || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(attendee.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingAttendee(attendee)}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(attendee)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Attendees from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns: <span className="font-mono text-xs">name, contact, notes</span>. Notes is optional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Drop zone */}
            {rows.length === 0 && importState.phase === "idle" && (
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
            )}

            {/* Template download */}
            {rows.length === 0 && importState.phase === "idle" && (
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download example template
              </button>
            )}

            {/* Preview table */}
            {rows.length > 0 && importState.phase !== "done" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{fileName}</p>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="default">{validRows.length} valid</Badge>
                    {invalidRows.length > 0 && (
                      <Badge variant="destructive">{invalidRows.length} with errors</Badge>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-6"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={i} className={row.errors.length > 0 ? "bg-destructive/5" : ""}>
                          <TableCell>
                            {row.errors.length > 0
                              ? <AlertCircle className="w-4 h-4 text-destructive" />
                              : <CheckCircle2 className="w-4 h-4 text-green-500" />
                            }
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.name || <span className="text-muted-foreground italic">empty</span>}
                          </TableCell>
                          <TableCell>
                            {row.contact || <span className="text-muted-foreground italic">empty</span>}
                            {row.errors.length > 0 && (
                              <p className="text-[10px] text-destructive mt-0.5">{row.errors.join(", ")}</p>
                            )}
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
                      <span>Importing…</span>
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
                    disabled={validRows.length === 0 || importState.phase === "importing"}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {importState.phase === "importing"
                      ? `Importing…`
                      : `Import ${validRows.length} attendee${validRows.length !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            )}

            {/* Done state */}
            {importState.phase === "done" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <div>
                  <p className="text-lg font-bold">Import complete</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {importState.succeeded} attendee{importState.succeeded !== 1 ? "s" : ""} imported successfully
                    {importState.failed > 0 && `, ${importState.failed} failed`}.
                  </p>
                </div>
                <Button onClick={closeDialog}>Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editingAttendee && (
        <EditAttendeeDialog
          attendee={editingAttendee}
          open={!!editingAttendee}
          onOpenChange={(next) => { if (!next) setEditingAttendee(null); }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this attendee. Existing registrations that reference them keep their existing record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteAttendee.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
