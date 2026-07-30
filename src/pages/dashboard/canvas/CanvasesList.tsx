import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCanvases } from "@/hooks/use-canvases";
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
import { Plus, LayoutGrid, Trash2, ArrowRight } from "lucide-react";
import { QueryError } from "@/components/QueryError";

export default function CanvasesList() {
  const { canvases, error, createCanvas, deleteCanvas } = useCanvases();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [, navigate] = useLocation();

  const handleCreate = () => {
    if (!name.trim()) return;
    const id = createCanvas(name, description);
    setName("");
    setDescription("");
    setOpen(false);
    navigate(`/dashboard/canvas/${id}`);
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inspiration Card</h1>
            <p className="text-muted-foreground mt-1 text-sm">Design floor plans by placing tables, stages, and zones on an inspiration card.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Inspiration Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Inspiration Card</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="e.g. Ballroom Layout"
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
                    placeholder="What is this layout for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!name.trim()}>Create Inspiration Card</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <QueryError error={error} label="Failed to load inspiration cards." />
        ) : canvases.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-medium mb-1">No inspiration cards yet</div>
            <p className="text-sm mb-4">Create an inspiration card to start designing a floor plan.</p>
            <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Create your first inspiration card
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {canvases.map((canvas) => (
              <div key={canvas.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
                <div>
                  <div className="font-semibold text-base leading-tight truncate">{canvas.name}</div>
                  {canvas.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{canvas.description}</div>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {canvas.layout.elements.length} element{canvas.layout.elements.length === 1 ? "" : "s"}
                </div>

                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                  <Link href={`/dashboard/canvas/${canvas.id}`} className="flex-1">
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
                        <AlertDialogTitle>Delete inspiration card?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{canvas.name}" and its layout.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteCanvas(canvas.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
