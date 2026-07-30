import { useGetTicketReport, getGetTicketReportQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format } from "date-fns";
import { Ticket, TrendingUp, DollarSign, BarChart2, ArrowRight, Circle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { QueryError } from "@/components/QueryError";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

const STATUS_COLORS: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-600",
  completed: "bg-blue-100 text-blue-700",
};

export default function TicketSalesPage() {
  const { data: report, isLoading, isError, error } = useGetTicketReport({
    query: { queryKey: getGetTicketReportQueryKey() },
  });

  // Aggregate by event
  const eventMap = new Map<string, {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventStatus: string;
    eventCategory: string;
    revenue: number;
    sold: number;
    total: number;
    types: typeof report;
  }>();

  (report ?? []).forEach(t => {
    const existing = eventMap.get(t.eventId);
    const rev = parseFloat(t.price) * t.quantitySold;
    if (existing) {
      existing.revenue += rev;
      existing.sold += t.quantitySold;
      existing.total += t.quantityTotal;
      existing.types!.push(t);
    } else {
      eventMap.set(t.eventId, {
        eventId: t.eventId,
        eventTitle: t.eventTitle,
        eventDate: t.eventDate,
        eventStatus: t.eventStatus,
        eventCategory: t.eventCategory,
        revenue: rev,
        sold: t.quantitySold,
        total: t.quantityTotal,
        types: [t],
      });
    }
  });

  const events = Array.from(eventMap.values()).sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
  );

  const totalRevenue = events.reduce((s, e) => s + e.revenue, 0);
  const totalSold = events.reduce((s, e) => s + e.sold, 0);
  const totalAvailable = events.reduce((s, e) => s + e.total, 0);
  const avgTicketPrice = totalSold > 0
    ? (report ?? []).reduce((s, t) => s + parseFloat(t.price) * t.quantitySold, 0) / totalSold
    : 0;

  const chartData = events
    .filter(e => e.total > 0)
    .slice(0, 10)
    .map(e => ({
      name: e.eventTitle.length > 18 ? e.eventTitle.slice(0, 16) + "…" : e.eventTitle,
      Revenue: Math.round(e.revenue),
      Sold: e.sold,
      status: e.eventStatus,
    }));

  const hasData = events.length > 0;

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Ticket className="w-7 h-7 text-primary" /> Ticket Sales
          </h1>
          <p className="text-muted-foreground mt-1">Revenue and sales across all events.</p>
        </div>

        {isError ? (
          <QueryError error={error} label="Failed to load ticket sales." />
        ) : isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : !hasData ? (
          <div className="text-center py-20 bg-muted/20 border border-dashed rounded-xl space-y-4">
            <Ticket className="w-10 h-10 mx-auto opacity-30" />
            <div>
              <p className="font-semibold">No ticket types set up yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Open any event and go to the Tickets tab to create pricing tiers.
              </p>
            </div>
            <Link href="/dashboard/events">
              <span className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer">
                Browse events <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: DollarSign, label: "Total Revenue", value: fmt(totalRevenue), color: "bg-emerald-100 text-emerald-700" },
                { icon: Ticket, label: "Tickets Sold", value: totalSold.toLocaleString(), color: "bg-blue-100 text-blue-700" },
                { icon: TrendingUp, label: "Avg Ticket Price", value: fmt(avgTicketPrice), color: "bg-violet-100 text-violet-700" },
                { icon: BarChart2, label: "Overall Fill Rate", value: `${pct(totalSold, totalAvailable)}%`, color: "bg-amber-100 text-amber-700" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-card border rounded-xl p-5 flex flex-col gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold tracking-tight">{value}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue by event bar chart */}
            {chartData.length > 0 && (
              <div className="bg-card border rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">Revenue by Event</h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.status === "published" ? "hsl(221 83% 53%)" : "hsl(var(--muted-foreground) / 0.4)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs text-muted-foreground justify-center">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Published</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted-foreground/40 inline-block" /> Draft/Other</span>
                </div>
              </div>
            )}

            {/* Event-by-event breakdown */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">Event Breakdown</h3>
              </div>
              <div className="divide-y divide-border">
                {events.map(e => {
                  const fillPct = pct(e.sold, e.total);
                  return (
                    <div key={e.eventId} className="px-6 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/dashboard/events/${e.eventId}`}>
                              <span className="font-semibold hover:text-primary cursor-pointer transition-colors">
                                {e.eventTitle}
                              </span>
                            </Link>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[e.eventStatus] ?? "bg-muted text-muted-foreground"}`}>
                              {e.eventStatus}
                            </span>
                            <span className="text-xs text-muted-foreground">{e.eventCategory}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(e.eventDate), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-emerald-600">{fmt(e.revenue)}</div>
                          <div className="text-xs text-muted-foreground">{e.sold} sold</div>
                        </div>
                      </div>

                      {/* Ticket type pills */}
                      <div className="flex flex-wrap gap-2">
                        {e.types!.map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-1.5">
                            <Circle className={`w-2 h-2 shrink-0 ${t.isActive ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground text-muted-foreground"}`} />
                            <span className="font-medium">{t.name}</span>
                            <span className="text-muted-foreground">{fmt(parseFloat(t.price))}</span>
                            <span className="text-muted-foreground">·</span>
                            <span>{t.quantitySold}/{t.quantityTotal}</span>
                          </div>
                        ))}
                      </div>

                      {e.total > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Fill rate</span>
                            <span>{fillPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${fillPct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
