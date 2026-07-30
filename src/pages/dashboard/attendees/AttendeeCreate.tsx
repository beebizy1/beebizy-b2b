import { AppLayout } from "@/components/layout/AppLayout";
import { useCreateAttendee, getListAttendeesQueryKey } from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().min(1, "Contact info is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function AttendeeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createAttendee = useCreateAttendee();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contact: "",
      notes: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    createAttendee.mutate(
      { data: { name: data.name, contact: data.contact, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey() });
          toast({ title: "Attendee created successfully" });
          setLocation("/dashboard/attendees");
        },
        onError: () => {
          toast({ title: "Failed to create attendee", variant: "destructive" });
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/attendees">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Attendees
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">Add Attendee</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4 bg-card p-6 rounded-xl border">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact</FormLabel>
                    <FormControl>
                      <Input placeholder="jane@example.com or +1 (555) 000-0000" {...field} />
                    </FormControl>
                    <FormDescription>Email, phone number, or both.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Dietary restrictions, VIP status, etc." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Link href="/dashboard/attendees">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createAttendee.isPending}>
                {createAttendee.isPending ? "Creating..." : "Create Attendee"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
