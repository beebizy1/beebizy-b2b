/**
 * Chooses the backend once, at the root, and hands it to the tree.
 *
 * Screens never import an adapter directly — they call `useData()`. That is what makes
 * "run the whole product with no credentials" and "run it against Firestore" the same
 * code path, and it is why every screen is testable by mounting it with a stub adapter.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isClerkConfigured } from "@/lib/clerk";
import type { DataAdapter } from "./adapter";
import { memoryAdapter } from "./memory/adapter";

/**
 * `demo` — in-memory seed, no credentials, writes vanish on reload.
 * `live` — real Firestore, real auth, real persistence.
 */
export type DataMode = "demo" | "live";

interface DataContextValue {
  adapter: DataAdapter;
  mode: DataMode;
  /** Why the app is in demo mode, for the banner. Null when live. */
  demoReason: string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * Resolves the backend from the environment.
 *
 * The Firestore adapter is not wired in yet, so a configured project still lands in
 * demo mode and the banner says so — the app never silently pretends that writes are
 * being persisted.
 */
function resolveBackend(override?: DataAdapter): DataContextValue {
  if (override) {
    return {
      adapter: override,
      mode: override.kind === "firestore" ? "live" : "demo",
      demoReason: override.kind === "firestore" ? null : "Running against an injected in-memory backend.",
    };
  }
  return {
    adapter: memoryAdapter,
    mode: "demo",
    // Auth and persistence are separate questions now that Clerk owns sign-in: you can be
    // genuinely signed in and still be reading seed data, so the banner has to say which
    // half is missing rather than blaming "credentials".
    demoReason: isFirebaseConfigured
      ? "Firestore credentials are present but the Firestore adapter is not connected yet, so this is demo data. Sign-in is real."
      : isClerkConfigured
        ? "Sign-in is live, but no database is connected yet — this is demo data. Everything works; nothing is saved."
        : "No database or sign-in is configured, so the app is running on demo data. Everything works; nothing is saved.",
  };
}

export function DataProvider({ children, adapter }: { children: ReactNode; adapter?: DataAdapter }) {
  const value = useMemo(() => resolveBackend(adapter), [adapter]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
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
