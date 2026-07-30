import { AppLayout } from "@/components/layout/AppLayout";
import { useGetEvent, useUpdateEvent, useListLocations, getGetEventQueryKey, getListEventsQueryKey } from "@workspace/api-client-react";
import { useLocation, Link, useRoute } from "wouter";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/use-categories";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { QueryError } from "@/components/QueryError";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Start Date is required"),
  endDate: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  capacity: z.string().optional().nullable(),
  status: z.enum(["draft", "published", "cancelled", "completed"]),
  category: z.string().min(1, "Category is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function EventEdit() {
  const [, params] = useRoute("/dashboard/events/:id/edit");
  const id = params?.id || "";
  const [, setLocationPath] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: event, isLoading, isError, error } = useGetEvent(id, { query: { enabled: !!id, queryKey: getGetEventQueryKey(id) } });
  const { data: locations } = useListLocations();
  const updateEvent = useUpdateEvent();
  const { categories } = useCategories();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      endDate: "",
      locationId: "none",
      location: "",
      capacity: "",
      status: "draft",
      category: "",
    },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        title: event.title,
        description: event.description || "",
        date: new Date(event.date).toISOString().split("T")[0],
        endDate: event.endDate ? new Date(event.endDate).toISOString().split("T")[0] : "",
        locationId: event.locationId ? event.locationId.toString() : "none",
        location: event.location || "",
        capacity: event.capacity ? event.capacity.toString() : "",
        status: event.status,
        category: event.category,
      });
    }
  }, [event, form]);

  const onSubmit = (data: FormValues) => {
    updateEvent.mutate(
      { 
        id,
        data: {
          ...data,
          description: data.description || undefined,
          endDate: data.endDate || undefined,
          locationId: data.locationId && data.locationId !== "none" ? data.locationId : null,
          location: data.location || undefined,
          capacity: data.capacity ? parseInt(data.capacity, 10) : undefined,
        }
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          toast({ title: "Event updated successfully" });
          setLocationPath(`/dashboard/events/${updated.id}`);
        },
        onError: () => {
          toast({ title: "Failed to update event", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-1/2" />
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <QueryError error={error} label="Failed to load event." />
      </AppLayout>
    );
  }

  if (!event) return null;

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href={`/dashboard/events/${id}`}>
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Event
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">Edit Event</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4 bg-card p-6 rounded-xl border">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Annual Developer Conference" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date (Optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-2">
                <FormField
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No specific location</SelectItem>
                          {locations?.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id.toString()}>
                              {loc.name} — {loc.corporationName} ({loc.city}, {loc.state || loc.country})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Location Text</FormLabel>
                      <FormControl>
                        <Input placeholder="Or enter manual address..." {...field} value={field.value || ''} />
                      </FormControl>
                      <FormDescription>Use if location is not in the system.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-2">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(event?.category && !categories.includes(event.category)
                            ? [event.category, ...categories]
                            : categories
                          ).map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Leave empty for unlimited" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="md:w-1/2">
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What is this event about?" className="h-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Link href={`/dashboard/events/${id}`}>
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={updateEvent.isPending}>
                {updateEvent.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
