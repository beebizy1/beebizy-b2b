import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTemplates, useDeleteTemplate, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, ClipboardList, Clock, DollarSign, Trash2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";
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

const CATEGORY_COLORS: Record<string, string> = {
  Conference:            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Workshop:              "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Meetup:                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Webinar:               "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Social:                "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "Monthly Meetup":      "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "Sales Kickoff":       "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Team Offsite":        "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "Employee Engagement": "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
  "In-Store Activation": "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "Influencer Event":    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  General:               "bg-muted text-muted-foreground",
};

export default function TemplatesList() {
  const { data: templates = [], isLoading, isError, error } = useListTemplates();
  const deleteTemplate = useDeleteTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          toast({ title: "Template deleted" });
        },
        onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
            <p className="text-muted-foreground mt-1 text-sm">Reusable event structures with checklists, run of show, and budget items.</p>
          </div>
          <Link href="/dashboard/templates/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Template
            </Button>
          </Link>
        </div>

        {isError ? (
          <QueryError error={error} label="Failed to load templates." />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-medium mb-1">No templates yet</div>
            <p className="text-sm mb-4">Create a template to reuse checklists, run of show, and budgets across events.</p>
            <Link href="/dashboard/templates/new">
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Create your first template
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => {
              const colorClass = CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.General;
              const totalItems = (t.checklistCount ?? 0) + (t.runOfShowCount ?? 0) + (t.budgetCount ?? 0);
              return (
                <div key={t.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base leading-tight truncate">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                      )}
                    </div>
                    <Badge className={`text-xs shrink-0 border-0 font-medium ${colorClass}`}>{t.category}</Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {t.checklistCount ?? 0} checklist
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {t.runOfShowCount ?? 0} run of show
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />
                      {t.budgetCount ?? 0} budget
                    </span>
                  </div>

                  {t.defaultCapacity && (
                    <div className="text-xs text-muted-foreground">Default capacity: {t.defaultCapacity}</div>
                  )}

                  {totalItems === 0 && (
                    <div className="text-xs text-muted-foreground italic">No items yet — edit to add</div>
                  )}

                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                    <Link href={`/dashboard/events/new?template=${t.id}`} className="flex-1">
                      <Button size="sm" className="w-full gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Use Template
                      </Button>
                    </Link>
                    <Link href={`/dashboard/templates/${t.id}`}>
                      <Button size="sm" variant="outline">Edit</Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{t.name}" and all its items.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
