/**
 * Mounts `ClerkProvider` only when there is a Clerk instance to talk to.
 *
 * `ClerkProvider` throws without a publishable key, which would take the whole app down —
 * including the marketing page and the credential-free demo. Deployments without Clerk
 * simply render the tree unwrapped and fall through to the demo session.
 */

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { clerkPublishableKey, isClerkConfigured } from "@/lib/clerk";
import { clerkAppearance } from "./clerkAppearance";

export function ClerkGate({ children }: { children: ReactNode }) {
  if (!isClerkConfigured) return <>{children}</>;

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      appearance={clerkAppearance}
      // Wouter owns the URL; these keep Clerk's own redirects inside the app.
      signInUrl="/login"
      signUpUrl="/signup"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
