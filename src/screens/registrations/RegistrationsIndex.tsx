/**
 * Registrations.
 *
 * Every registration in the workspace, newest first, as one flat table.
 *
 * The columns are the reference design's five. What sits in them is the joined record
 * rather than the raw foreign key: the adapter returns `RegistrationWithGuest` with the
 * event title denormalised, so the table can print "Annual Partner Gala" and a guest
 * name where the source printed "Event #4" and "Attendee #12". Same columns, readable
 * cells.
 */

import { Link } from "wouter";
import { Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorNotice, PageHeader, Panel, RegistrationStatusBadge } from "@/components/primitives";
import { usePreferences } from "@/app/preferences";
import { useRegistrations } from "@/data/hooks";

export default function RegistrationsIndex() {
  const { date: formatDate } = usePreferences();
  const { data: registrations, isLoading, isError, error, refetch } = useRegistrations();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrations"
        actions={
          <Button asChild>
            <Link href="/app/registrations/new">
              <Plus className="size-4" aria-hidden="true" />
              New Registration
            </Link>
          </Button>
        }
      />

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Attendee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }, (_, cell) => (
                        <TableCell key={cell}>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (registrations?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        icon={Ticket}
                        title="No registrations yet"
                        description="Registrations appear here as guests sign up, on any event in the workspace."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  registrations?.map((registration) => (
                    <TableRow key={registration.id}>
                      <TableCell data-numeric className="font-mono font-medium">
                        #{registration.id}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/events/${registration.eventId}`}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {registration.eventTitle}
                        </Link>
                      </TableCell>
                      <TableCell>{registration.guest?.name ?? "Unknown attendee"}</TableCell>
                      <TableCell>
                        <RegistrationStatusBadge status={registration.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(registration.registeredAt, "dayMonthYear")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
}
