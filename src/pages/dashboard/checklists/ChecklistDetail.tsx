import { useState } from "react";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useChecklist } from "@/hooks/use-checklists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, ListChecks } from "lucide-react";

export default function ChecklistDetail() {
  const [, params] = useRoute("/dashboard/checklists/:id");
  const id = params?.id ?? "";
  const {
    checklist,
    addCategory,
    renameCategory,
    removeCategory,
    addItem,
    toggleItem,
    renameItem,
    removeItem,
  } = useChecklist(id);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<{ categoryId: string; itemId: string } | null>(null);
  const [editingItemValue, setEditingItemValue] = useState("");

  if (!checklist) {
    return (
      <AppLayout>
        <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground py-20">
          <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Checklist not found.
          <div className="mt-4">
            <Link href="/dashboard/checklists">
              <Button variant="outline" size="sm">Back to Checklists</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const allItems = checklist.categories.flatMap((c) => c.items);
  const completed = allItems.filter((i) => i.completed).length;
  const total = allItems.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    addCategory(newCategoryName);
    setNewCategoryName("");
  };

  const startEditingCategory = (categoryId: string, name: string) => {
    setEditingCategoryId(categoryId);
    setEditingCategoryValue(name);
  };

  const saveEditingCategory = () => {
    if (editingCategoryId) renameCategory(editingCategoryId, editingCategoryValue);
    setEditingCategoryId(null);
    setEditingCategoryValue("");
  };

  const handleAddItem = (categoryId: string) => {
    const text = newItemText[categoryId] ?? "";
    if (!text.trim()) return;
    addItem(categoryId, text);
    setNewItemText((prev) => ({ ...prev, [categoryId]: "" }));
  };

  const startEditingItem = (categoryId: string, itemId: string, text: string) => {
    setEditingItem({ categoryId, itemId });
    setEditingItemValue(text);
  };

  const saveEditingItem = () => {
    if (editingItem) renameItem(editingItem.categoryId, editingItem.itemId, editingItemValue);
    setEditingItem(null);
    setEditingItemValue("");
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/checklists">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Checklists
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{checklist.name}</h1>
          {checklist.description && (
            <p className="text-muted-foreground mt-1">{checklist.description}</p>
          )}
          {total > 0 && (
            <div className="mt-4 max-w-xs">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{completed} / {total} complete ({pct}%)</div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          <Input
            placeholder="New category name (e.g. Vendors, Decor, Day-Of)"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCategory();
              }
            }}
          />
          <Button onClick={handleAddCategory} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Category
          </Button>
        </div>

        {checklist.categories.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
            No categories yet. Add one above to start organizing items.
          </div>
        ) : (
          <div className="space-y-6">
            {checklist.categories.map((category) => {
              const categoryCompleted = category.items.filter((i) => i.completed).length;
              return (
                <div key={category.id} className="border border-border rounded-lg bg-card">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                    {editingCategoryId === category.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editingCategoryValue}
                          onChange={(e) => setEditingCategoryValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEditingCategory();
                            } else if (e.key === "Escape") {
                              setEditingCategoryId(null);
                            }
                          }}
                          className="h-8"
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveEditingCategory}>
                          <Check className="w-4 h-4 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingCategoryId(null)}>
                          <X className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{category.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {categoryCompleted}/{category.items.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => startEditingCategory(category.id, category.name)}
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove "{category.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the category and all {category.items.length} item{category.items.length === 1 ? "" : "s"} in it.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeCategory(category.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="divide-y divide-border">
                    {category.items.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground text-center">No items yet.</div>
                    ) : (
                      category.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 group">
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => toggleItem(category.id, item.id)}
                          />
                          {editingItem?.categoryId === category.id && editingItem?.itemId === item.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                autoFocus
                                value={editingItemValue}
                                onChange={(e) => setEditingItemValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveEditingItem();
                                  } else if (e.key === "Escape") {
                                    setEditingItem(null);
                                  }
                                }}
                                className="h-8"
                              />
                              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveEditingItem}>
                                <Check className="w-4 h-4 text-primary" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingItem(null)}>
                                <X className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span
                                className={`flex-1 text-sm cursor-pointer ${item.completed ? "line-through text-muted-foreground" : ""}`}
                                onClick={() => toggleItem(category.id, item.id)}
                              >
                                {item.text}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => startEditingItem(category.id, item.id, item.text)}
                                >
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => removeItem(category.id, item.id)}
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 px-4 py-3 border-t border-border">
                    <Input
                      placeholder="Add an item..."
                      value={newItemText[category.id] ?? ""}
                      onChange={(e) => setNewItemText((prev) => ({ ...prev, [category.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddItem(category.id);
                        }
                      }}
                      className="h-8"
                    />
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => handleAddItem(category.id)}>
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
