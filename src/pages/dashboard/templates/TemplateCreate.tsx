import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useCreateTemplate,
  useAddTemplateChecklistItem,
  getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const CATEGORIES = [
  "Conference",
  "Meetup",
  "Monthly Meetup",
  "Workshop",
  "Webinar",
  "Social",
  "Sales Kickoff",
  "Team Offsite",
  "Employee Engagement",
  "In-Store Activation",
  "Influencer Event",
  "General",
];

type SeedItem = { title: string; category: string };

const SEED_CHECKLIST: Record<string, SeedItem[]> = {
  "Monthly Meetup": [
    { title: "Confirm venue booking", category: "Venue" },
    { title: "Confirm location details and access", category: "Venue" },
    { title: "Confirm guest count", category: "Logistics" },
    { title: "Order catering / refreshments", category: "Catering" },
    { title: "Set up AV equipment", category: "AV/Tech" },
    { title: "Confirm vendors", category: "Logistics" },
    { title: "Set and review budget", category: "General" },
    { title: "Send calendar invites", category: "Communications" },
    { title: "Send recap / follow-up", category: "Post-Event" },
  ],
  "Sales Kickoff": [
    { title: "Book venue", category: "Venue" },
    { title: "Confirm location details and access", category: "Venue" },
    { title: "Set and approve budget", category: "General" },
    { title: "Lock in vendors (catering, AV, decor)", category: "Logistics" },
    { title: "Confirm speakers and agenda", category: "Logistics" },
    { title: "Prepare presentation materials", category: "AV/Tech" },
    { title: "Set up AV and tech", category: "AV/Tech" },
    { title: "Arrange travel and accommodation", category: "Transportation" },
    { title: "Send invitations", category: "Communications" },
    { title: "Day-of registration setup", category: "Logistics" },
    { title: "Send post-event follow-up", category: "Post-Event" },
  ],
  "Team Offsite": [
    { title: "Book venue / retreat space", category: "Venue" },
    { title: "Confirm location and directions", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Arrange accommodation", category: "Logistics" },
    { title: "Coordinate transportation", category: "Transportation" },
    { title: "Plan activities schedule", category: "Logistics" },
    { title: "Arrange meals and catering", category: "Catering" },
    { title: "Confirm vendors", category: "Logistics" },
    { title: "Send itinerary to team", category: "Communications" },
    { title: "Send recap and outcomes", category: "Post-Event" },
  ],
  "Employee Engagement": [
    { title: "Reserve venue", category: "Venue" },
    { title: "Confirm location details", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Confirm vendors", category: "Logistics" },
    { title: "Arrange catering", category: "Catering" },
    { title: "Plan activities and entertainment", category: "Logistics" },
    { title: "Order branded materials", category: "Marketing" },
    { title: "Send invitations", category: "Communications" },
    { title: "Collect post-event feedback", category: "Post-Event" },
  ],
  "In-Store Activation": [
    { title: "Confirm store / location", category: "Venue" },
    { title: "Brief store manager and staff", category: "Logistics" },
    { title: "Set budget", category: "General" },
    { title: "Arrange brand materials and displays", category: "Marketing" },
    { title: "Set up product demo areas", category: "Logistics" },
    { title: "Confirm staffing", category: "Staffing" },
    { title: "Arrange photographer / videographer", category: "Marketing" },
    { title: "Promote on social channels", category: "Marketing" },
    { title: "Collect performance metrics", category: "Post-Event" },
  ],
  "Influencer Event": [
    { title: "Confirm venue", category: "Venue" },
    { title: "Confirm location and access", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Finalize influencer guest list", category: "Logistics" },
    { title: "Send invitations", category: "Communications" },
    { title: "Arrange gifting and product packages", category: "Logistics" },
    { title: "Set up media / photo area", category: "AV/Tech" },
    { title: "Hire photographer / videographer", category: "Marketing" },
    { title: "Arrange catering", category: "Catering" },
    { title: "Prepare brand assets and signage", category: "Marketing" },
    { title: "Track posts and engagement", category: "Post-Event" },
  ],
  Conference: [
    { title: "Book venue", category: "Venue" },
    { title: "Confirm location details", category: "Venue" },
    { title: "Set and approve budget", category: "General" },
    { title: "Confirm vendors", category: "Logistics" },
    { title: "Confirm speakers", category: "Logistics" },
    { title: "Set up AV and tech", category: "AV/Tech" },
    { title: "Arrange catering", category: "Catering" },
    { title: "Send attendee invitations", category: "Communications" },
    { title: "Set up registration", category: "Logistics" },
    { title: "Post-event survey", category: "Post-Event" },
  ],
  Workshop: [
    { title: "Book venue / meeting room", category: "Venue" },
    { title: "Confirm location", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Confirm facilitator", category: "Logistics" },
    { title: "Prepare materials and handouts", category: "Logistics" },
    { title: "Set up AV", category: "AV/Tech" },
    { title: "Arrange refreshments", category: "Catering" },
    { title: "Send invitations", category: "Communications" },
  ],
  Meetup: [
    { title: "Confirm venue", category: "Venue" },
    { title: "Confirm location details", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Confirm vendors", category: "Logistics" },
    { title: "Order refreshments", category: "Catering" },
    { title: "Send invitations", category: "Communications" },
    { title: "Post recap", category: "Post-Event" },
  ],
  Social: [
    { title: "Book venue", category: "Venue" },
    { title: "Confirm location", category: "Venue" },
    { title: "Set budget", category: "General" },
    { title: "Arrange catering / bar", category: "Catering" },
    { title: "Confirm entertainment", category: "Logistics" },
    { title: "Send invitations", category: "Communications" },
  ],
  Webinar: [
    { title: "Set up webinar platform", category: "AV/Tech" },
    { title: "Set budget", category: "General" },
    { title: "Confirm speakers", category: "Logistics" },
    { title: "Prepare presentation", category: "AV/Tech" },
    { title: "Send invitations and registration link", category: "Communications" },
    { title: "Test AV and tech setup", category: "AV/Tech" },
    { title: "Send recording post-event", category: "Post-Event" },
  ],
};

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  defaultCapacity: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function TemplateCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTemplate = useCreateTemplate();
  const addChecklist = useAddTemplateChecklistItem();
  const [submitting, setSubmitting] = useState(false);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", category: "Monthly Meetup", defaultCapacity: "" },
  });

  const watchedCategory = form.watch("category");
  const seedItems = SEED_CHECKLIST[watchedCategory] ?? [];

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const t = await createTemplate.mutateAsync({
        data: {
          name: data.name,
          description: data.description || undefined,
          category: data.category,
          defaultCapacity: data.defaultCapacity ? parseInt(data.defaultCapacity, 10) : undefined,
        },
      });

      const seeds = SEED_CHECKLIST[data.category] ?? [];
      if (seeds.length > 0) {
        setSeedProgress({ done: 0, total: seeds.length });
        for (let i = 0; i < seeds.length; i++) {
          await addChecklist.mutateAsync({
            id: t.id,
            data: { title: seeds[i].title, category: seeds[i].category, sortOrder: i },
          });
          setSeedProgress({ done: i + 1, total: seeds.length });
        }
      }

      await queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      toast({
        title: seeds.length > 0
          ? `Template created with ${seeds.length} checklist items`
          : "Template created — add items below",
      });
      setLocation(`/dashboard/templates/${t.id}`);
    } catch {
      toast({ title: "Failed to create template", variant: "destructive" });
      setSubmitting(false);
      setSeedProgress(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/templates">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Templates
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">New Template</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Pick a category and we'll pre-fill a checklist — add your run of show and budget on the next step.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4 bg-card p-6 rounded-xl border">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Monthly All-Hands Template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultCapacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Capacity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Optional" {...field} />
                      </FormControl>
                      <FormDescription>Pre-fills capacity when applying the template.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What kind of events is this template for?" className="h-24" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Seed preview */}
            {seedItems.length > 0 && (
              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pre-filled checklist ({seedItems.length} items)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {seedItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-foreground/80">{item.title}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  You can add, edit, or remove these after creating the template.
                </p>
              </div>
            )}

            {seedProgress && (
              <div className="text-sm text-muted-foreground">
                Adding checklist items… {seedProgress.done} / {seedProgress.total}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Link href="/dashboard/templates">
                <Button variant="outline" type="button" disabled={submitting}>Cancel</Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? seedProgress
                    ? `Adding items… ${seedProgress.done}/${seedProgress.total}`
                    : "Creating…"
                  : seedItems.length > 0
                    ? `Create & pre-fill ${seedItems.length} items`
                    : "Create & Add Items"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
