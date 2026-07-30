import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { GoogleIcon } from "@/components/icons/GoogleIcon";

const formSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail(data.email, data.password);
      navigate("/dashboard");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to log in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleError(null);
    setIsGoogleLoading(true);
    try {
      const { isNewUser } = await signInWithGoogle();
      navigate(isNewUser ? "/complete-profile" : "/dashboard");
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : "Failed to sign in with Google.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <img src="/beebizy-logo.png" alt="Beebizy" className="h-9 w-auto" />
      </Link>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
        <p className="text-sm text-muted-foreground mb-6">Log in to your Beebizy account.</p>

        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 mb-4"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
        >
          <GoogleIcon />
          {isGoogleLoading ? "Connecting..." : "Continue with Google"}
        </Button>
        {googleError && <p className="text-sm text-destructive mb-4">{googleError}</p>}

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or log in with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log In"}
            </Button>
          </form>
        </Form>

        <p className="text-sm text-muted-foreground text-center mt-6">
          Don't have an account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
