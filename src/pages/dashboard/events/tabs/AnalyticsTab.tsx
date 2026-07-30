import {
  useGetEvent,
  useListEventRegistrations,
  useListBudgetItems,
  useListAuctionItems,
  useListSponsorships,
  useListChecklist,
  getGetEventQueryKey,
  getListEventRegistrationsQueryKey,
  getListBudgetItemsQueryKey,
  getListAuctionItemsQueryKey,
  getListSponsorshipsQueryKey,
  getListChecklistQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, DollarSign, ClipboardCheck, Trophy, HandCoins, CheckCircle2, Circle } from "lucide-react";
import { QueryError } from "@/components/QueryError";
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

interface Props { eventId: string }

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-5 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-sm font-medium text-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function InlineBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  gold: "bg-amber-400",
  silver: "bg-slate-400",
  bronze: "bg-orange-600",
  custom: "bg-violet-500",
};

const TIER_LABELS: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  custom: "Custom",
};

const AUCTION_STATUS_COLORS: Record<string, string> = {
  open: "#94a3b8",
  won: "#10b981",
  cancelled: "#ef4444",
  unsold: "#f59e0b",
};

export function AnalyticsTab({ eventId }: Props) {
  const { data: event } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) },
  });
  const { data: registrations, isLoading: regLoading, isError: regIsError, error: regError } = useListEventRegistrations(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventRegistrationsQueryKey(eventId) },
  });
  const { data: budgetItems, isLoading: budgetLoading, isError: budgetIsError, error: budgetError } = useListBudgetItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListBudgetItemsQueryKey(eventId) },
  });
  const { data: auctionItems, isLoading: auctionLoading, isError: auctionIsError, error: auctionError } = useListAuctionItems(eventId, {
    query: { enabled: !!eventId, queryKey: getListAuctionItemsQueryKey(eventId) },
  });
  const { data: sponsorships, isLoading: sponsorLoading, isError: sponsorIsError, error: sponsorError } = useListSponsorships(eventId, {
    query: { enabled: !!eventId, queryKey: getListSponsorshipsQueryKey(eventId) },
  });
  const { data: checklist, isLoading: checklistLoading, isError: checklistIsError, error: checklistError } = useListChecklist(eventId, {
    query: { enabled: !!eventId, queryKey: getListChecklistQueryKey(eventId) },
  });

  const isLoading = regLoading || budgetLoading || auctionLoading || sponsorLoading || checklistLoading;
  const isError = regIsError || budgetIsError || auctionIsError || sponsorIsError || checklistIsError;
  const firstError = regError ?? budgetError ?? auctionError ?? sponsorError ?? checklistError;

  if (isError) {
    return <QueryError error={firstError} label="Failed to load analytics." />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // ── Registrations ──
  const confirmed = registrations?.filter(r => r.status === "confirmed").length ?? 0;
  const cancelled = registrations?.filter(r => r.status === "cancelled").length ?? 0;
  const pending = registrations?.filter(r => r.status === "pending").length ?? 0;
  const totalReg = registrations?.length ?? 0;
  const capacity = event?.capacity ?? 0;
  const fillPct = capacity > 0 ? pct(confirmed, capacity) : 0;

  // ── Budget ──
  const expenses = budgetItems?.filter(b => b.type === "expense") ?? [];
  const revenues = budgetItems?.filter(b => b.type === "revenue") ?? [];
  const totalExpEst = expenses.reduce((s, b) => s + Number(b.estimatedAmount ?? 0), 0);
  const totalExpAct = expenses.reduce((s, b) => s + Number(b.actualAmount ?? b.estimatedAmount ?? 0), 0);
  const totalRevEst = revenues.reduce((s, b) => s + Number(b.estimatedAmount ?? 0), 0);
  const totalRevAct = revenues.reduce((s, b) => s + Number(b.actualAmount ?? b.estimatedAmount ?? 0), 0);
  const netActual = totalRevAct - totalExpAct;

  const expenseByCategory = expenses.reduce<Record<string, { est: number; act: number }>>((acc, b) => {
    const cat = b.category ?? "Other";
    if (!acc[cat]) acc[cat] = { est: 0, act: 0 };
    acc[cat].est += Number(b.estimatedAmount ?? 0);
    acc[cat].act += Number(b.actualAmount ?? b.estimatedAmount ?? 0);
    return acc;
  }, {});
  const expCatChartData = Object.entries(expenseByCategory)
    .map(([name, v]) => ({ name, Estimated: v.est, Actual: v.act }))
    .sort((a, b) => b.Actual - a.Actual)
    .slice(0, 8);

  // ── Auction ──
  const wonItems = auctionItems?.filter(a => a.status === "won") ?? [];
  const openItems = auctionItems?.filter(a => a.status === "open") ?? [];
  const totalAuctionRaised = wonItems.reduce((s, a) => s + Number(a.currentBid ?? 0), 0);
  const paidItems = wonItems.filter(a => !!a.paymentReceivedAt);
  const totalCollected = paidItems.reduce((s, a) => s + Number(a.currentBid ?? 0), 0);

  const auctionStatusData = ["open", "won", "cancelled", "unsold"]
    .map(status => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      count: auctionItems?.filter(a => a.status === status).length ?? 0,
      color: AUCTION_STATUS_COLORS[status],
    }))
    .filter(d => d.count > 0);

  // ── Sponsorships ──
  const confirmedSponsors = sponsorships?.filter(s => s.status === "confirmed") ?? [];
  const totalSponsorRaised = confirmedSponsors.reduce((s, sp) => s + Number(sp.amount ?? 0), 0);

  const sponsorByTier = (sponsorships ?? []).reduce<Record<string, { count: number; amount: number }>>((acc, s) => {
    const tier = s.tier;
    if (!acc[tier]) acc[tier] = { count: 0, amount: 0 };
    acc[tier].count++;
    acc[tier].amount += Number(s.amount ?? 0);
    return acc;
  }, {});

  const totalFundraisingRaised = totalAuctionRaised + totalSponsorRaised;

  // ── Checklist ──
  const totalTasks = checklist?.length ?? 0;
  const doneTasks = checklist?.filter(c => c.completed).length ?? 0;
  const donePct = pct(doneTasks, totalTasks);

  return (
    <div className="space-y-8">

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Registrations"
          value={capacity > 0 ? `${confirmed} / ${capacity}` : `${totalReg}`}
          sub={capacity > 0 ? `${fillPct}% capacity filled` : `${confirmed} confirmed`}
          color="bg-blue-100 text-blue-600"
        />
        <KpiCard
          icon={HandCoins}
          label="Fundraising Raised"
          value={fmt(totalFundraisingRaised)}
          sub={`${fmt(totalCollected)} collected`}
          color="bg-emerald-100 text-emerald-600"
        />
        <KpiCard
          icon={DollarSign}
          label="Budget Net"
          value={fmt(netActual)}
          sub={`${fmt(totalRevAct)} rev · ${fmt(totalExpAct)} exp`}
          color={netActual >= 0 ? "bg-teal-100 text-teal-600" : "bg-red-100 text-red-600"}
        />
        <KpiCard
          icon={ClipboardCheck}
          label="Checklist"
          value={totalTasks > 0 ? `${donePct}%` : "—"}
          sub={totalTasks > 0 ? `${doneTasks} of ${totalTasks} tasks done` : "No tasks yet"}
          color="bg-violet-100 text-violet-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Registration breakdown */}
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold">Registrations</h3>
          </div>

          {capacity > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Capacity fill</span>
                <span className="font-semibold">{fillPct}%</span>
              </div>
              <InlineBar pct={fillPct} color="bg-blue-500" />
              <div className="text-xs text-muted-foreground">{confirmed} confirmed of {capacity} capacity</div>
            </div>
          )}

          <div className="space-y-3">
            {[
              { label: "Confirmed", count: confirmed, color: "bg-emerald-500", textColor: "text-emerald-600" },
              { label: "Cancelled", count: cancelled, color: "bg-red-400", textColor: "text-red-500" },
              { label: "Pending", count: pending, color: "bg-amber-400", textColor: "text-amber-600" },
            ].map(({ label, count, color, textColor }) => (
              count > 0 || label === "Confirmed" ? (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{}} >
                    <div className={`w-full h-full rounded-full ${color}`} />
                  </div>
                  <div className="flex-1 text-sm">{label}</div>
                  <div className={`text-sm font-semibold ${textColor}`}>{count}</div>
                  <div className="w-24">
                    <InlineBar pct={pct(count, totalReg || 1)} color={color} />
                  </div>
                </div>
              ) : null
            ))}
          </div>

          {totalReg === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No registrations yet.</p>
          )}
        </div>

        {/* Checklist progress */}
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-violet-500" />
            <h3 className="font-semibold">Checklist Progress</h3>
          </div>

          {totalTasks === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No checklist tasks yet.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall completion</span>
                  <span className="font-semibold">{donePct}%</span>
                </div>
                <InlineBar pct={donePct} color="bg-violet-500" />
              </div>

              {/* Category breakdown */}
              {(() => {
                const byCategory = (checklist ?? []).reduce<Record<string, { done: number; total: number }>>((acc, c) => {
                  const cat = c.category ?? "Other";
                  if (!acc[cat]) acc[cat] = { done: 0, total: 0 };
                  acc[cat].total++;
                  if (c.completed) acc[cat].done++;
                  return acc;
                }, {});

                return (
                  <div className="space-y-2.5 mt-2">
                    {Object.entries(byCategory).map(([cat, { done, total }]) => (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{cat}</span>
                          <span className="font-medium">{done}/{total}</span>
                        </div>
                        <InlineBar pct={pct(done, total)} color="bg-violet-400" />
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {doneTasks} done</span>
                <span className="flex items-center gap-1"><Circle className="w-3.5 h-3.5 text-muted-foreground" /> {totalTasks - doneTasks} remaining</span>
              </div>
            </>
          )}
        </div>

        {/* Fundraising */}
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold">Fundraising Breakdown</h3>
          </div>

          {/* Auction summary */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auction Items</div>
            {(auctionItems?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No auction items yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-600">{fmt(totalAuctionRaised)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Won bids total</div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{fmt(totalCollected)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Payment received</div>
                  </div>
                </div>
                {totalAuctionRaised > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Collection rate</span>
                      <span className="font-semibold">{pct(totalCollected, totalAuctionRaised)}%</span>
                    </div>
                    <InlineBar pct={pct(totalCollected, totalAuctionRaised)} color="bg-emerald-500" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {auctionStatusData.map(({ name, count, color }) => (
                    <div key={name} className="flex items-center gap-1.5 text-xs bg-muted/40 rounded-full px-2.5 py-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{name}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sponsorships */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sponsorships</div>
            {(sponsorships?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No sponsorships yet.</p>
            ) : (
              <>
                <div className="text-sm">
                  <span className="text-lg font-bold text-emerald-600">{fmt(totalSponsorRaised)}</span>
                  <span className="text-muted-foreground text-xs ml-1">from {confirmedSponsors.length} confirmed sponsor{confirmedSponsors.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(sponsorByTier).map(([tier, { count, amount }]) => (
                    <div key={tier} className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${TIER_COLORS[tier] ?? "bg-muted"}`} />
                      <div className="flex-1 text-sm">{TIER_LABELS[tier] ?? tier}</div>
                      <div className="text-xs text-muted-foreground">{count} sponsor{count !== 1 ? "s" : ""}</div>
                      <div className="text-sm font-semibold">{amount > 0 ? fmt(amount) : "—"}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Budget */}
        <div className="bg-card border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-500" />
            <h3 className="font-semibold">Budget & ROI</h3>
          </div>

          {(budgetItems?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No budget items yet.</p>
          ) : (
            <>
              {/* Revenue vs Expense summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Revenue (actual)</div>
                  <div className="text-lg font-bold text-emerald-700">{fmt(totalRevAct)}</div>
                  <div className="text-xs text-muted-foreground">est. {fmt(totalRevEst)}</div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Expenses (actual)</div>
                  <div className="text-lg font-bold text-red-700">{fmt(totalExpAct)}</div>
                  <div className="text-xs text-muted-foreground">est. {fmt(totalExpEst)}</div>
                </div>
              </div>

              <div className={`rounded-lg border p-3 flex items-center justify-between ${netActual >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                <div className="flex items-center gap-2">
                  <TrendingUp className={`w-4 h-4 ${netActual >= 0 ? "text-emerald-600" : "text-red-500"}`} />
                  <span className="text-sm font-medium">Net</span>
                </div>
                <span className={`text-lg font-bold ${netActual >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {netActual >= 0 ? "+" : ""}{fmt(netActual)}
                </span>
              </div>

              {/* Expense category chart */}
              {expCatChartData.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expenses by Category</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={expCatChartData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                      <Tooltip
                        formatter={(v: number) => fmt(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="Estimated" fill="hsl(var(--muted-foreground) / 0.3)" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Actual" radius={[0, 3, 3, 0]}>
                        {expCatChartData.map((_, i) => (
                          <Cell key={i} fill="hsl(221 83% 53%)" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs text-muted-foreground justify-center">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-muted-foreground/30" /> Estimated</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-blue-600" /> Actual</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
