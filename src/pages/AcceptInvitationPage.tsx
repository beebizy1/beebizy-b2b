/**
 * Invite-only account creation.
 *
 * Public sign-up stays closed. Clerk adds `__clerk_ticket` only after someone opens a
 * valid application invitation, so this is the one route where the sign-up component is
 * mounted. The component consumes the ticket and carries its verified email into the new
 * account; the first API request then claims the matching workspace invite.
 */

import { Redirect, Link } from "wouter";
import { SignUp } from "@clerk/react";
import { BrandLogo } from "@/components/BrandLogo";
import { isClerkConfigured } from "@/lib/clerk";
import { clerkAppearance } from "@/app/clerkAppearance";
import { isInvitationAcceptance } from "@/lib/invitation";

export default function AcceptInvitationPage() {
  if (!isInvitationAcceptance(window.location.search)) {
    return <Redirect to="/access-denied" replace />;
  }

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
          <div className="w-full rounded-xl border border-card-border bg-card p-6 text-center shadow-xs">
            <h1 className="headline text-foreground">Invitation sign-up isn't configured</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This environment cannot create your account. Open the invitation from the Beebizy pilot link.
            </p>
          </div>
        )}

        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          This account creation page is available only through a Beebizy Studio invitation.
        </p>
      </div>
    </div>
  );
}
