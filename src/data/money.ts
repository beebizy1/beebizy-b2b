/**
 * Money is stored and computed as integer cents, never as a float or a string.
 *
 * The legacy Firestore documents wrote money into string fields (`ticketTypes.price`,
 * `auctionItems.currentBid`, `sponsorships.amount`) while budget items used a plain
 * number. That made `"90" > "100"` true when comparing bids and made every total a
 * `parseFloat` away from a rounding error. Adapters convert at the boundary — see
 * `parseMoney` / `serializeMoney` — so nothing above the data layer ever sees a
 * money string again.
 */

/** An amount in the smallest currency unit (cents for USD). Always an integer. */
export type Cents = number;

const CENTS_PER_UNIT = 100;

/**
 * Parses a legacy money value (`"1500"`, `"1,500.50"`, `"$1500"`, `1500`, null) into cents.
 * Returns null for absent or unparseable input so callers can distinguish "no amount"
 * from "zero".
 */
export function parseMoney(value: string | number | null | undefined): Cents | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * CENTS_PER_UNIT) : null;
  }
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * CENTS_PER_UNIT) : null;
}

/** Like `parseMoney`, but absent input becomes 0 — for fields that participate in sums. */
export function parseMoneyOrZero(value: string | number | null | undefined): Cents {
  return parseMoney(value) ?? 0;
}

/** Converts cents back to the decimal string shape the legacy Firestore fields expect. */
export function serializeMoney(cents: Cents | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return (cents / CENTS_PER_UNIT).toFixed(2);
}

/** Cents from a user-typed form field (`"1,200.50"` → `120050`). Null when the field is blank. */
export function centsFromInput(input: string): Cents | null {
  return parseMoney(input);
}

/** Cents to the value an `<input>` should show (`120050` → `"1200.50"`). */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / CENTS_PER_UNIT).toFixed(2);
}

/**
 * The currency `formatMoney` uses when a caller doesn't name one.
 *
 * A module-level default rather than a threaded argument, because the alternative was
 * passing the workspace currency through forty-four call sites and every row component
 * between them — and a single missed one silently renders a GBP workspace's numbers with
 * a dollar sign, which is the exact bug this is fixing.
 *
 * Two things make it safe here, and both are worth stating because neither would survive
 * a change of context: this module is client-only (nothing on the server formats money),
 * so one browser means one workspace at a time; and this affects *display* only — every
 * amount is still an integer in cents, and no arithmetic reads it. If money formatting
 * ever moves server-side, this has to become an argument again: a process shared between
 * tenants cannot have an ambient currency.
 */
let displayCurrency = "USD";

/** Called once when the workspace's settings arrive. See `usePreferences`. */
export function setDisplayCurrency(currency: string): void {
  displayCurrency = currency || "USD";
}

export interface FormatMoneyOptions {
  /** Drop `.00` on whole amounts — `$1,500` instead of `$1,500.00`. Default true. */
  trimWholeCents?: boolean;
  /** Collapse thousands — `$1.5k`, `$2.4M`. Default false. */
  compact?: boolean;
  currency?: string;
  locale?: string;
}

/** Human-facing currency string. Never use this for anything but display. */
export function formatMoney(cents: Cents | null | undefined, options: FormatMoneyOptions = {}): string {
  const { trimWholeCents = true, compact = false, currency = displayCurrency, locale = "en-US" } = options;
  if (cents === null || cents === undefined) return "—";

  const units = cents / CENTS_PER_UNIT;
  if (compact) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(units);
  }

  const showCents = !(trimWholeCents && cents % CENTS_PER_UNIT === 0);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(units);
}

/** Sums cents without float drift. */
export function sumCents(amounts: Iterable<Cents | null | undefined>): Cents {
  let total = 0;
  for (const amount of amounts) total += amount ?? 0;
  return total;
}

/** `part / whole` as a 0–100 integer. Returns null when there's no meaningful denominator. */
export function percentOf(part: Cents, whole: Cents): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}
