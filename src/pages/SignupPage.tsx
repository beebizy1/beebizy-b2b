import { SignUp } from "@clerk/react";
import { Link } from "wouter";
import { clerkAppearance } from "@/app/clerkAppearance";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { authReturnTo } from "@/lib/authRedirect";
import { isClerkConfigured } from "@/lib/clerk";

export default function SignupPage() {
  /*
   * Studio, not Checkout.
   *
   * Accounts are approved by the Beebizy team, so someone arriving here has already been
   * invited and has a workspace waiting. Sending them to `?start=solo` would open a trial
   * for access they were just granted. An explicit `returnTo` still wins.
   */
  const returnTo = authReturnTo(window.location.search, "/app");

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
          Beebizy Studio is approved by the Beebizy team. Create your account with the address your
          invitation was sent to, and we will open your workspace.
        </p>
      </div>
    </div>
  );
}
