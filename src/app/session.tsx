/**
 * Who is using the app.
 *
 * Auth is Clerk. The previous implementation was Firebase Auth, which never worked in
 * practice: with no `.env` it threw "Firebase isn't configured yet" the moment anyone
 * pressed *Sign up with Google*, and configuring it meant hand-managing a project's
 * credentials. Clerk is provisioned through the Vercel Marketplace, so the keys arrive
 * with the environment.
 *
 * Three states still matter, and the demo one is deliberate:
 *   `authenticated` — a real Clerk session.
 *   `demo`          — no Clerk instance configured, so the app runs on seed data and says
 *                     so. The landing page promises a working demo with no sign-up; this
 *                     is what keeps that true.
 *   `anonymous`     — Clerk is configured and nobody is signed in. Gated.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { isClerkConfigured } from "@/lib/clerk";
import { endDemoSession } from "./demo";

export type SessionStatus = "loading" | "authenticated" | "demo" | "anonymous";

export interface SessionUser {
  name: string;
  email: string | null;
  photoURL: string | null;
}

export type WorkspaceRole = "owner" | "admin" | "member";

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  isDemo: boolean;
  signOut: () => Promise<void>;
}

const DEMO_USER: SessionUser = {
  name: "Demo organiser",
  email: "demo@beebizy.app",
  photoURL: null,
};

const SessionContext = createContext<SessionValue | null>(null);

/** Reads a Clerk session. Only mounted when Clerk is configured. */
function ClerkSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const value = useMemo<SessionValue>(() => {
    const signOut = async () => {
      await clerk.signOut();
    };

    if (!isLoaded) return { status: "loading", user: null, isDemo: false, signOut };
    if (!isSignedIn || !user) return { status: "anonymous", user: null, isDemo: false, signOut };

    return {
      status: "authenticated",
      isDemo: false,
      signOut,
      user: {
        // Clerk users can sign up with a social account and have no name set, so fall
        // back through the identifiers that definitely exist.
        name: user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "Signed in",
        email: user.primaryEmailAddress?.emailAddress ?? null,
        photoURL: user.imageUrl || null,
      },
    };
  }, [isLoaded, isSignedIn, user, clerk]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** No Clerk instance: everyone is the demo organiser and nothing is gated. */
function DemoSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SessionValue>(
    () => ({
      status: "demo",
      user: DEMO_USER,
      isDemo: true,
      signOut: async () => {
        endDemoSession();
        window.location.assign("/login");
      },
    }),
    [],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children, forceDemo = false }: { children: ReactNode; forceDemo?: boolean }) {
  if (forceDemo) return <DemoSessionProvider>{children}</DemoSessionProvider>;

  // Chosen once at module scope, so the two providers never swap and take hook order
  // with them.
  return isClerkConfigured ? (
    <ClerkSessionProvider>{children}</ClerkSessionProvider>
  ) : (
    <DemoSessionProvider>{children}</DemoSessionProvider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside a <SessionProvider>.");
  return ctx;
}

/**
 * Gate for app routes. Redirects during render rather than in an effect, so nobody ever
 * sees a frame of the dashboard before being bounced to sign-in.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (status === "anonymous") return <Redirect to="/login" replace />;

  return <>{children}</>;
}
