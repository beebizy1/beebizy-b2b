import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetEvent, useListEventRegistrations, getGetEventQueryKey, getListEventRegistrationsQueryKey, useDeleteEvent } from "@workspace/api-client-react";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash, MapPin, Clock, ClipboardList, Store, DollarSign, LayoutGrid, Sparkles, HandCoins, Users, BarChart2, UtensilsCrossed, Ticket, Trophy, Gavel } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";
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
import { RunOfShowTab } from "./tabs/RunOfShowTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { VendorsTab } from "./tabs/VendorsTab";
import { BudgetTab } from "./tabs/BudgetTab";
import { FloorplanTab } from "./tabs/FloorplanTab";
import { InspirationTab } from "./tabs/InspirationTab";
import { FundraisingTab } from "./tabs/FundraisingTab";
import { RegistrationsTab } from "./tabs/RegistrationsTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { MenuTab } from "./tabs/MenuTab";
import { TicketsTab } from "./tabs/TicketsTab";
import { RaffleTab } from "./tabs/RaffleTab";
import { SilentAuctionTab } from "./tabs/SilentAuctionTab";
import { LiveAuctionTab } from "./tabs/LiveAuctionTab";
import { SaveAsTemplateDialog } from "@/pages/dashboard/templates/TemplateDetail";
import { ShareEventDialog } from "@/components/ShareEventDialog";

const TABS = [
  { id: "overview", label: "Overview", icon: null },
  { id: "registrations", label: "Registrations", icon: Users },
  { id: "run-of-show", label: "Run of Show", icon: Clock },
  { id: "checklist", label: "Checklist", icon: ClipboardList },
  { id: "vendors", label: "Vendors", icon: Store },
  { id: "budget", label: "Budget & ROI", icon: DollarSign },
  { id: "floorplan", label: "Floorplan", icon: LayoutGrid },
  { id: "inspiration", label: "Inspiration", icon: Sparkles },
  { id: "fundraising", label: "Fundraising", icon: HandCoins },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "raffle", label: "Raffle", icon: Trophy },
  { id: "silent-auction", label: "Silent Auction", icon: Gavel },
  { id: "live-auction", label: "Live Auction", icon: Gavel },
] as const;

type TabId = typeof TABS[number]["id"];

export default function EventDetail() {
  const [, params] = useRoute("/dashboard/events/:id");
  const id = params?.id || "";
  const [, setLocationPath] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: event, isLoading: eventLoading, isError: eventIsError, error: eventError } = useGetEvent(id, { query: { enabled: !!id, queryKey: getGetEventQueryKey(id) } });
  const { data: registrations, isLoading: registrationsLoading, isError: registrationsIsError, error: registrationsError } = useListEventRegistrations(id, { query: { enabled: !!id && activeTab === "overview", queryKey: getListEventRegistrationsQueryKey(id) } });
  const deleteEvent = useDeleteEvent();

  const handleDelete = () => {
    deleteEvent.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Event deleted" });
        setLocationPath("/dashboard/events");
      },
      onError: () => {
        toast({ title: "Failed to delete event", variant: "destructive" });
      }
    });
  };

  if (eventLoading) {
    return (
      <AppLayout>
        <div className="p-8 space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-12 w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48 md:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (eventIsError) {
    return (
      <AppLayout>
        <QueryError error={eventError} label="Failed to load event." />
      </AppLayout>
    );
  }

  if (!event) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Event not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/events">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Events
            </Button>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">{event.title}</h1>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Badge variant="outline" className="capitalize">{event.status}</Badge>
              <Badge variant="secondary">{event.category}</Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ShareEventDialog eventId={event.id} eventTitle={event.title} />
            <SaveAsTemplateDialog eventId={event.id} />
            <Link href={`/dashboard/events/${event.id}/edit`}>
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
                    This action cannot be undone. This will permanently delete the event and remove its data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    {deleteEvent.isPending ? "Deleting..." : "Delete Event"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{event.description || "No description provided."}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle>Registrations ({event.registrationCount || 0})</CardTitle>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setActiveTab("registrations")}>
                    <Users className="w-3.5 h-3.5" /> Manage
                  </Button>
                </CardHeader>
                <CardContent>
                  {registrationsIsError ? (
                    <QueryError error={registrationsError} label="Failed to load registrations." />
                  ) : registrationsLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : registrations?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-md border border-dashed space-y-2">
                      <p className="text-sm">No registrations yet.</p>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab("registrations")}>
                        Add or import guests
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attendee</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Registered At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrations?.map((reg) => (
                          <TableRow key={reg.id}>
                            <TableCell>
                              <div className="font-medium">{reg.attendee.name}</div>
                              <div className="text-xs text-muted-foreground">{reg.attendee.contact}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={reg.status === "confirmed" ? "default" : "secondary"} className="capitalize">
                                {reg.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(reg.registeredAt), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Date</div>
                    <div>{format(new Date(event.date), "PPP")}</div>
                    {event.endDate && (
                      <div className="text-sm text-muted-foreground">
                        to {format(new Date(event.endDate), "PPP")}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">Location</div>
                    {event.locationRecord ? (
                      <Link href={`/dashboard/locations/${event.locationRecord.id}`}>
                        <div className="group rounded-md border border-border p-3 bg-muted/20 hover:bg-teal-50/50 hover:border-teal-500/50 transition-colors cursor-pointer flex gap-3">
                          <MapPin className="w-5 h-5 text-teal-600 shrink-0" />
                          <div>
                            <div className="font-medium group-hover:text-teal-700 transition-colors">{event.locationRecord.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{event.locationRecord.corporationName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{event.locationRecord.city}{event.locationRecord.state ? `, ${event.locationRecord.state}` : ""}</div>
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div>{event.location || "TBD"}</div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Capacity</div>
                    <div>{event.capacity ? `${event.registrationCount || 0} / ${event.capacity}` : "Unlimited"}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Registrations tab */}
        {activeTab === "registrations" && (
          <RegistrationsTab eventId={id} />
        )}

        {/* Run of Show tab */}
        {activeTab === "run-of-show" && (
          <RunOfShowTab eventId={id} />
        )}

        {/* Checklist tab */}
        {activeTab === "checklist" && (
          <ChecklistTab eventId={id} />
        )}

        {/* Vendors tab */}
        {activeTab === "vendors" && (
          <VendorsTab eventId={id} />
        )}

        {/* Budget tab */}
        {activeTab === "budget" && (
          <BudgetTab eventId={id} />
        )}

        {/* Floorplan tab */}
        {activeTab === "floorplan" && (
          <FloorplanTab eventId={id} />
        )}

        {/* Inspiration tab */}
        {activeTab === "inspiration" && (
          <InspirationTab eventId={id} />
        )}

        {/* Fundraising tab */}
        {activeTab === "fundraising" && (
          <FundraisingTab eventId={id} />
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <AnalyticsTab eventId={id} />
        )}

        {/* Menu tab */}
        {activeTab === "menu" && (
          <MenuTab eventId={id} />
        )}

        {/* Tickets tab */}
        {activeTab === "tickets" && (
          <TicketsTab eventId={id} />
        )}

        {/* Raffle tab */}
        {activeTab === "raffle" && (
          <RaffleTab eventId={id} />
        )}

        {/* Silent Auction tab */}
        {activeTab === "silent-auction" && (
          <SilentAuctionTab eventId={id} />
        )}

        {/* Live Auction tab */}
        {activeTab === "live-auction" && (
          <LiveAuctionTab eventId={id} />
        )}
      </div>
    </AppLayout>
  );
}
