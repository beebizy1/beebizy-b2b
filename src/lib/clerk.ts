/**
 * Clerk configuration.
 *
 * The publishable key comes from the Vercel Marketplace integration as
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (see `vite.config.ts` for why that prefix is
 * readable here). Without it the app stays in demo mode rather than crashing — the
 * landing page promises a working demo with no sign-up, and that has to remain true.
 */

export const clerkPublishableKey: string | undefined =
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** True once a real Clerk instance is wired up, which is what turns sign-in on. */
export const isClerkConfigured = Boolean(clerkPublishableKey);
