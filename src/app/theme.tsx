/**
 * Theme, persisted per user rather than per browser.
 *
 * The preference lives in the user's settings record, so it follows them between
 * laptop and phone. `system` tracks the OS and updates live when the OS flips.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings, useUpdateSettings } from "@/data/hooks";
import { DEFAULT_USER_SETTINGS, type ThemePreference } from "@/data/entities";

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
  /** Cycles light → dark → system, for the single-button toggle. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  /** Applied immediately on click so the toggle never waits on a round trip. */
  const [optimistic, setOptimistic] = useState<ThemePreference | null>(null);

  useEffect(() => {
    const media = window.matchMedia(MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const preference = optimistic ?? settings?.theme ?? DEFAULT_USER_SETTINGS.theme;
  const resolved: "light" | "dark" = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setOptimistic(next);
      updateSettings.mutate({ theme: next }, { onSettled: () => setOptimistic(null) });
    },
    [updateSettings],
  );

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ["light", "dark", "system"];
    const nextIndex = (order.indexOf(preference) + 1) % order.length;
    setPreference(order[nextIndex]!);
  }, [preference, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, cycle }),
    [preference, resolved, setPreference, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside a <ThemeProvider>.");
  return ctx;
}
