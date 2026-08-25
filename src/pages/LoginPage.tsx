/**
 * Sign in.
 *
 * Clerk's own component rather than a hand-built form: it brings Google and the rest of
 * the social providers, email codes, password reset and MFA, all of which the previous
 * hand-rolled Firebase form either lacked or half-implemented. Appearance is mapped onto
 * the brand tokens so it doesn't look bolted on.
 */

import { Link } from "wouter";
import { SignIn } from "@clerk/react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { isClerkConfigured } from "@/lib/clerk";
import { clerkAppearance } from "@/app/clerkAppearance";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <Link href="/login" aria-label="Beebizy sign in">
          <BrandLogo size="lg" />
        </Link>

        {isClerkConfigured ? (
          <SignIn
            appearance={clerkAppearance}
            withSignUp={false}
            transferable={false}
            forceRedirectUrl="/app"
            fallbackRedirectUrl="/app"
          />
        ) : (
          <div className="w-full space-y-4 rounded-xl border border-card-border bg-card p-6 text-center shadow-xs">
            <h1 className="headline text-foreground">Sign-in isn't configured</h1>
            <p className="text-sm text-muted-foreground">
              This deployment has no Clerk instance, so there is nothing to sign in to. The demo runs
              without an account and every screen works — nothing is saved.
            </p>
            <Button asChild>
              <Link href="/app">Open the demo</Link>
            </Button>
          </div>
        )}

        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          Beebizy Studio is a private workspace for approved internal operators. Need access for your team?{" "}
          <Link href="/?sales=1" className="font-semibold text-foreground underline underline-offset-4">
            Talk to sales
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
