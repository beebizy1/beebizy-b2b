import { useState } from "react";
import {
  useListBudgetItems,
  useCreateBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
  getListBudgetItemsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, TrendingUp, TrendingDown, DollarSign, Edit2, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

type Item = {
  id: string;
  name: string;
  category: string;
  type: "expense" | "revenue";
  estimatedAmount: number;
  actualAmount: number | null;
  notes: string | null;
};

const EXPENSE_CATEGORIES = ["Venue", "Catering", "AV/Tech", "Staffing", "Marketing", "Decor", "Transportation", "Security", "Speaker Fees", "Printing", "Contingency", "Other"];
const REVENUE_CATEGORIES = ["Ticket Sales", "Sponsorship", "Registration Fees", "Grants", "Merchandise", "Other"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function variance(estimated: number, actual: number | null) {
  if (actual == null) return null;
  return actual - estimated;
}

function EditRow({ item, eventId, onDone }: { item: Item; eventId: string; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [estimated, setEstimated] = useState(item.estimatedAmount.toString());
  const [actual, setActual] = useState(item.actualAmount?.toString() ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const update = useUpdateBudgetItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const cats = item.type === "expense" ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES;

  const save = () => {
    update.mutate(
      {
        id: eventId,
        itemId: item.id,
        data: {
          name,
          category,
          estimatedAmount: parseFloat(estimated) || 0,
          actualAmount: actual !== "" ? parseFloat(actual) : undefined,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(eventId) });
          onDone();
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  return (
    <tr className="bg-muted/20">
      <td className="px-3 py-2" colSpan={5}>
        <div className="grid sm:grid-cols-5 gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="text-sm sm:col-span-2" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input type="number" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="Estimated $" className="text-sm" />
          <Input type="number" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual $ (after event)" className="text-sm" />
        </div>
        <div className="flex gap-2 mt-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="text-sm max-w-sm" />
          <Button size="sm" onClick={save} disabled={!name || update.isPending} className="gap-1">
            <Check className="w-3.5 h-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </td>
    </tr>
  );
}

function AddRow({ eventId, type, nextOrder }: { eventId: string; type: "expense" | "revenue"; nextOrder: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(type === "expense" ? "Venue" : "Ticket Sales");
  const [estimated, setEstimated] = useState("");
  const [actual, setActual] = useState("");
  const create = useCreateBudgetItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const cats = type === "expense" ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES;

  const save = () => {
    create.mutate(
      {
        id: eventId,
        data: {
          name,
          category,
          type,
          estimatedAmount: parseFloat(estimated) || 0,
          actualAmount: actual !== "" ? parseFloat(actual) : undefined,
          sortOrder: nextOrder,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(eventId) });
          setName(""); setEstimated(""); setActual(""); setOpen(false);
        },
        onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
      }
    );
  };

  if (!open) return (
    <tr>
      <td colSpan={5} className="px-3 py-2">
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground text-xs" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add {type}
        </Button>
      </td>
    </tr>
  );

  return (
    <tr className="bg-muted/20">
      <td className="px-3 py-2" colSpan={5}>
        <div className="grid sm:grid-cols-5 gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="text-sm sm:col-span-2" autoFocus />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input type="number" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="Estimated $" className="text-sm" />
          <Input type="number" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual $ (after event)" className="text-sm" />
        </div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={save} disabled={!name || create.isPending} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}

function SectionTable({
  title,
  items,
  type,
  eventId,
  onEdit,
  editingId,
  onDelete,
}: {
  title: string;
  items: Item[];
  type: "expense" | "revenue";
  eventId: string;
  onEdit: (id: string | null) => void;
  editingId: string | null;
  onDelete: (id: string) => void;
}) {
  const totalEstimated = items.reduce((s, i) => s + i.estimatedAmount, 0);
  const totalActual = items.reduce((s, i) => s + (i.actualAmount ?? 0), 0);
  const hasActuals = items.some((i) => i.actualAmount != null);
  const isRevenue = type === "revenue";

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className={`px-4 py-3 flex items-center justify-between ${isRevenue ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/20"}`}>
        <div className="flex items-center gap-2">
          {isRevenue
            ? <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            : <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
          }
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Estimated</div>
          <div className="font-bold text-sm">{fmt(totalEstimated)}</div>
          {hasActuals && (
            <div className={`text-xs font-semibold ${isRevenue ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              Actual: {fmt(totalActual)}
            </div>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground w-2/5">Item</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Category</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Estimated</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Actual</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) =>
            editingId === item.id ? (
              <EditRow key={item.id} item={item} eventId={eventId} onDone={() => onEdit(null)} />
            ) : (
              <tr key={item.id} className="group hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-foreground">{item.name}</div>
                  {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.category}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(item.estimatedAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {item.actualAmount != null ? (
                    <div>
                      <span className="font-medium">{fmt(item.actualAmount)}</span>
                      {(() => {
                        const v = variance(item.estimatedAmount, item.actualAmount);
                        if (v == null) return null;
                        const over = isRevenue ? v < 0 : v > 0;
                        return (
                          <div className={`text-xs font-semibold ${over ? "text-red-500" : "text-emerald-600"}`}>
                            {v > 0 ? "+" : ""}{fmt(v)}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(item.id)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(item.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          )}
          <AddRow eventId={eventId} type={type} nextOrder={items.length} />
        </tbody>
      </table>
    </div>
  );
}

function RoiCard({ expenses, revenues }: { expenses: Item[]; revenues: Item[] }) {
  const totalEstExpense = expenses.reduce((s, i) => s + i.estimatedAmount, 0);
  const totalEstRevenue = revenues.reduce((s, i) => s + i.estimatedAmount, 0);
  const hasActuals = [...expenses, ...revenues].some((i) => i.actualAmount != null);

  const totalActExpense = expenses.reduce((s, i) => s + (i.actualAmount ?? i.estimatedAmount), 0);
  const totalActRevenue = revenues.reduce((s, i) => s + (i.actualAmount ?? i.estimatedAmount), 0);

  const estNet = totalEstRevenue - totalEstExpense;
  const estRoi = totalEstExpense > 0 ? (estNet / totalEstExpense) * 100 : null;

  const actNet = totalActRevenue - totalActExpense;
  const actRoi = totalActExpense > 0 ? (actNet / totalActExpense) * 100 : null;

  const budgetUsedPct = totalEstExpense > 0 ? Math.min((totalActExpense / totalEstExpense) * 100, 150) : 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Summary & ROI</span>
      </div>

      <div className="p-4 space-y-5">
        {/* Summary grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Est. Budget", value: fmt(totalEstExpense), sub: "total expenses", color: "text-foreground" },
            { label: "Est. Revenue", value: fmt(totalEstRevenue), sub: "total revenue", color: "text-emerald-600 dark:text-emerald-400" },
            {
              label: hasActuals ? "Actual Spend" : "Projected Spend",
              value: fmt(totalActExpense),
              sub: hasActuals ? "recorded actuals" : "using estimates",
              color: totalActExpense > totalEstExpense ? "text-red-500" : "text-foreground",
            },
            {
              label: "Net " + (actNet >= 0 ? "Profit" : "Loss"),
              value: fmt(Math.abs(actNet)),
              sub: actNet >= 0 ? "surplus" : "deficit",
              color: actNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Budget utilization bar */}
        {totalEstExpense > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget utilization</span>
              <span className={`text-xs font-bold ${budgetUsedPct > 100 ? "text-red-500" : "text-foreground"}`}>
                {budgetUsedPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${budgetUsedPct > 100 ? "bg-red-500" : budgetUsedPct > 85 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(budgetUsedPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>$0</span>
              <span>{fmt(totalEstExpense)} budget</span>
            </div>
          </div>
        )}

        {/* ROI display */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Projected ROI</div>
            {estRoi != null ? (
              <div className={`text-3xl font-black ${estRoi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {estRoi >= 0 ? "+" : ""}{estRoi.toFixed(1)}%
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Add revenue items to calculate</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Based on estimated figures</div>
          </div>

          <div className={`border rounded-xl p-4 ${hasActuals ? "bg-card border-border" : "bg-muted/20 border-dashed border-border"}`}>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Actual ROI</div>
            {hasActuals && actRoi != null ? (
              <div className={`text-3xl font-black ${actRoi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {actRoi >= 0 ? "+" : ""}{actRoi.toFixed(1)}%
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Enter actual amounts post-event</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {hasActuals ? "Based on recorded actuals" : "Fill in actuals after your event runs"}
            </div>
          </div>
        </div>

        {/* ROI formula hint */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          ROI = (Revenue − Expenses) / Expenses × 100. A positive ROI means the event generated more than it cost.
        </div>
      </div>
    </div>
  );
}

export function BudgetTab({ eventId }: Props) {
  const { data: items = [], isLoading, isError, error } = useListBudgetItems(eventId);
  const deleteItem = useDeleteBudgetItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const expenses = items.filter((i) => i.type === "expense") as Item[];
  const revenues = items.filter((i) => i.type === "revenue") as Item[];

  const handleDelete = (itemId: string) => {
    deleteItem.mutate(
      { id: eventId, itemId },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(eventId) }),
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  if (isError) return <QueryError error={error} label="Failed to load budget." />;
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Budget & ROI</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Track estimated vs actual costs and revenue. Fill in actuals after the event for ROI.</p>
        </div>
      </div>

      <RoiCard expenses={expenses} revenues={revenues} />

      <SectionTable
        title="Expenses"
        items={expenses}
        type="expense"
        eventId={eventId}
        onEdit={setEditingId}
        editingId={editingId}
        onDelete={handleDelete}
      />

      <SectionTable
        title="Revenue"
        items={revenues}
        type="revenue"
        eventId={eventId}
        onEdit={setEditingId}
        editingId={editingId}
        onDelete={handleDelete}
      />
    </div>
  );
}
