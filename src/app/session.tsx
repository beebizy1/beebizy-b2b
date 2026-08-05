/**
 * Who is using the app, expressed in a way that survives having no backend.
 *
 * Three states matter:
 *   `authenticated` — real Firebase user.
 *   `demo`          — no credentials configured, so the app runs on seed data and is
 *                     openly labelled as such. The landing page promises a working
 *                     demo with no sign-up; this is what makes that true instead of a
 *                     redirect straight back to /login.
 *   `anonymous`     — Firebase is configured but nobody is signed in. Gated.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useDataMode } from "@/data/provider";

export type SessionStatus = "loading" | "authenticated" | "demo" | "anonymous";

export interface SessionUser {
  name: string;
  email: string | null;
  photoURL: string | null;
}

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, userProfile, loading, signOutUser } = useAuth();
  const { mode } = useDataMode();

  const value = useMemo<SessionValue>(() => {
    if (mode === "demo") {
      return { status: "demo", user: DEMO_USER, isDemo: true, signOut: async () => {} };
    }
    if (loading) {
      return { status: "loading", user: null, isDemo: false, signOut: signOutUser };
    }
    if (!user) {
      return { status: "anonymous", user: null, isDemo: false, signOut: signOutUser };
    }
    return {
      status: "authenticated",
      isDemo: false,
      signOut: signOutUser,
      user: {
        name: userProfile?.name || user.displayName || user.email || "Signed in",
        email: user.email,
        photoURL: userProfile?.photoURL || user.photoURL || null,
      },
    };
  }, [mode, loading, user, userProfile, signOutUser]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside a <SessionProvider>.");
  return ctx;
}

/**
 * Gate for app routes. Redirects during render rather than in an effect, so nobody
 * ever sees a frame of the dashboard before being bounced to sign-in.
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
