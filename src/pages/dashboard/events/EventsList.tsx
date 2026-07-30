import { AppLayout } from "@/components/layout/AppLayout";
import { useListEvents, useListLocations, getListEventsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Plus, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function EventsList() {
  const [locationId, setLocationId] = useState<string>("all");
  const { data: events, isLoading, isError, error } = useListEvents(locationId !== "all" ? { locationId } : undefined);
  const { data: locations } = useListLocations();

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations?.map(loc => (
                  <SelectItem key={loc.id} value={loc.id.toString()}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link href="/dashboard/events/new">
              <Button className="gap-2 shrink-0">
                <Plus className="w-4 h-4" />
                Create Event
              </Button>
            </Link>
          </div>
        </div>

        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Registrations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-destructive">
                    <div className="font-medium">Failed to load events.</div>
                    <div className="text-sm mt-1 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</div>
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : events?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No events found.
                  </TableCell>
                </TableRow>
              ) : (
                events?.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      <div>{event.title}</div>
                      {event.locationRecord && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-teal-600 bg-teal-50 dark:bg-teal-950/30 dark:text-teal-400 px-1.5 py-0.5 rounded-sm w-fit border border-teal-100 dark:border-teal-900">
                          <MapPin className="w-3 h-3" />
                          {event.locationRecord.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(event.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <span className="capitalize px-2 py-1 bg-secondary/10 text-secondary-foreground rounded-md text-xs font-medium">
                        {event.status}
                      </span>
                    </TableCell>
                    <TableCell>{event.category}</TableCell>
                    <TableCell>
                      {event.registrationCount} {event.capacity ? `/ ${event.capacity}` : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/events/${event.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}