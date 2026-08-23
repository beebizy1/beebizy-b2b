/**
 * Chooses the backend once, at the root, and hands it to the tree.
 *
 * Screens never import an adapter directly — they call `useData()`. That is what made
 * swapping an in-memory store for Postgres over HTTP a change to this file and nothing
 * else, and it is why every screen is testable by mounting it with a stub adapter.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { isClerkConfigured } from "@/lib/clerk";
import type { DataAdapter } from "./adapter";
import { memoryAdapter } from "./memory/adapter";
import { createHttpAdapter } from "./http/adapter";
import { isDemoSession } from "@/app/demo";

/**
 * `demo` — in-memory seed, no credentials, writes vanish on reload.
 * `live` — the API, a real workspace, real persistence.
 */
export type DataMode = "demo" | "live";

interface DataContextValue {
  adapter: DataAdapter;
  mode: DataMode;
  /** Why the app is in demo mode, for the banner. Null when live. */
  demoReason: string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Live backend: the API, authorized by the caller's Clerk session. */
function LiveDataProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  const value = useMemo<DataContextValue>(
    () => ({
      // No Clerk Organizations dependency: that feature is off by default, and reading it
      // unconditionally blocked sign-up entirely. Workspaces and roles live in our own
      // `workspace_members` table, so the server resolves a personal workspace when no org
      // header arrives and nothing here has to know the difference.
      adapter: createHttpAdapter({ getToken: () => getToken() }),
      mode: "live",
      demoReason: null,
    }),
    [getToken],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** No sign-in configured: the seeded store, clearly labelled. */
function DemoDataProvider({ children, adapter }: { children: ReactNode; adapter?: DataAdapter }) {
  const value = useMemo<DataContextValue>(
    () => ({
      adapter: adapter ?? memoryAdapter,
      mode: "demo",
      demoReason:
        "No sign-in is configured, so the app is running on demo data. Everything works; nothing is saved.",
    }),
    [adapter],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function DataProvider({ children, adapter }: { children: ReactNode; adapter?: DataAdapter }) {
  // An injected adapter always wins, which is what lets a test mount a screen against a stub.
  if (adapter) return <DemoDataProvider adapter={adapter}>{children}</DemoDataProvider>;
  if (isDemoSession()) return <DemoDataProvider>{children}</DemoDataProvider>;
  return isClerkConfigured ? (
    <LiveDataProvider>{children}</LiveDataProvider>
  ) : (
    <DemoDataProvider>{children}</DemoDataProvider>
  );
}

function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside a <DataProvider>.");
  return ctx;
}

export function useData(): DataAdapter {
  return useDataContext().adapter;
}

export function useDataMode(): { mode: DataMode; demoReason: string | null } {
  const { mode, demoReason } = useDataContext();
  return { mode, demoReason };
}
