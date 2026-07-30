import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { User as UserIcon } from "lucide-react";

const formSchema = z.object({
  contactName: z.string().min(1, "Contact name is required"),
  phone: z.string().min(1, "Phone number is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function CompleteProfilePage() {
  const [, navigate] = useLocation();
  const { user, loading, completeProfile } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { contactName: "", phone: "" },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await completeProfile(data);
      navigate("/dashboard");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save your profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-14 w-14 border border-border">
            <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? "Profile"} />
            <AvatarFallback><UserIcon className="w-6 h-6 text-muted-foreground" /></AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Almost there, {user.displayName?.split(" ")[0] ?? "there"}</h1>
            <p className="text-sm text-muted-foreground">Just a couple more details to finish setting up your account.</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Who should we reach out to?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Continue to Dashboard"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
