import { useState } from "react";
import {
  useListMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, UtensilsCrossed, Leaf, WheatOff, NutOff, Milk } from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

const COURSES = [
  "Cocktail Hour",
  "First Course",
  "Soup",
  "Salad",
  "Main Course",
  "Side Dish",
  "Dessert",
  "Drinks",
  "Late Night Snack",
  "Other",
];

const DIETARY_OPTIONS = [
  { tag: "V", label: "Vegetarian", icon: Leaf, color: "bg-green-100 text-green-700" },
  { tag: "VG", label: "Vegan", icon: Leaf, color: "bg-emerald-100 text-emerald-800" },
  { tag: "GF", label: "Gluten-Free", icon: WheatOff, color: "bg-amber-100 text-amber-700" },
  { tag: "NF", label: "Nut-Free", icon: NutOff, color: "bg-orange-100 text-orange-700" },
  { tag: "DF", label: "Dairy-Free", icon: Milk, color: "bg-sky-100 text-sky-700" },
];

type ItemForm = {
  name: string;
  description: string;
  course: string;
  dietaryTags: string[];
  price: string;
  serves: string;
  notes: string;
};

const EMPTY_FORM: ItemForm = {
  name: "",
  description: "",
  course: "Main Course",
  dietaryTags: [],
  price: "",
  serves: "",
  notes: "",
};

function tagBadge(tag: string) {
  const opt = DIETARY_OPTIONS.find(d => d.tag === tag);
  if (!opt) return <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>;
  return (
    <span key={tag} className={`text-xs px-1.5 py-0.5 rounded font-medium ${opt.color}`}>
      {tag}
    </span>
  );
}

function fmt(price: string | null | undefined) {
  if (!price) return null;
  const n = parseFloat(price);
  if (isNaN(n)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function MenuTab({ eventId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: { id: string } & ItemForm }>({ open: false });
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: items, isLoading, isError, error } = useListMenuItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListMenuItemsQueryKey(eventId) },
  });

  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey(eventId) });

  function openAdd() {
    setForm(EMPTY_FORM);
    setDialog({ open: true });
  }

  function openEdit(item: NonNullable<typeof items>[number]) {
    setForm({
      name: item.name,
      description: item.description ?? "",
      course: item.course,
      dietaryTags: item.dietaryTags ? item.dietaryTags.split(",").map(t => t.trim()).filter(Boolean) : [],
      price: item.price ?? "",
      serves: item.serves != null ? String(item.serves) : "",
      notes: item.notes ?? "",
    });
    setDialog({ open: true, item: { id: item.id, name: item.name, description: item.description ?? "", course: item.course, dietaryTags: item.dietaryTags ? item.dietaryTags.split(",").map(t => t.trim()).filter(Boolean) : [], price: item.price ?? "", serves: item.serves != null ? String(item.serves) : "", notes: item.notes ?? "" } });
  }

  function toggleTag(tag: string) {
    setForm(f => ({
      ...f,
      dietaryTags: f.dietaryTags.includes(tag)
        ? f.dietaryTags.filter(t => t !== tag)
        : [...f.dietaryTags, tag],
    }));
  }

  function handleSave() {
    if (!form.name.trim()) { toast({ title: "Item name is required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      course: form.course,
      dietaryTags: form.dietaryTags.join(", ") || undefined,
      price: form.price.trim() || undefined,
      serves: form.serves ? parseInt(form.serves, 10) : undefined,
      notes: form.notes.trim() || undefined,
    };

    if (dialog.item) {
      updateItem.mutate({ id: eventId, itemId: dialog.item.id, data: payload }, {
        onSuccess: () => { toast({ title: "Item updated" }); setDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
      });
    } else {
      createItem.mutate({ id: eventId, data: payload }, {
        onSuccess: () => { toast({ title: "Item added" }); setDialog({ open: false }); invalidate(); },
        onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteItem.mutate({ id: eventId, itemId: deleteTarget.id }, {
      onSuccess: () => { toast({ title: "Item removed" }); setDeleteTarget(null); invalidate(); },
      onError: () => toast({ title: "Failed to remove item", variant: "destructive" }),
    });
  }

  // Group items by course, preserving COURSES order
  const grouped = COURSES.reduce<Record<string, NonNullable<typeof items>>>((acc, course) => {
    const courseItems = (items ?? []).filter(i => i.course === course);
    if (courseItems.length > 0) acc[course] = courseItems;
    return acc;
  }, {});
  // Catch any items with a custom course not in COURSES list
  (items ?? []).forEach(i => {
    if (!COURSES.includes(i.course) && !grouped[i.course]) {
      grouped[i.course] = [];
    }
    if (!COURSES.includes(i.course)) {
      grouped[i.course] = [...(grouped[i.course] ?? []), i];
    }
  });

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-primary" /> Event Menu
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Plan your courses, dishes, and dietary options.</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </Button>
      </div>

      {isError ? (
        <QueryError error={error} label="Failed to load menu." />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (items ?? []).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/20 border border-dashed rounded-xl space-y-3">
          <UtensilsCrossed className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm font-medium">No menu items yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add first item
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([course, courseItems]) => (
            <div key={course}>
              <div className="flex items-center gap-3 mb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{course}</h4>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {courseItems.map(item => {
                  const tags = item.dietaryTags
                    ? item.dietaryTags.split(",").map(t => t.trim()).filter(Boolean)
                    : [];
                  return (
                    <div key={item.id} className="bg-card border rounded-xl px-4 py-3 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{item.name}</span>
                          {tags.map(t => tagBadge(t))}
                          {item.price && (
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">{fmt(item.price)}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                          {item.serves && <span>Serves {item.serves}</span>}
                          {item.notes && <span className="italic">{item.notes}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialog.open} onOpenChange={open => setDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.item ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="e.g. Beef Tenderloin"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Course</label>
              <Select value={form.course} onValueChange={v => setForm(f => ({ ...f, course: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe the dish, ingredients, or preparation..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Dietary Tags</label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(({ tag, label, color }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all ${
                      form.dietaryTags.includes(tag)
                        ? `${color} border-transparent`
                        : "bg-muted/40 text-muted-foreground border-border hover:border-foreground/30"
                    }`}
                  >
                    {label} ({tag})
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Price per head</label>
                <Input
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Serves</label>
                <Input
                  placeholder="e.g. 50"
                  type="number"
                  min="1"
                  value={form.serves}
                  onChange={e => setForm(f => ({ ...f, serves: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input
                placeholder="e.g. Requires 48h advance notice"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : dialog.item ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.name}</span> from the menu.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteItem.isPending}>
              {deleteItem.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
