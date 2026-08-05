/**
 * One hook for the two workspace preferences every screen needs to respect: which time
 * zone dates are read in, and which currency money is written in.
 *
 * Both were already stored and neither was read — sixteen call sites formatted dates
 * with `toLocaleDateString()` (the browser's zone) and every amount was hardcoded to
 * USD. A setting the product collects and then ignores is worse than no setting: the
 * user has been told the answer is theirs to choose.
 *
 * Screens ask for the shape they want (`date(iso, "dayMonth")`, `money(cents)`) rather
 * than for the raw preference, so the zone can't be forgotten at the call site — which
 * is exactly how it got forgotten the first time.
 */

import { useMemo } from "react";

import { useSettings } from "@/data/hooks";
import { DEFAULT_USER_SETTINGS } from "@/data/entities";
import { formatMoney, setDisplayCurrency, type Cents, type FormatMoneyOptions } from "@/data/money";
import {
  describeWhenInZone,
  formatInZone,
  daysBetweenInZone,
  timeZoneLabel,
  type DateStyle,
} from "@/lib/datetime";

export interface Preferences {
  /** The workspace's IANA zone — for the rare caller that needs to pass it onward. */
  timeZone: string;
  /** Short name for the zone, e.g. "PDT". Show it wherever times are the point. */
  timeZoneLabel: string;
  currency: string;
  /** A date in the workspace zone. Missing or unparseable renders as an em dash. */
  date: (iso: string | Date | null | undefined, style?: DateStyle) => string;
  /** "in 6 days", "tomorrow" — counted in civil days in the workspace zone. */
  when: (iso: string | Date | null | undefined) => string;
  /** Whole days from today to `iso`, in the workspace zone. */
  daysUntil: (iso: string | Date | null | undefined) => number | null;
  /** An amount in the workspace currency. */
  money: (cents: Cents | null | undefined, options?: FormatMoneyOptions) => string;
}

/** Guards the module default against a write on every render. */
let lastAppliedCurrency = "";

export function usePreferences(): Preferences {
  const { data } = useSettings();
  // Settings load once and are cached forever, but the first paint happens before they
  // arrive. Falling back to the defaults keeps dates rendering rather than flashing
  // placeholders — and the defaults are the same ones the server writes.
  const timeZone = data?.timeZone ?? DEFAULT_USER_SETTINGS.timeZone;
  const currency = data?.currency ?? DEFAULT_USER_SETTINGS.currency;

  // Set once, so the forty-odd bare `formatMoney(...)` calls in row components agree
  // with `money(...)` without every one of them having to ask for the preference.
  if (currency !== lastAppliedCurrency) {
    lastAppliedCurrency = currency;
    setDisplayCurrency(currency);
  }

  return useMemo(
    () => ({
      timeZone,
      timeZoneLabel: timeZoneLabel(timeZone),
      currency,
      date: (iso, style) => formatInZone(iso, timeZone, style),
      when: (iso) => describeWhenInZone(iso, timeZone),
      daysUntil: (iso) => daysBetweenInZone(iso, timeZone),
      money: (cents, options) => formatMoney(cents, { currency, ...options }),
    }),
    [timeZone, currency],
  );
}
