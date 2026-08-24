/**
 * Create an account. Clerk's component, same reasoning as the sign-in page.
 */

import { Link } from "wouter";
import { SignUp } from "@clerk/react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { isClerkConfigured } from "@/lib/clerk";
import { clerkAppearance } from "@/app/clerkAppearance";

export default function SignupPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <Link href="/login" aria-label="Beebizy sign in">
          <BrandLogo size="lg" />
        </Link>

        {isClerkConfigured ? (
          <SignUp
            appearance={clerkAppearance}
            signInUrl="/login"
            forceRedirectUrl="/app"
            fallbackRedirectUrl="/app"
          />
        ) : (
          <div className="w-full space-y-4 rounded-xl border border-card-border bg-card p-6 text-center shadow-xs">
            <h1 className="headline text-foreground">Sign-up isn't configured</h1>
            <p className="text-sm text-muted-foreground">
              This deployment has no Clerk instance. The demo needs no account — open it and
              everything works, though nothing is saved.
            </p>
            <Button asChild>
              <Link href="/app">Open the demo</Link>
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          <Link href="/app" className="underline hover:text-foreground">
            Or skip sign-up and open the demo
          </Link>
        </p>
      </div>
    </div>
  );
}
