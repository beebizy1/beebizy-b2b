import { AppLayout } from "@/components/layout/AppLayout";
import { useCreateRegistration, getListRegistrationsQueryKey, useListEvents, useListAttendees } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { QueryErrorInline } from "@/components/QueryError";

const formSchema = z.object({
  eventId: z.string().min(1, "Event is required"),
  attendeeId: z.string().min(1, "Attendee is required"),
  status: z.enum(["pending", "confirmed", "cancelled"]).default("confirmed"),
});

type FormValues = z.infer<typeof formSchema>;

export default function RegistrationCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRegistration = useCreateRegistration();

  const { data: events, isLoading: eventsLoading, isError: eventsIsError, error: eventsError } = useListEvents();
  const { data: attendees, isLoading: attendeesLoading, isError: attendeesIsError, error: attendeesError } = useListAttendees();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventId: "",
      attendeeId: "",
      status: "confirmed",
    },
  });

  const onSubmit = (data: FormValues) => {
    createRegistration.mutate(
      { 
        data: {
          eventId: data.eventId,
          attendeeId: data.attendeeId,
          status: data.status,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRegistrationsQueryKey() });
          toast({ title: "Registration created successfully" });
          setLocation("/dashboard/registrations");
        },
        onError: () => {
          toast({ title: "Failed to create registration", variant: "destructive" });
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/registrations">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Registrations
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">New Registration</h1>

        {eventsIsError && <QueryErrorInline error={eventsError} label="Failed to load events." />}
        {attendeesIsError && <QueryErrorInline error={attendeesError} label="Failed to load attendees." />}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4 bg-card p-6 rounded-xl border">
              
              <FormField
                control={form.control}
                name="eventId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger disabled={eventsLoading}>
                          <SelectValue placeholder="Select an event" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {events?.map(event => (
                          <SelectItem key={event.id} value={event.id.toString()}>{event.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attendeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attendee</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger disabled={attendeesLoading}>
                          <SelectValue placeholder="Select an attendee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {attendees?.map(attendee => (
                          <SelectItem key={attendee.id} value={attendee.id.toString()}>{attendee.name} ({attendee.contact})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            <div className="flex justify-end gap-4">
              <Link href="/dashboard/registrations">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createRegistration.isPending}>
                {createRegistration.isPending ? "Creating..." : "Create Registration"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
