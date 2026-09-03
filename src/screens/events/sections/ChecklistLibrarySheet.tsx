/**
 * Bulk-add tasks to an event's checklist.
 *
 * Two ways in, because there are two moments: at the start you want a whole event type's
 * worth of tasks at once (a package), and later you want to top up with the two things
 * you forgot (individual tasks).
 *
 * Anything already on the checklist is filtered out by title rather than greyed out — a
 * package you have already applied should offer you the handful of tasks you are missing,
 * not make you re-read twenty you have.
 */

import { useMemo, useState } from "react";
import { Check, LibraryBig, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { EmptyState, Pill } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useAddChecklistItem } from "@/data/hooks";
import {
  categoryForTask,
  CHECKLIST_CATEGORIES,
  CHECKLIST_LIBRARY,
  CHECKLIST_PACKAGES,
} from "@/data/checklistLibrary";

const ALL = "All";

export default function ChecklistLibrarySheet({
  eventId,
  existingTitles,
  nextOrder,
}: {
  eventId: string;
  existingTitles: Set<string>;
  nextOrder: number;
}) {
  const add = useAddChecklistItem();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"packages" | "tasks">("packages");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<string>(ALL);

  const available = useMemo(
    () => CHECKLIST_LIBRARY.filter((task) => !existingTitles.has(task.title)),
    [existingTitles],
  );

  const filtered = category === ALL ? available : available.filter((task) => task.category === category);

  const toggle = (title: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  /**
   * Adds sequentially rather than in parallel so `sortOrder` comes out in the order the
   * list was read, and so a mid-way failure leaves a prefix rather than holes.
   */
  const addTitles = async (titles: string[]) => {
    if (titles.length === 0) return;
    let added = 0;
    try {
      for (const title of titles) {
        await add.mutateAsync({
          eventId,
          draft: { title, category: categoryForTask(title), sortOrder: nextOrder + added },
        });
        added += 1;
      }
      toast({ title: `${added} ${added === 1 ? "task" : "tasks"} added` });
    } catch (error) {
      toast({
        title: added === 0 ? "Couldn't add the tasks" : `Added ${added} before failing`,
        description: error instanceof Error ? error.message : undefined,
      });
    }
    setSelected(new Set());
    setOpen(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected(new Set());
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <LibraryBig className="mr-1.5 size-3.5" aria-hidden="true" />
          Add from library
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-hairline p-5">
          <SheetTitle>Task library</SheetTitle>
          <SheetDescription>
            Start from a package, or pick individual tasks. Anything already on this checklist is hidden.
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 border-b border-hairline px-5 py-3">
          {(["packages", "tasks"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                view === option
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "packages" ? (
            <div className="space-y-3 p-5">
              {CHECKLIST_PACKAGES.map((pkg) => {
                const missing = pkg.tasks.filter((title) => !existingTitles.has(title));
                return (
                  <div key={pkg.id} className="rounded-xl border border-card-border bg-card p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          <span aria-hidden="true">{pkg.emoji}</span> {pkg.name}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{pkg.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span data-numeric>{pkg.tasks.length}</span> tasks
                          {missing.length < pkg.tasks.length ? (
                            <> · <span data-numeric>{pkg.tasks.length - missing.length}</span> already added</>
                          ) : null}
                        </p>
                      </div>
                      {missing.length === 0 ? (
                        <Pill tone="success">
                          <Check className="mr-1 size-3" aria-hidden="true" />
                          Added
                        </Pill>
                      ) : (
                        <Button size="sm" disabled={add.isPending} onClick={() => void addTitles(missing)}>
                          <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
                          Add {missing.length}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-4 flex flex-wrap gap-1.5">
                {[ALL, ...CHECKLIST_CATEGORIES].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCategory(option)}
                    aria-pressed={category === option}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      category === option
                        ? "border-primary bg-primary-muted text-primary-text"
                        : "border-hairline text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Check}
                  title={available.length === 0 ? "Every library task is already on this checklist" : "Nothing left in this category"}
                  description={available.length === 0 ? undefined : "Try another category."}
                />
              ) : (
                <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                  {filtered.map((task) => (
                    <li key={task.title}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                        <Checkbox
                          checked={selected.has(task.title)}
                          onCheckedChange={() => toggle(task.title)}
                        />
                        <span className="min-w-0 flex-1 text-sm text-foreground">{task.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{task.category}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {view === "tasks" ? (
          <div className="flex items-center justify-between gap-3 border-t border-hairline p-5">
            <p className="text-sm text-muted-foreground">
              <span data-numeric>{selected.size}</span> selected
            </p>
            <Button disabled={selected.size === 0 || add.isPending} onClick={() => void addTitles([...selected])}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Add {selected.size > 0 ? selected.size : ""} to checklist
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
