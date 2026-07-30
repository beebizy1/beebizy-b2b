import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useGetTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useAddTemplateChecklistItem,
  useUpdateTemplateChecklistItem,
  useDeleteTemplateChecklistItem,
  useAddTemplateRunOfShowItem,
  useUpdateTemplateRunOfShowItem,
  useDeleteTemplateRunOfShowItem,
  useAddTemplateBudgetItem,
  useUpdateTemplateBudgetItem,
  useDeleteTemplateBudgetItem,
  useSaveEventAsTemplate,
  getGetTemplateQueryKey,
  getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Trash2, Edit2, Check, X, ClipboardList, Clock, DollarSign, ArrowRight, Save,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { QueryError } from "@/components/QueryError";

const CATEGORIES = [
  "Conference", "Meetup", "Workshop", "Webinar", "Social",
  "Monthly Meetup", "Sales Kickoff", "Team Offsite",
  "Employee Engagement", "In-Store Activation", "Influencer Event",
  "General",
];
const EXPENSE_CATEGORIES = ["Venue", "Catering", "AV/Tech", "Staffing", "Marketing", "Decor", "Transportation", "Security", "Speaker Fees", "Printing", "Contingency", "Other"];
const REVENUE_CATEGORIES = ["Ticket Sales", "Sponsorship", "Registration Fees", "Grants", "Merchandise", "Other"];
const CHECKLIST_CATEGORIES = ["Venue", "Logistics", "Marketing", "AV/Tech", "Catering", "Staffing", "Communications", "Post-Event", "General"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function SaveAsTemplateDialog({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const saveAs = useSaveEventAsTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSave = () => {
    if (!name.trim()) return;
    saveAs.mutate(
      { id: eventId, data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          toast({ title: "Saved as template", description: name });
          setOpen(false);
          setName("");
        },
        onError: () => toast({ title: "Failed to save as template", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Save className="w-4 h-4" />
          Save as Template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Creates a reusable template from this event's checklist, run of show, and budget items (estimated amounts only).
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saveAs.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {saveAs.isPending ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditChecklistRow({ item, templateId, onDone, update, onInvalidate }: {
  item: { id: string; title: string; category: string };
  templateId: string;
  onDone: () => void;
  update: ReturnType<typeof useUpdateTemplateChecklistItem>;
  onInvalidate: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const { toast } = useToast();
  const save = () => {
    update.mutate({ id: templateId, itemId: item.id, data: { title, category } }, {
      onSuccess: () => { onInvalidate(); onDone(); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };
  return (
    <div className="px-5 py-3 bg-muted/20 flex items-center gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm flex-1" onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }} autoFocus />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {CHECKLIST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button size="icon" className="h-9 w-9" onClick={save} disabled={!title || update.isPending}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function EditRosRow({ item, templateId, onDone, update, onInvalidate }: {
  item: { id: string; startTime: string; duration?: number | null; title: string; responsible?: string | null };
  templateId: string;
  onDone: () => void;
  update: ReturnType<typeof useUpdateTemplateRunOfShowItem>;
  onInvalidate: () => void;
}) {
  const [time, setTime] = useState(item.startTime);
  const [dur, setDur] = useState(item.duration?.toString() ?? "");
  const [title, setTitle] = useState(item.title);
  const [resp, setResp] = useState(item.responsible ?? "");
  const { toast } = useToast();
  const save = () => {
    update.mutate({ id: templateId, itemId: item.id, data: { startTime: time, duration: dur ? parseInt(dur) : undefined, title, responsible: resp || undefined } }, {
      onSuccess: () => { onInvalidate(); onDone(); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };
  return (
    <div className="px-5 py-3 bg-muted/20 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-sm" />
        <Input type="number" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="Duration (min)" className="text-sm" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="text-sm md:col-span-2" autoFocus />
      </div>
      <div className="flex gap-2">
        <Input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Owner (optional)" className="text-sm flex-1" />
        <Button size="sm" onClick={save} disabled={!title || update.isPending} className="gap-1"><Check className="w-3.5 h-3.5" />Save</Button>
        <Button size="sm" variant="ghost" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

function EditBudgetRow({ item, templateId, onDone, update, onInvalidate }: {
  item: { id: string; name: string; category: string; type: string; estimatedAmount: number };
  templateId: string;
  onDone: () => void;
  update: ReturnType<typeof useUpdateTemplateBudgetItem>;
  onInvalidate: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const type = item.type as "expense" | "revenue";
  const [amt, setAmt] = useState(item.estimatedAmount.toString());
  const cats = type === "expense" ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES;
  const { toast } = useToast();
  const save = () => {
    update.mutate({ id: templateId, itemId: item.id, data: { name, category, type, estimatedAmount: parseFloat(amt) || 0 } }, {
      onSuccess: () => { onInvalidate(); onDone(); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };
  return (
    <div className="px-5 py-3 bg-muted/20 flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="text-sm flex-1" autoFocus />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$" className="text-sm w-28" />
      <Button size="icon" className="h-9 w-9" onClick={save} disabled={!name || update.isPending}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

export default function TemplateDetail() {
  const [, params] = useRoute("/dashboard/templates/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: template, isLoading, isError, error } = useGetTemplate(id);
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const addChecklist = useAddTemplateChecklistItem();
  const updateChecklist = useUpdateTemplateChecklistItem();
  const deleteChecklist = useDeleteTemplateChecklistItem();
  const addRunOfShow = useAddTemplateRunOfShowItem();
  const updateRunOfShow = useUpdateTemplateRunOfShowItem();
  const deleteRunOfShow = useDeleteTemplateRunOfShowItem();
  const addBudget = useAddTemplateBudgetItem();
  const updateBudget = useUpdateTemplateBudgetItem();
  const deleteBudget = useDeleteTemplateBudgetItem();

  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaCat, setMetaCat] = useState("");
  const [metaCap, setMetaCap] = useState("");

  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingRosId, setEditingRosId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newClTitle, setNewClTitle] = useState("");
  const [newClCategory, setNewClCategory] = useState("General");

  const [addingRos, setAddingRos] = useState(false);
  const [newRosTime, setNewRosTime] = useState("09:00");
  const [newRosDur, setNewRosDur] = useState("");
  const [newRosTitle, setNewRosTitle] = useState("");
  const [newRosResp, setNewRosResp] = useState("");

  const [addingBudget, setAddingBudget] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState("");
  const [newBudgetCat, setNewBudgetCat] = useState("Venue");
  const [newBudgetType, setNewBudgetType] = useState<"expense" | "revenue">("expense");
  const [newBudgetAmt, setNewBudgetAmt] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetTemplateQueryKey(id) });

  const startEditMeta = () => {
    if (!template) return;
    setMetaName(template.name);
    setMetaDesc(template.description ?? "");
    setMetaCat(template.category);
    setMetaCap(template.defaultCapacity?.toString() ?? "");
    setEditingMeta(true);
  };

  const saveMeta = () => {
    updateTemplate.mutate(
      { id, data: { name: metaName, description: metaDesc || undefined, category: metaCat, defaultCapacity: metaCap ? parseInt(metaCap) : undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTemplateQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setEditingMeta(false);
        },
        onError: () => toast({ title: "Failed to update template", variant: "destructive" }),
      }
    );
  };

  const handleDeleteTemplate = () => {
    deleteTemplate.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        setLocation("/dashboard/templates");
      },
      onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
    });
  };

  const saveChecklist = () => {
    if (!newClTitle.trim()) return;
    addChecklist.mutate(
      { id, data: { title: newClTitle, category: newClCategory, sortOrder: template?.checklistItems.length ?? 0 } },
      { onSuccess: () => { invalidate(); setNewClTitle(""); setAddingChecklist(false); }, onError: () => toast({ title: "Failed to add item", variant: "destructive" }) }
    );
  };

  const saveRos = () => {
    if (!newRosTitle.trim()) return;
    addRunOfShow.mutate(
      { id, data: { title: newRosTitle, startTime: newRosTime, duration: newRosDur ? parseInt(newRosDur) : undefined, responsible: newRosResp || undefined, sortOrder: template?.runOfShowItems.length ?? 0 } },
      { onSuccess: () => { invalidate(); setNewRosTitle(""); setNewRosDur(""); setNewRosResp(""); setAddingRos(false); }, onError: () => toast({ title: "Failed to add item", variant: "destructive" }) }
    );
  };

  const saveBudget = () => {
    if (!newBudgetName.trim()) return;
    addBudget.mutate(
      { id, data: { name: newBudgetName, category: newBudgetCat, type: newBudgetType, estimatedAmount: parseFloat(newBudgetAmt) || 0, sortOrder: template?.budgetItems.length ?? 0 } },
      { onSuccess: () => { invalidate(); setNewBudgetName(""); setNewBudgetAmt(""); setAddingBudget(false); }, onError: () => toast({ title: "Failed to add item", variant: "destructive" }) }
    );
  };

  if (isLoading) return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </AppLayout>
  );

  if (isError) return (
    <AppLayout>
      <QueryError error={error} label="Failed to load template." />
    </AppLayout>
  );

  if (!template) return (
    <AppLayout>
      <div className="p-8 text-center text-muted-foreground">Template not found.</div>
    </AppLayout>
  );

  const expenses = template.budgetItems.filter((b) => b.type === "expense");
  const revenues = template.budgetItems.filter((b) => b.type === "revenue");

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/templates">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Templates
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/events/new?template=${id}`}>
              <Button size="sm" className="gap-2">
                <ArrowRight className="w-4 h-4" />
                Use Template
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-2">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete template?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete "{template.name}" and all its items.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Metadata card */}
        <div className="bg-card border border-border rounded-xl p-6">
          {editingMeta ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                  <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</label>
                  <select value={metaCat} onChange={(e) => setMetaCat(e.target.value)} className="mt-1.5 w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
                <Textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} className="mt-1.5 h-20" />
              </div>
              <div className="w-48">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Capacity</label>
                <Input type="number" value={metaCap} onChange={(e) => setMetaCap(e.target.value)} placeholder="Optional" className="mt-1.5" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveMeta} disabled={!metaName || updateTemplate.isPending} className="gap-1">
                  <Check className="w-3.5 h-3.5" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingMeta(false)}><X className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">{template.name}</h1>
                  <Badge variant="secondary">{template.category}</Badge>
                  {template.defaultCapacity && <span className="text-xs text-muted-foreground">Capacity: {template.defaultCapacity}</span>}
                </div>
                {template.description && <p className="text-muted-foreground text-sm">{template.description}</p>}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />{template.checklistItems.length} checklist items</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{template.runOfShowItems.length} run of show</span>
                  <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{template.budgetItems.length} budget items</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={startEditMeta}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
            </div>
          )}
        </div>

        {/* Checklist Items */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 bg-muted/30">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Checklist Items</span>
            <span className="text-xs text-muted-foreground ml-1">({template.checklistItems.length})</span>
          </div>
          <div className="divide-y divide-border">
            {template.checklistItems.map((item) =>
              editingChecklistId === item.id ? (
                <EditChecklistRow key={item.id} item={item} templateId={id} onDone={() => setEditingChecklistId(null)} update={updateChecklist} onInvalidate={invalidate} />
              ) : (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between group hover:bg-muted/20">
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.category}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingChecklistId(item.id)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteChecklist.mutate({ id, itemId: item.id }, { onSuccess: invalidate })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              )
            )}
            {template.checklistItems.length === 0 && !addingChecklist && (
              <div className="px-5 py-4 text-sm text-muted-foreground">No checklist items yet.</div>
            )}
            {addingChecklist ? (
              <div className="px-5 py-3 bg-muted/20 space-y-2">
                <div className="flex gap-2">
                  <Input value={newClTitle} onChange={(e) => setNewClTitle(e.target.value)} placeholder="Task title" className="text-sm flex-1" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveChecklist(); if (e.key === "Escape") setAddingChecklist(false); }} />
                  <select value={newClCategory} onChange={(e) => setNewClCategory(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {CHECKLIST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveChecklist} disabled={!newClTitle || addChecklist.isPending} className="gap-1"><Plus className="w-3.5 h-3.5" />Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingChecklist(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-2">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground text-xs" onClick={() => setAddingChecklist(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add checklist item
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Run of Show */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 bg-muted/30">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Run of Show</span>
            <span className="text-xs text-muted-foreground ml-1">({template.runOfShowItems.length})</span>
          </div>
          <div className="divide-y divide-border">
            {template.runOfShowItems.map((item) =>
              editingRosId === item.id ? (
                <EditRosRow key={item.id} item={item} templateId={id} onDone={() => setEditingRosId(null)} update={updateRunOfShow} onInvalidate={invalidate} />
              ) : (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between group hover:bg-muted/20">
                  <div className="flex items-start gap-4">
                    <div className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0">{item.startTime}</div>
                    <div>
                      <div className="font-medium text-sm">{item.title}</div>
                      {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                      {item.responsible && <div className="text-xs text-muted-foreground">Owner: {item.responsible}</div>}
                    </div>
                    {item.duration && <div className="text-xs text-muted-foreground">{item.duration}min</div>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRosId(item.id)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteRunOfShow.mutate({ id, itemId: item.id }, { onSuccess: invalidate })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              )
            )}
            {template.runOfShowItems.length === 0 && !addingRos && (
              <div className="px-5 py-4 text-sm text-muted-foreground">No run of show items yet.</div>
            )}
            {addingRos ? (
              <div className="px-5 py-3 bg-muted/20 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Input type="time" value={newRosTime} onChange={(e) => setNewRosTime(e.target.value)} className="text-sm" />
                  <Input type="number" value={newRosDur} onChange={(e) => setNewRosDur(e.target.value)} placeholder="Duration (min)" className="text-sm" />
                  <Input value={newRosTitle} onChange={(e) => setNewRosTitle(e.target.value)} placeholder="Title" className="text-sm md:col-span-2" autoFocus />
                </div>
                <Input value={newRosResp} onChange={(e) => setNewRosResp(e.target.value)} placeholder="Owner / Responsible (optional)" className="text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveRos} disabled={!newRosTitle || addRunOfShow.isPending} className="gap-1"><Plus className="w-3.5 h-3.5" />Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingRos(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-2">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground text-xs" onClick={() => setAddingRos(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add run of show item
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Budget Items */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 bg-muted/30">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Budget Items</span>
            <span className="text-xs text-muted-foreground ml-1">({template.budgetItems.length})</span>
            {template.budgetItems.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                Est. {fmt(expenses.reduce((s, b) => s + b.estimatedAmount, 0))} exp · {fmt(revenues.reduce((s, b) => s + b.estimatedAmount, 0))} rev
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {template.budgetItems.map((item) =>
              editingBudgetId === item.id ? (
                <EditBudgetRow key={item.id} item={item} templateId={id} onDone={() => setEditingBudgetId(null)} update={updateBudget} onInvalidate={invalidate} />
              ) : (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between group hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.type === "expense" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                      {item.type}
                    </span>
                    <div>
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold tabular-nums">{fmt(item.estimatedAmount)}</div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingBudgetId(item.id)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteBudget.mutate({ id, itemId: item.id }, { onSuccess: invalidate })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </div>
              )
            )}
            {template.budgetItems.length === 0 && !addingBudget && (
              <div className="px-5 py-4 text-sm text-muted-foreground">No budget items yet.</div>
            )}
            {addingBudget ? (
              <div className="px-5 py-3 bg-muted/20 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <select value={newBudgetType} onChange={(e) => { const t = e.target.value as "expense" | "revenue"; setNewBudgetType(t); setNewBudgetCat(t === "expense" ? "Venue" : "Ticket Sales"); }} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="expense">Expense</option>
                    <option value="revenue">Revenue</option>
                  </select>
                  <Input value={newBudgetName} onChange={(e) => setNewBudgetName(e.target.value)} placeholder="Item name" className="text-sm" autoFocus />
                  <select value={newBudgetCat} onChange={(e) => setNewBudgetCat(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {(newBudgetType === "expense" ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input type="number" value={newBudgetAmt} onChange={(e) => setNewBudgetAmt(e.target.value)} placeholder="Estimated $" className="text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveBudget} disabled={!newBudgetName || addBudget.isPending} className="gap-1"><Plus className="w-3.5 h-3.5" />Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingBudget(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-2">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground text-xs" onClick={() => setAddingBudget(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add budget item
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
