import { AppLayout } from "@/components/layout/AppLayout";
import { useGetLocation, useListLocationEvents, getGetLocationQueryKey, getListLocationEventsQueryKey, useDeleteLocation, getListLocationsQueryKey } from "@workspace/api-client-react";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash, MapPin, Phone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import { QueryError } from "@/components/QueryError";

export default function LocationDetail() {
  const [, params] = useRoute("/dashboard/locations/:id");
  const id = params?.id || "";
  const [, setLocationPath] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: location, isLoading: locationLoading, isError: locationIsError, error: locationError } = useGetLocation(id, { query: { enabled: !!id, queryKey: getGetLocationQueryKey(id) } });
  const { data: events, isLoading: eventsLoading, isError: eventsIsError, error: eventsError } = useListLocationEvents(id, { query: { enabled: !!id, queryKey: getListLocationEventsQueryKey(id) } });
  const deleteLocation = useDeleteLocation();

  const handleDelete = () => {
    deleteLocation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Location deleted" });
        queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
        setLocationPath("/dashboard/locations");
      },
      onError: () => {
        toast({ title: "Failed to delete location", variant: "destructive" });
      }
    });
  };

  if (locationLoading) {
    return (
      <AppLayout>
        <div className="p-8 space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </AppLayout>
    );
  }

  if (locationIsError) {
    return (
      <AppLayout>
        <QueryError error={locationError} label="Failed to load location." />
      </AppLayout>
    );
  }

  if (!location) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Location not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/locations">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Locations
            </Button>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
              {location.name}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/locations/${location.id}/edit`}>
              <Button variant="outline" className="gap-2">
                <Edit className="w-4 h-4" />
                Edit
              </Button>
            </Link>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash className="w-4 h-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the location
                    and un-link it from any events.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    {deleteLocation.isPending ? "Deleting..." : "Delete Location"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="space-y-8">
          <Card className="border-teal-500/20 shadow-sm">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Address</div>
                    <div className="font-medium">{location.address || 'No street address'}</div>
                    <div className="text-muted-foreground text-sm">
                      {[location.city, location.state, location.country].filter(Boolean).join(', ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Phone</div>
                    <div className="font-medium">{location.phone || 'No phone number'}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Events at this Location</CardTitle>
              <Badge variant="secondary">{events?.length || 0} Total</Badge>
            </CardHeader>
            <CardContent>
              {eventsIsError ? (
                <QueryError error={eventsError} label="Failed to load events." />
              ) : eventsLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : events?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed">
                  No events hosted here yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Registrations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events?.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Link href={`/dashboard/events/${event.id}`}>
                            <span className="font-medium text-primary hover:underline cursor-pointer">
                              {event.title}
                            </span>
                          </Link>
                          <div className="text-xs text-muted-foreground">{event.category}</div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(event.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {event.registrationCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
