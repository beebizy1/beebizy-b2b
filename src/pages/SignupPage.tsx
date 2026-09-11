import { SignUp } from "@clerk/react";
import { Link } from "wouter";
import { clerkAppearance } from "@/app/clerkAppearance";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { authReturnTo } from "@/lib/authRedirect";
import { isClerkConfigured } from "@/lib/clerk";
import { SOLO_PRICE_OPTIONS, SOLO_TRIAL_DAYS } from "@/data/plans";

export default function SignupPage() {
  const returnTo = authReturnTo(window.location.search, "/pricing?start=solo");

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <Link href="/" aria-label="Beebizy pricing">
          <BrandLogo size="lg" />
        </Link>

        {isClerkConfigured ? (
          <SignUp
            appearance={clerkAppearance}
            signInUrl={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            forceRedirectUrl={returnTo}
            fallbackRedirectUrl={returnTo}
          />
        ) : (
          <div className="w-full space-y-4 rounded-xl border border-card-border bg-card p-6 text-center shadow-xs">
            <h1 className="headline text-foreground">Account creation isn't configured</h1>
            <p className="text-sm text-muted-foreground">This local demo does not have a Clerk account provider.</p>
            <Button asChild><Link href="/">Back to pricing</Link></Button>
          </div>
        )}

        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          After account creation, Stripe will securely collect your card. Your first {SOLO_PRICE_OPTIONS.month.display} monthly charge is in {SOLO_TRIAL_DAYS} days.
        </p>
      </div>
    </div>
  );
}
