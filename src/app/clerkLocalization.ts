/**
 * Copy overrides for Clerk's components.
 *
 * Clerk titles its cards with the *application name* from the instance, which here is the
 * Vercel resource name — so the sign-in card read "Sign in to beebizy-auth". Setting the
 * strings in code fixes it for every instance at once, rather than depending on someone
 * remembering to rename the application in the Clerk dashboard.
 */

import type { LocalizationResource } from "@clerk/shared/types";

export const clerkLocalization: LocalizationResource = {
  signIn: {
    start: {
      title: "Sign in to Beebizy",
      subtitle: "Welcome back. Pick up where your events left off.",
    },
  },
  signUp: {
    start: {
      title: "Create your Beebizy account",
      subtitle: "Set up your team's event operations in a couple of minutes.",
    },
  },
};
