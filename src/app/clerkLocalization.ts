/**
 * Copy overrides for Clerk's components.
 *
 * Clerk titles its cards with the *application name* from the instance, which here is the
 * Vercel resource name — so the sign-in card read "Sign in to beebizy-auth". Setting the
 * strings in code fixes it for every instance at once, rather than depending on someone
 * remembering to rename the application in the Clerk dashboard.
 *
 * The combined sign-in/sign-up card reads its own `titleCombined` key rather than
 * `title`, so turning that flow on silently put the instance name back in front of every
 * new visitor ("Continue to beebizy-auth"). Both keys are set, because which one Clerk
 * renders depends on a prop on the component rather than anything visible here.
 */

import type { LocalizationResource } from "@clerk/shared/types";

export const clerkLocalization: LocalizationResource = {
  signIn: {
    start: {
      title: "Sign in to Beebizy",
      titleCombined: "Sign in to Beebizy",
      subtitle: "Welcome back. Pick up where your events left off.",
      subtitleCombined: "Welcome back. Pick up where your events left off.",
    },
  },
  signUp: {
    start: {
      title: "Create your Beebizy account",
      titleCombined: "Create your Beebizy account",
      subtitle: "Set up your team's event operations in a couple of minutes.",
      subtitleCombined: "Set up your team's event operations in a couple of minutes.",
    },
  },
};
