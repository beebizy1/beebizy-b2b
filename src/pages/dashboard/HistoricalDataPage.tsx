import { AppLayout } from "@/components/layout/AppLayout";
import { useListEvents, useListEventRoi, useUpdateEventRoi } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { Search, ExternalLink, Pencil, TrendingUp, TrendingDown, Minus, DollarSign } from "lucide-react";
import { format, parseISO, isPast } from "date-fns";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function RoiBadge({ roi }: { roi: number | null }) {
  if (roi === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (roi > 0) return (
    <span className="flex items-center gap-1 text-green-600 font-semibold text-sm">
      <TrendingUp className="w-3.5 h-3.5" />{roi.toFixed(0)}%
    </span>
  );
  if (roi < 0) return (
    <span className="flex items-center gap-1 text-red-500 font-semibold text-sm">
      <TrendingDown className="w-3.5 h-3.5" />{roi.toFixed(0)}%
    </span>
  );
  return <span className="flex items-center gap-1 text-muted-foreground text-sm"><Minus className="w-3.5 h-3.5" />0%</span>;
}

export default function HistoricalDataPage() {
  const { data: allEvents = [], isLoading: eventsLoading, isError: eventsIsError, error: eventsError } = useListEvents();
  const { toast } = useToast();

  const { data: roiData = [], isLoading: roiLoading, isError: roiIsError, error: roiError } = useListEventRoi();

  const roiMap = useMemo(() => {
    const m: Record<string, typeof roiData[number]> = {};
    roiData.forEach((r) => { m[r.eventId] = r; });
    return m;
  }, [roiData]);

  const updateRoi = useUpdateEventRoi();

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editDialog, setEditDialog] = useState<null | { id: string; title: string; cost: string; units: string; price: string; notes: string }>(null);

  const pastEvents = useMemo(() => allEvents.filter((e) => isPast(parseISO(e.date))), [allEvents]);
  const years = useMemo(() => [...new Set(pastEvents.map((e) => format(parseISO(e.date), "yyyy")))].sort((a, b) => +b - +a), [pastEvents]);
  const categories = useMemo(() => [...new Set(pastEvents.map((e) => e.category).filter(Boolean))] as string[], [pastEvents]);

  const filtered = useMemo(() => pastEvents.filter((e) => {
    if (yearFilter !== "all" && format(parseISO(e.date), "yyyy") !== yearFilter) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()), [pastEvents, yearFilter, categoryFilter, search]);

  const totals = useMemo(() => {
    let totalCost = 0, totalRevenue = 0, totalUnits = 0;
    filtered.forEach((e) => {
      const roi = roiMap[e.id];
      if (roi) {
        const cost = roi.eventCost || 0;
        const revenue = roi.unitsSold * (roi.avgItemPrice || 0);
        totalCost += cost;
        totalRevenue += revenue;
        totalUnits += roi.unitsSold;
      }
    });
    const overallRoi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : null;
    return { totalCost, totalRevenue, totalUnits, overallRoi };
  }, [filtered, roiMap]);

  function openEdit(e: typeof filtered[0]) {
    const roi = roiMap[e.id];
    setEditDialog({
      id: e.id,
      title: e.title,
      cost: roi ? String(roi.eventCost) : "",
      units: roi ? String(roi.unitsSold) : "",
      price: roi ? String(roi.avgItemPrice) : "",
      notes: roi?.notes ?? "",
    });
  }

  const isLoading = eventsLoading || roiLoading;
  const isError = eventsIsError || roiIsError;

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Data</h1>
            <p className="text-muted-foreground mt-1">Past event performance, spend, and ROI</p>
          </div>
        </div>

        {isError && (
          <div className="mb-6">
            <QueryError error={eventsIsError ? eventsError : roiError} label="Failed to load financial data." />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{isLoading ? "—" : filtered.length}</p>
              <p className="text-sm text-muted-foreground">Past Events</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{isLoading ? "—" : fmt$(totals.totalCost)}</p>
              <p className="text-sm text-muted-foreground">Total Spent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{isLoading ? "—" : totals.totalUnits.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Units Sold</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1">
                {totals.overallRoi !== null && totals.overallRoi > 0 && <TrendingUp className="w-4 h-4 text-green-600" />}
                {totals.overallRoi !== null && totals.overallRoi < 0 && <TrendingDown className="w-4 h-4 text-red-500" />}
                <p className={`text-2xl font-bold ${totals.overallRoi !== null && totals.overallRoi > 0 ? "text-green-600" : totals.overallRoi !== null && totals.overallRoi < 0 ? "text-red-500" : ""}`}>
                  {isLoading || totals.overallRoi === null ? "—" : `${totals.overallRoi.toFixed(0)}%`}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">Overall ROI</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search events..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">No past events match your filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left font-medium text-muted-foreground px-6 py-3">Event</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3">Date</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3">Category</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">Event Cost</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">Units Sold</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">Avg Price</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">Break-Even</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">Revenue</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3">ROI</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((event) => {
                      const roi = roiMap[event.id];
                      const cost = roi ? roi.eventCost || 0 : null;
                      const units = roi?.unitsSold ?? null;
                      const avgPrice = roi ? roi.avgItemPrice || 0 : null;
                      const revenue = units !== null && avgPrice !== null ? units * avgPrice : null;
                      const breakEven = cost && avgPrice ? Math.ceil(cost / avgPrice) : null;
                      const roiPct = cost && cost > 0 && revenue !== null ? ((revenue - cost) / cost) * 100 : null;

                      return (
                        <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3 font-medium max-w-[180px]">
                            <div className="truncate">{event.title}</div>
                            {roi?.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{roi.notes}</div>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{format(parseISO(event.date), "MMM d, yyyy")}</td>
                          <td className="px-4 py-3 text-muted-foreground">{event.category || "—"}</td>
                          <td className="px-4 py-3 text-right font-medium">{cost !== null ? fmt$(cost) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right">{units !== null ? units.toLocaleString() : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right">{avgPrice !== null && avgPrice > 0 ? fmt$(avgPrice) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right">
                            {breakEven !== null && avgPrice! > 0 ? (
                              <span className={units !== null && units >= breakEven ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                                {breakEven.toLocaleString()} units
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{revenue !== null && revenue > 0 ? fmt$(revenue) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right"><RoiBadge roi={roiPct} /></td>
                          <td className="px-4 py-3">
                            <Badge className={`${STATUS_COLORS[event.status] || STATUS_COLORS.draft} border-0 capitalize`}>{event.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEdit(event)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <Link href={`/dashboard/events/${event.id}`}>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editDialog && (
        <Dialog open onOpenChange={() => setEditDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit ROI Data</DialogTitle>
              <p className="text-sm text-muted-foreground">{editDialog.title}</p>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Event Cost ($)</Label>
                  <Input type="number" min="0" placeholder="0" value={editDialog.cost}
                    onChange={(e) => setEditDialog((d) => d && ({ ...d, cost: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Avg Item Price ($)</Label>
                  <Input type="number" min="0" placeholder="0" value={editDialog.price}
                    onChange={(e) => setEditDialog((d) => d && ({ ...d, price: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Units Sold</Label>
                <Input type="number" min="0" placeholder="0" value={editDialog.units}
                  onChange={(e) => setEditDialog((d) => d && ({ ...d, units: e.target.value }))} />
                {editDialog.cost && editDialog.price && parseFloat(editDialog.price) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Break-even: <span className="font-medium text-foreground">{Math.ceil(parseFloat(editDialog.cost) / parseFloat(editDialog.price)).toLocaleString()} units</span> needed to cover costs
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="e.g. VIP clientele, strong sell-through..." value={editDialog.notes}
                  onChange={(e) => setEditDialog((d) => d && ({ ...d, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
              <Button
                disabled={updateRoi.isPending}
                onClick={() => updateRoi.mutate({
                  eventId: editDialog.id,
                  eventCost: parseFloat(editDialog.cost) || 0,
                  unitsSold: parseInt(editDialog.units) || 0,
                  avgItemPrice: parseFloat(editDialog.price) || 0,
                  notes: editDialog.notes,
                }, {
                  onSuccess: () => { toast({ title: "ROI data saved" }); setEditDialog(null); },
                  onError: () => toast({ title: "Failed to save", variant: "destructive" }),
                })}
              >
                {updateRoi.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
