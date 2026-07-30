import { useId, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useCreateEvent,
  useListLocations,
  useListTemplates,
  useGetTemplate,
  useApplyTemplate,
  getListEventsQueryKey,
  getGetTemplateQueryKey,
} from "@workspace/api-client-react";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/use-categories";
import { useAddresses } from "@/hooks/use-addresses";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, X, ClipboardList, Clock, DollarSign } from "lucide-react";
import { QueryErrorInline } from "@/components/QueryError";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  date: z.string().min(1, "Start Date is required"),
  endDate: z.string().optional(),
  locationId: z.string().optional(),
  location: z.string().optional(),
  capacity: z.string().optional(),
  status: z.enum(["draft", "published", "cancelled", "completed"]).default("draft"),
  category: z.string().min(1, "Category is required"),
});

type FormValues = z.infer<typeof formSchema>;

function useTemplateIdFromSearch(): string | null {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  return params.get("template");
}

export default function EventCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEvent = useCreateEvent();
  const applyTemplate = useApplyTemplate();
  const { data: locations, isError: locationsIsError, error: locationsError } = useListLocations();
  const { data: allTemplates = [], isError: templatesIsError, error: templatesError } = useListTemplates();
  const { categories } = useCategories();
  const { addresses: savedAddresses, formatAddress: formatSavedAddress } = useAddresses();
  const addressListId = useId();

  const templateIdFromUrl = useTemplateIdFromSearch();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templateIdFromUrl);

  const { data: selectedTemplate } = useGetTemplate(selectedTemplateId ?? "", {
    query: { enabled: selectedTemplateId != null },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      endDate: "",
      locationId: "none",
      location: "",
      capacity: selectedTemplate?.defaultCapacity?.toString() ?? "",
      status: "draft",
      category: selectedTemplate?.category ?? categories[0] ?? "",
    },
  });

  const onSubmit = (data: FormValues) => {
    const payload = {
      ...data,
      locationId: data.locationId && data.locationId !== "none" ? data.locationId : undefined,
      capacity: data.capacity ? parseInt(data.capacity, 10) : undefined,
    };

    if (selectedTemplateId != null) {
      applyTemplate.mutate(
        {
          id: selectedTemplateId,
          data: {
            title: payload.title,
            description: payload.description,
            date: payload.date,
            endDate: payload.endDate || undefined,
            locationId: payload.locationId,
            location: payload.location || undefined,
            capacity: payload.capacity,
            status: payload.status,
            category: payload.category,
          },
        },
        {
          onSuccess: (event) => {
            queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
            toast({ title: "Event created from template" });
            setLocation(`/dashboard/events/${event.id}`);
          },
          onError: () => toast({ title: "Failed to create event", variant: "destructive" }),
        }
      );
    } else {
      createEvent.mutate(
        { data: payload },
        {
          onSuccess: (event) => {
            queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
            toast({ title: "Event created successfully" });
            setLocation(`/dashboard/events/${event.id}`);
          },
          onError: () => toast({ title: "Failed to create event", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = createEvent.isPending || applyTemplate.isPending;

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/events">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Events
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Create Event</h1>

        {locationsIsError && <QueryErrorInline error={locationsError} label="Failed to load locations." />}
        {templatesIsError && <QueryErrorInline error={templatesError} label="Failed to load templates." />}

        {/* Template picker */}
        {selectedTemplateId == null && allTemplates.length > 0 && (
          <div className="mb-6 bg-muted/30 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Start from a template</span>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allTemplates.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(t.id);
                    form.setValue("category", t.category);
                    if (t.defaultCapacity) form.setValue("capacity", t.defaultCapacity.toString());
                  }}
                  className="text-left px-3 py-2.5 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t.checklistCount ?? 0} checklist · {t.runOfShowCount ?? 0} run of show · {t.budgetCount ?? 0} budget
                  </div>
                </button>
              ))}
              {allTemplates.length > 4 && (
                <Link href="/dashboard/templates" className="sm:col-span-2">
                  <div className="text-xs text-primary hover:underline">View all {allTemplates.length} templates →</div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Active template banner */}
        {selectedTemplateId != null && (
          <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-primary">
                  Using template: {selectedTemplate?.name ?? "Loading..."}
                </div>
                {selectedTemplate && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" />{selectedTemplate.checklistItems.length} checklist items</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{selectedTemplate.runOfShowItems.length} run of show</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{selectedTemplate.budgetItems.length} budget items</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">All template items will be copied to this event.</div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground shrink-0"
              onClick={() => setSelectedTemplateId(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <Input placeholder="Or enter manual address..." list={addressListId} {...field} />
                      </FormControl>
                      <datalist id={addressListId}>
                        {savedAddresses.map((a) => (
                          <option key={formatSavedAddress(a)} value={formatSavedAddress(a)} />
                        ))}
                      </datalist>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
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
                        <Input type="number" placeholder="Leave empty for unlimited" {...field} />
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
              <Link href="/dashboard/events">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : selectedTemplateId != null ? "Create from Template" : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}

