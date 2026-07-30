import { useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListRegistrations, useListEvents, getListRegistrationsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/QueryError";

export default function RegistrationsList() {
  const { data: registrations, isLoading, isError, error } = useListRegistrations();
  // Events collection is the source of truth for the name (stored as `title`) — used as a
  // fallback for registrations created before eventTitle was denormalized onto the doc.
  const { data: events } = useListEvents();
  const eventTitleById = useMemo(() => {
    const map = new Map<string, string>();
    events?.forEach((e) => map.set(e.id, e.title));
    return map;
  }, [events]);

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Registrations</h1>
          <Link href="/dashboard/registrations/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Registration
            </Button>
          </Link>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <QueryError error={error} label="Failed to load registrations." />
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : registrations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No registrations found.
                  </TableCell>
                </TableRow>
              ) : (
                registrations?.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/events/${reg.eventId}`}>
                        <Button variant="link" className="px-0 h-auto p-0">
                          {eventTitleById.get(reg.eventId) ?? reg.eventTitle}
                        </Button>
                      </Link>
                    </TableCell>
                    <TableCell>{reg.attendee?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={reg.status === 'confirmed' ? 'default' : 'secondary'} className="capitalize">
                        {reg.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(reg.registeredAt), "MMM d, yyyy")}
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
