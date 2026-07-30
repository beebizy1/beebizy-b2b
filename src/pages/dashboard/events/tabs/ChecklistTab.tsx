import { useState } from "react";
import {
  useListChecklist,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  getListChecklistQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, Trash2, CheckSquare, Square, ClipboardList, Library, Check, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

const CATEGORIES = ["General", "Venue", "Catering", "AV/Tech", "Staffing", "Marketing", "Logistics", "Safety"];

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Venue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Catering: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  "AV/Tech": "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  Staffing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
  Marketing: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  Logistics: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Safety: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

interface LibraryItem { title: string; category: string }

const LIBRARY: LibraryItem[] = [
  { title: "Book venue / conference space", category: "Venue" },
  { title: "Confirm venue capacity", category: "Venue" },
  { title: "Visit venue for site inspection", category: "Venue" },
  { title: "Arrange parking logistics", category: "Venue" },
  { title: "Check ADA accessibility", category: "Venue" },
  { title: "Confirm setup and breakdown times", category: "Venue" },
  { title: "Arrange venue insurance certificate", category: "Venue" },
  { title: "Book AV equipment", category: "AV/Tech" },
  { title: "Test sound system", category: "AV/Tech" },
  { title: "Arrange projector / screens", category: "AV/Tech" },
  { title: "Set up livestream / recording", category: "AV/Tech" },
  { title: "Test internet connectivity", category: "AV/Tech" },
  { title: "Arrange backup equipment on-site", category: "AV/Tech" },
  { title: "Arrange stage lighting", category: "AV/Tech" },
  { title: "Confirm menu with caterer", category: "Catering" },
  { title: "Arrange dietary options (vegan, gluten-free, etc.)", category: "Catering" },
  { title: "Plan catering staff count", category: "Catering" },
  { title: "Arrange bar / beverage service", category: "Catering" },
  { title: "Coordinate catering setup / breakdown time", category: "Catering" },
  { title: "Order coffee and snacks for registration", category: "Catering" },
  { title: "Create event page / website", category: "Marketing" },
  { title: "Send save-the-date emails", category: "Marketing" },
  { title: "Launch social media campaign", category: "Marketing" },
  { title: "Design promotional materials", category: "Marketing" },
  { title: "Send final reminder to attendees", category: "Marketing" },
  { title: "Arrange event photography / videography", category: "Marketing" },
  { title: "Press release / media outreach", category: "Marketing" },
  { title: "Confirm event manager assignment", category: "Staffing" },
  { title: "Recruit and brief volunteers", category: "Staffing" },
  { title: "Brief security team", category: "Staffing" },
  { title: "Assign staff roles and responsibilities", category: "Staffing" },
  { title: "Create staff schedule", category: "Staffing" },
  { title: "Create event run of show", category: "Logistics" },
  { title: "Order name badges / lanyards", category: "Logistics" },
  { title: "Arrange transportation / shuttle service", category: "Logistics" },
  { title: "Set up registration desk", category: "Logistics" },
  { title: "Print directions and venue signage", category: "Logistics" },
  { title: "Coordinate gift bags / swag", category: "Logistics" },
  { title: "First aid kit on-site", category: "Safety" },
  { title: "Emergency contact list distributed", category: "Safety" },
  { title: "Fire exits and safety briefing", category: "Safety" },
  { title: "Send thank-you emails to attendees", category: "General" },
  { title: "Collect attendee feedback / survey", category: "General" },
  { title: "Write event summary report", category: "General" },
  { title: "Review event financials vs. budget", category: "General" },
  { title: "Archive event materials and photos", category: "General" },
];

interface ChecklistPackage {
  id: string;
  name: string;
  description: string;
  emoji: string;
  cardClass: string;
  tasks: string[];
}

const PACKAGES: ChecklistPackage[] = [
  {
    id: "corporate_conference",
    name: "Corporate Conference",
    description: "Full-scale conference or summit",
    emoji: "🏛",
    cardClass: "border-blue-200 bg-blue-50/70 hover:bg-blue-50",
    tasks: [
      "Book venue / conference space", "Confirm venue capacity", "Book AV equipment",
      "Test sound system", "Arrange projector / screens", "Set up livestream / recording",
      "Confirm menu with caterer", "Arrange dietary options (vegan, gluten-free, etc.)",
      "Arrange bar / beverage service", "Create event page / website",
      "Send save-the-date emails", "Design promotional materials",
      "Send final reminder to attendees", "Arrange event photography / videography",
      "Confirm event manager assignment", "Brief security team",
      "Create event run of show", "Order name badges / lanyards",
      "Set up registration desk", "Print directions and venue signage", "First aid kit on-site",
    ],
  },
  {
    id: "workshop_training",
    name: "Workshop / Training",
    description: "Internal or external skills workshop",
    emoji: "📚",
    cardClass: "border-purple-200 bg-purple-50/70 hover:bg-purple-50",
    tasks: [
      "Book venue / conference space", "Book AV equipment", "Test sound system",
      "Arrange projector / screens", "Test internet connectivity",
      "Confirm menu with caterer", "Order coffee and snacks for registration",
      "Send save-the-date emails", "Send final reminder to attendees",
      "Assign staff roles and responsibilities", "Create event run of show",
      "Set up registration desk",
    ],
  },
  {
    id: "team_building",
    name: "Team Building Day",
    description: "Social, offsite, or team bonding event",
    emoji: "🤝",
    cardClass: "border-green-200 bg-green-50/70 hover:bg-green-50",
    tasks: [
      "Book venue / conference space", "Arrange parking logistics",
      "Confirm menu with caterer", "Arrange bar / beverage service",
      "Order coffee and snacks for registration", "Send save-the-date emails",
      "Send final reminder to attendees", "Arrange event photography / videography",
      "Arrange transportation / shuttle service", "Create event run of show",
      "First aid kit on-site",
    ],
  },
  {
    id: "product_launch",
    name: "Product Launch",
    description: "Press event, demo day, or announcement",
    emoji: "🚀",
    cardClass: "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
    tasks: [
      "Book venue / conference space", "Book AV equipment", "Test sound system",
      "Arrange projector / screens", "Set up livestream / recording", "Arrange stage lighting",
      "Confirm menu with caterer", "Arrange bar / beverage service",
      "Create event page / website", "Send save-the-date emails",
      "Launch social media campaign", "Design promotional materials",
      "Press release / media outreach", "Arrange event photography / videography",
      "Confirm event manager assignment", "Create event run of show",
      "Order name badges / lanyards", "Set up registration desk",
    ],
  },
  {
    id: "nonprofit_fundraiser",
    name: "Nonprofit Fundraiser",
    description: "Charity gala, community event, or donor night",
    emoji: "💛",
    cardClass: "border-rose-200 bg-rose-50/70 hover:bg-rose-50",
    tasks: [
      "Book venue / conference space", "Confirm venue capacity", "Check ADA accessibility",
      "Confirm menu with caterer", "Arrange bar / beverage service",
      "Create event page / website", "Launch social media campaign",
      "Send save-the-date emails", "Send final reminder to attendees",
      "Arrange event photography / videography", "Recruit and brief volunteers",
      "Assign staff roles and responsibilities", "Create event run of show",
      "Set up registration desk", "First aid kit on-site", "Collect attendee feedback / survey",
    ],
  },
  {
    id: "annual_retreat",
    name: "Annual Company Retreat",
    description: "Multi-day company offsite with activities",
    emoji: "🏔",
    cardClass: "border-cyan-200 bg-cyan-50/70 hover:bg-cyan-50",
    tasks: [
      "Book venue / conference space", "Confirm venue capacity", "Visit venue for site inspection",
      "Arrange parking logistics", "Confirm menu with caterer",
      "Arrange dietary options (vegan, gluten-free, etc.)", "Arrange bar / beverage service",
      "Arrange transportation / shuttle service", "Send save-the-date emails",
      "Send final reminder to attendees", "Arrange event photography / videography",
      "Confirm event manager assignment", "Assign staff roles and responsibilities",
      "Create event run of show", "Coordinate gift bags / swag",
      "First aid kit on-site", "Emergency contact list distributed",
      "Collect attendee feedback / survey",
    ],
  },
];

function LibrarySheet({ eventId, existingTitles, nextOrder }: {
  eventId: string;
  existingTitles: Set<string>;
  nextOrder: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"packages" | "tasks">("packages");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState<string>("All");
  const create = useCreateChecklistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const availableItems = LIBRARY.filter((item) => !existingTitles.has(item.title));
  const filtered = filterCat === "All" ? availableItems : availableItems.filter((i) => i.category === filterCat);
  const libCats = ["All", ...Array.from(new Set(availableItems.map((i) => i.category)))];

  const isPkgSelected = (pkg: ChecklistPackage) => {
    const available = pkg.tasks.filter((t) => !existingTitles.has(t));
    return available.length > 0 && available.every((t) => selected.has(t));
  };

  const togglePackage = (pkg: ChecklistPackage) => {
    const available = pkg.tasks.filter((t) => !existingTitles.has(t));
    const fullySelected = available.length > 0 && available.every((t) => selected.has(t));
    setSelected((prev) => {
      const next = new Set(prev);
      if (fullySelected) {
        available.forEach((t) => next.delete(t));
      } else {
        available.forEach((t) => next.add(t));
      }
      return next;
    });
  };

  const toggle = (title: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const addSelected = async () => {
    const toAdd = LIBRARY.filter((item) => selected.has(item.title));
    let order = nextOrder;
    for (const item of toAdd) {
      await create.mutateAsync(
        { id: eventId, data: { title: item.title, category: item.category, sortOrder: order++, completed: false } },
      );
    }
    queryClient.invalidateQueries({ queryKey: getListChecklistQueryKey(eventId) });
    toast({ title: `Added ${toAdd.length} task${toAdd.length === 1 ? "" : "s"}` });
    setSelected(new Set());
    setView("packages");
    setOpen(false);
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) { setSelected(new Set()); setView("packages"); setFilterCat("All"); }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Library className="w-3.5 h-3.5" />
          Add from Library
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>Checklist Library</SheetTitle>
          {/* View switcher */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mt-1">
            {(["packages", "tasks"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors capitalize ${
                  view === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "packages" ? "Packages" : "Individual Tasks"}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* ── PACKAGES VIEW ── */}
          {view === "packages" && (
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Click a package to pre-select all its tasks. You can mix multiple packages and fine-tune in Individual Tasks.
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {PACKAGES.map((pkg) => {
                  const available = pkg.tasks.filter((t) => !existingTitles.has(t));
                  const alreadyAllAdded = available.length === 0;
                  const isSelected = isPkgSelected(pkg);
                  const selectedCount = pkg.tasks.filter((t) => selected.has(t)).length;

                  return (
                    <button
                      key={pkg.id}
                      disabled={alreadyAllAdded}
                      onClick={() => togglePackage(pkg)}
                      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                        alreadyAllAdded
                          ? "opacity-40 cursor-not-allowed border-border bg-muted/30"
                          : isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : `${pkg.cardClass} border`
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl leading-none mt-0.5">{pkg.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">{pkg.name}</span>
                            {isSelected && (
                              <span className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                {selectedCount} selected
                              </span>
                            )}
                            {alreadyAllAdded && (
                              <span className="text-xs text-muted-foreground">Already added</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>
                          <p className="text-xs text-muted-foreground mt-1 font-medium">
                            {available.length} task{available.length !== 1 ? "s" : ""} available
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected.size > 0 && (
                <button
                  onClick={() => setView("tasks")}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <span>Review {selected.size} selected task{selected.size !== 1 ? "s" : ""}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* ── INDIVIDUAL TASKS VIEW ── */}
          {view === "tasks" && (
            <div className="p-5 space-y-3">
              {/* Category filter */}
              <div className="flex flex-wrap gap-1.5">
                {libCats.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                      filterCat === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{selected.size} selected</span>
                {selected.size > 0 && (
                  <button className="hover:text-foreground underline" onClick={clearAll}>Clear all</button>
                )}
              </div>

              {/* Task list */}
              <div className="space-y-1">
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    All tasks from this category are already added.
                  </div>
                )}
                {filtered.map((item) => {
                  const checked = selected.has(item.title);
                  return (
                    <button
                      key={item.title}
                      onClick={() => toggle(item.title)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        checked
                          ? "bg-primary/5 border-primary/30 text-foreground"
                          : "bg-card border-transparent hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}>
                        {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">{item.title}</div>
                        <div className={`text-xs mt-0.5 inline-block px-1.5 py-0 rounded-full ${CATEGORY_COLORS[item.category] ?? "bg-muted text-muted-foreground"}`}>
                          {item.category}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="px-5 py-4 border-t border-border bg-background">
          <Button
            className="w-full gap-2"
            disabled={selected.size === 0 || create.isPending}
            onClick={addSelected}
          >
            <Plus className="w-4 h-4" />
            {create.isPending
              ? "Adding..."
              : selected.size > 0
              ? `Add ${selected.size} task${selected.size !== 1 ? "s" : ""}`
              : "Select tasks to add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddRow({ eventId, nextOrder }: { eventId: string; nextOrder: number }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const create = useCreateChecklistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    create.mutate(
      { id: eventId, data: { title, category, assignedTo: assignedTo || undefined, dueDate: dueDate || undefined, sortOrder: nextOrder, completed: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistQueryKey(eventId) });
          setTitle(""); setAssignedTo(""); setDueDate(""); setOpen(false);
        },
        onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
      }
    );
  };

  if (!open) return (
    <Button variant="outline" size="sm" className="gap-1.5 w-full mt-2" onClick={() => setOpen(true)}>
      <Plus className="w-3.5 h-3.5" /> Add custom task
    </Button>
  );

  return (
    <div className="bg-muted/30 border border-dashed border-border rounded-xl p-4 space-y-3 mt-2">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Task *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" className="text-sm" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
          <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Name or team" className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!title || create.isPending} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function ChecklistTab({ eventId }: Props) {
  const { data: items = [], isLoading, isError, error } = useListChecklist(eventId);
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleComplete = (itemId: string, completed: boolean) => {
    updateItem.mutate(
      { id: eventId, itemId, data: { completed: !completed } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChecklistQueryKey(eventId) }) }
    );
  };

  const handleDelete = (itemId: string) => {
    deleteItem.mutate(
      { id: eventId, itemId },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChecklistQueryKey(eventId) }),
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  if (isError) return <QueryError error={error} label="Failed to load checklist." />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const done = items.filter((i) => i.completed).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const existingTitles = new Set(items.map((i) => i.title));

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-base">Event Checklist</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">{done}/{total} complete</span>
          <LibrarySheet eventId={eventId} existingTitles={existingTitles} nextOrder={total} />
        </div>
      </div>

      {total > 0 && (
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {total === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No tasks yet.</p>
          <p className="text-xs mt-1 mb-4">Start with a pre-built package or add custom tasks.</p>
          <LibrarySheet eventId={eventId} existingTitles={existingTitles} nextOrder={0} />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat] ?? "bg-muted text-muted-foreground"}`}>
                  {cat}
                </span>
                <span className="text-xs text-muted-foreground">
                  {catItems.filter((i) => i.completed).length}/{catItems.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors group ${
                      item.completed ? "bg-muted/30 border-border" : "bg-card border-border hover:border-primary/30"
                    }`}
                  >
                    <button
                      onClick={() => toggleComplete(item.id, item.completed)}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {item.completed
                        ? <CheckSquare className="w-4 h-4 text-emerald-500" />
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {item.title}
                      </span>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {item.assignedTo && (
                          <span className="text-xs text-muted-foreground">Assigned: {item.assignedTo}</span>
                        )}
                        {item.dueDate && (
                          <span className="text-xs text-muted-foreground">Due: {item.dueDate}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRow eventId={eventId} nextOrder={total} />
    </div>
  );
}
