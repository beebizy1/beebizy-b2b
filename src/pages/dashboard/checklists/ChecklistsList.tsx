import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useChecklists } from "@/hooks/use-checklists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, ListChecks, Trash2, ArrowRight } from "lucide-react";
import { QueryError } from "@/components/QueryError";

export default function ChecklistsList() {
  const { checklists, error, createChecklist, deleteChecklist } = useChecklists();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [, navigate] = useLocation();

  const handleCreate = () => {
    if (!name.trim()) return;
    const id = createChecklist(name, description);
    setName("");
    setDescription("");
    setOpen(false);
    navigate(`/dashboard/checklists/${id}`);
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Checklists</h1>
            <p className="text-muted-foreground mt-1 text-sm">Organize prep work into categories and track completion.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Checklist
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Checklist</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="e.g. Venue Setup"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (optional)</label>
                  <Textarea
                    placeholder="What is this checklist for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!name.trim()}>Create Checklist</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <QueryError error={error} label="Failed to load checklists." />
        ) : checklists.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-medium mb-1">No checklists yet</div>
            <p className="text-sm mb-4">Create a checklist to organize categories and track prep work.</p>
            <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Create your first checklist
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {checklists.map((checklist) => {
              const allItems = checklist.categories.flatMap((c) => c.items);
              const completed = allItems.filter((i) => i.completed).length;
              const total = allItems.length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <div key={checklist.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
                  <div>
                    <div className="font-semibold text-base leading-tight truncate">{checklist.name}</div>
                    {checklist.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{checklist.description}</div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {checklist.categories.length} {checklist.categories.length === 1 ? "category" : "categories"} • {total} {total === 1 ? "item" : "items"}
                  </div>

                  {total > 0 && (
                    <div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{completed} / {total} complete</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                    <Link href={`/dashboard/checklists/${checklist.id}`} className="flex-1">
                      <Button size="sm" className="w-full gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Open
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete checklist?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{checklist.name}" and all its categories and items.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteChecklist(checklist.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
