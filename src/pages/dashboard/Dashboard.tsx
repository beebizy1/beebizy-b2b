import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useGetStats,
  useListUpcomingEvents,
  useListEvents,
  listBudgetItems,
  getListBudgetItemsQueryKey,
  type Event,
} from "@workspace/api-client-react";
import { useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Users, Ticket, Activity, MapPin, ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Link } from "wouter";
import { QueryError } from "@/components/QueryError";

type GroupingDimension = "location" | "category";
type DateRangeKey = "this-year" | "this-month" | "last-30" | "all-time";

const GROUPING_STORAGE_KEY = "beebizy_dashboard_grouping";

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "this-year", label: "This Year" },
  { value: "this-month", label: "This Month" },
  { value: "last-30", label: "Last 30 Days" },
  { value: "all-time", label: "All Time" },
];

function getDateRange(key: DateRangeKey): { start: Date | null; end: Date | null } {
  const now = new Date();
  switch (key) {
    case "this-year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "this-month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last-30":
      return { start: subDays(now, 30), end: now };
    case "all-time":
      return { start: null, end: null };
  }
}

interface GroupSummary {
  key: string;
  label: string;
  events: Event[];
  upcomingCount: number;
  completedCount: number;
  budgetAllocated: number;
  budgetSpent: number;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErr } = useGetStats();
  const { data: upcomingEvents, isLoading: upcomingLoading } = useListUpcomingEvents();
  const { data: allEvents, isLoading: eventsLoading, isError: eventsIsError, error: eventsErr } = useListEvents();

  const [dateRangeKey, setDateRangeKey] = useState<DateRangeKey>("this-year");
  const [grouping, setGrouping] = useState<GroupingDimension>("location");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (saved === "location" || saved === "category") setGrouping(saved);
  }, []);

  const handleGroupingChange = (value: GroupingDimension) => {
    setGrouping(value);
    setExpandedGroup(null);
    localStorage.setItem(GROUPING_STORAGE_KEY, value);
  };

  const { start, end } = useMemo(() => getDateRange(dateRangeKey), [dateRangeKey]);

  const eventsInRange = useMemo(() => {
    if (!allEvents) return [];
    if (!start || !end) return allEvents;
    return allEvents.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [allEvents, start, end]);

  const eventIds = useMemo(() => eventsInRange.map((e) => e.id), [eventsInRange]);

  const budgetQueries = useQueries({
    queries: eventIds.map((id) => ({
      queryKey: getListBudgetItemsQueryKey(id),
      queryFn: () => listBudgetItems(id),
      staleTime: 60_000,
    })),
  });
  const budgetLoading = budgetQueries.some((q) => q.isLoading);

  const budgetByEventId = useMemo(() => {
    const map = new Map<string, { allocated: number; spent: number }>();
    eventIds.forEach((id, i) => {
      const items = budgetQueries[i]?.data ?? [];
      const expenseItems = items.filter((item) => item.type === "expense");
      map.set(id, {
        allocated: expenseItems.reduce((sum, item) => sum + item.estimatedAmount, 0),
        spent: expenseItems.reduce((sum, item) => sum + (item.actualAmount ?? 0), 0),
      });
    });
    return map;
  }, [eventIds, budgetQueries]);

  const groups: GroupSummary[] = useMemo(() => {
    const now = new Date();
    const map = new Map<string, GroupSummary>();

    for (const event of eventsInRange) {
      const key =
        grouping === "location"
          ? event.locationId != null ? String(event.locationId) : "unassigned"
          : event.category || "Uncategorized";
      const label =
        grouping === "location"
          ? event.locationRecord?.name ?? event.location ?? "No Location"
          : event.category || "Uncategorized";

      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          events: [],
          upcomingCount: 0,
          completedCount: 0,
          budgetAllocated: 0,
          budgetSpent: 0,
        });
      }

      const group = map.get(key)!;
      group.events.push(event);
      if (new Date(event.date) >= now) {
        group.upcomingCount += 1;
      } else {
        group.completedCount += 1;
      }
      const budget = budgetByEventId.get(event.id);
      if (budget) {
        group.budgetAllocated += budget.allocated;
        group.budgetSpent += budget.spent;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.events.length - a.events.length);
  }, [eventsInRange, grouping, budgetByEventId]);

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Select value={dateRangeKey} onValueChange={(v) => setDateRangeKey(v as DateRangeKey)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={grouping} onValueChange={(v) => handleGroupingChange(v as GroupingDimension)}>
              <SelectTrigger className="w-[180px]">
                <LayoutGrid className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="location">Group by Location</SelectItem>
                <SelectItem value="category">Group by Category</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(statsError || eventsIsError) && (
          <QueryError error={statsError ? statsErr : eventsErr} label="Failed to load dashboard data." />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
          <StatsCard
            title={`Events (${DATE_RANGE_OPTIONS.find((o) => o.value === dateRangeKey)?.label})`}
            value={eventsInRange.length}
            icon={Calendar}
            loading={eventsLoading}
          />
          <StatsCard
            title="Total Locations"
            value={stats?.totalLocations}
            icon={MapPin}
            loading={statsLoading}
          />
          <StatsCard
            title="Total Attendees"
            value={stats?.totalAttendees}
            icon={Users}
            loading={statsLoading}
          />
          <StatsCard
            title="Total Registrations"
            value={stats?.totalRegistrations}
            icon={Ticket}
            loading={statsLoading}
          />
          <StatsCard
            title="Confirmed Registrations"
            value={stats?.confirmedRegistrations}
            icon={Activity}
            loading={statsLoading}
          />
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>
              Events by {grouping === "location" ? "Location" : "Category"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md bg-muted/20">
                No events in this date range.
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const isExpanded = expandedGroup === group.key;
                  const utilization = group.budgetAllocated > 0
                    ? Math.min(100, Math.round((group.budgetSpent / group.budgetAllocated) * 100))
                    : 0;
                  return (
                    <div key={group.key} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        className="w-full flex items-center justify-between gap-4 p-4 hover:bg-accent/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{group.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {group.upcomingCount} upcoming • {group.completedCount} completed
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 shrink-0">
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Events</div>
                            <div className="font-mono font-semibold">{group.events.length}</div>
                          </div>
                          <div className="text-right w-36 hidden sm:block">
                            <div className="text-xs text-muted-foreground">
                              Budget {budgetLoading ? "…" : `$${group.budgetSpent.toLocaleString()} / $${group.budgetAllocated.toLocaleString()}`}
                            </div>
                            <Progress value={utilization} className="h-1.5 mt-1" />
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border divide-y divide-border">
                          {group.events.map((event) => (
                            <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                              <div className="flex items-center justify-between px-4 py-3 pl-11 hover:bg-accent/30 cursor-pointer transition-colors">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{event.title}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(event.date), "MMM d, yyyy")} • <span className="capitalize">{event.status}</span>
                                  </div>
                                </div>
                                <div className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-md shrink-0">
                                  {event.registrationCount ?? 0} / {event.capacity || '∞'} registered
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events (Next 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : upcomingEvents?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No upcoming events in the next 30 days.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingEvents?.map((event) => (
                  <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer bg-card hover:bg-accent">
                      <div>
                        <div className="font-semibold">{event.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(event.date), "MMM d, yyyy")} • {event.locationRecord ? `${event.locationRecord.name} (${event.locationRecord.city})` : (event.location || 'No location')}
                        </div>
                      </div>
                      <div className="text-sm font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">
                        {event.registrationCount} / {event.capacity || '∞'} registered
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatsCard({ title, value, icon: Icon, loading }: { title: string, value?: number, icon: any, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
