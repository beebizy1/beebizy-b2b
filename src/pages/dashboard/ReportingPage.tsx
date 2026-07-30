import { AppLayout } from "@/components/layout/AppLayout";
import { useListEvents, useGetStats, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Users, Ticket, Activity, MapPin, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, parseISO, startOfMonth } from "date-fns";
import { QueryError } from "@/components/QueryError";

const COLORS = ["#0d9488", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#10b981", "#f97316", "#06b6d4"];

function StatCard({ title, value, icon: Icon, loading }: { title: string; value?: number; icon: React.ElementType; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-900/30">
          <Icon className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="h-8 w-16 mt-1" /> : <p className="text-3xl font-bold">{value ?? 0}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportingPage() {
  const { data: stats, isLoading: statsLoading, isError: statsIsError, error: statsError } = useGetStats();
  const { data: events = [], isLoading: eventsLoading, isError: eventsIsError, error: eventsError } = useListEvents();
  const { data: locations = [], isLoading: locationsLoading } = useListLocations();

  const byCategory = Object.entries(
    events.reduce((acc, e) => {
      const cat = e.category || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const byStatus = Object.entries(
    events.reduce((acc, e) => {
      const s = e.status || "unknown";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

  const byMonth = Object.entries(
    events.reduce((acc, e) => {
      const key = format(startOfMonth(parseISO(e.date)), "MMM yyyy");
      acc[key] = (acc[key] || 0) + (e.registrationCount || 0);
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([month, registrations]) => ({ month, registrations }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
    .slice(-12);

  const locationPerf = locations
    .map((loc) => ({
      name: loc.name,
      events: (loc as { eventCount?: number }).eventCount || 0,
    }))
    .filter((l) => l.events > 0)
    .sort((a, b) => b.events - a.events)
    .slice(0, 8);

  const fillRate = events.length
    ? Math.round(
        events.reduce((sum, e) => sum + (e.capacity ? (e.registrationCount || 0) / e.capacity : 0), 0) /
          events.filter((e) => e.capacity).length *
          100
      )
    : 0;

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Reporting</h1>
          <p className="text-muted-foreground mt-1">Overview of event performance and engagement metrics</p>
        </div>

        {(statsIsError || eventsIsError) && (
          <QueryError error={statsIsError ? statsError : eventsError} label="Failed to load reporting data." />
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard title="Total Events" value={stats?.totalEvents} icon={Calendar} loading={statsLoading} />
          <StatCard title="Total Locations" value={stats?.totalLocations} icon={MapPin} loading={statsLoading} />
          <StatCard title="Total Attendees" value={stats?.totalAttendees} icon={Users} loading={statsLoading} />
          <StatCard title="Registrations" value={stats?.totalRegistrations} icon={Ticket} loading={statsLoading} />
          <StatCard title="Confirmed" value={stats?.confirmedRegistrations} icon={Activity} loading={statsLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Events by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                      {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Events by Status</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              {eventsLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Registrations by Month</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : byMonth.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No registration data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byMonth} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="registrations" name="Registrations" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Fill Rate</p>
                  <p className="text-3xl font-bold">{isNaN(fillRate) ? "—" : `${fillRate}%`}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Locations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {locationsLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : locationPerf.length === 0 ? (
                  <p className="px-6 pb-4 text-sm text-muted-foreground">No location data yet</p>
                ) : (
                  <div className="divide-y divide-border">
                    {locationPerf.map((loc) => (
                      <div key={loc.name} className="flex items-center justify-between px-6 py-2 text-sm">
                        <span className="font-medium truncate">{loc.name}</span>
                        <span className="text-muted-foreground ml-4 shrink-0">{loc.events} event{loc.events !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
