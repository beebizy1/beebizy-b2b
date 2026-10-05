export interface AlphabeticalCheckInLane {
  counter: number;
  range: string;
  start: string;
  end: string;
  stationName: string;
  label: string;
}

export const ALPHABETICAL_CHECK_IN_LANES: readonly AlphabeticalCheckInLane[] = [
  { counter: 1, range: "A-D", start: "A", end: "D", stationName: "Counter 1", label: "Last names A-D" },
  { counter: 2, range: "E-H", start: "E", end: "H", stationName: "Counter 2", label: "Last names E-H" },
  { counter: 3, range: "I-L", start: "I", end: "L", stationName: "Counter 3", label: "Last names I-L" },
  { counter: 4, range: "M-P", start: "M", end: "P", stationName: "Counter 4", label: "Last names M-P" },
  { counter: 5, range: "Q-T", start: "Q", end: "T", stationName: "Counter 5", label: "Last names Q-T" },
  { counter: 6, range: "U-Z", start: "U", end: "Z", stationName: "Counter 6", label: "Last names U-Z" },
];

function asciiInitial(value: string): string | null {
  const normalized = value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  const match = normalized.match(/[A-Z]/);
  return match?.[0] ?? null;
}

export function guestLastInitial(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const suffix = /^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;
  while (parts.length > 1 && suffix.test(parts.at(-1) ?? "")) parts.pop();
  const withoutSuffix = parts.join(" ");
  const lastName = withoutSuffix.includes(",")
    ? withoutSuffix.split(",", 1)[0]
    : parts.at(-1) ?? "";
  return asciiInitial(lastName);
}

export function parseAlphabeticalLane(lane: string): Pick<AlphabeticalCheckInLane, "start" | "end"> | null {
  const match = lane.toUpperCase().match(/(?:LAST\s+NAMES?\s+)?([A-Z])\s*[-–—]\s*([A-Z])/);
  if (!match || match[1] > match[2]) return null;
  return { start: match[1], end: match[2] };
}

export function guestMatchesLane(name: string, lane: string): boolean {
  const initial = guestLastInitial(name);
  const range = parseAlphabeticalLane(lane);
  return Boolean(initial && range && initial >= range.start && initial <= range.end);
}

/** Returns the one event-day counter responsible for this guest's last name. */
export function checkInLaneForGuest(name: string): AlphabeticalCheckInLane | null {
  return ALPHABETICAL_CHECK_IN_LANES.find((lane) => guestMatchesLane(name, lane.label)) ?? null;
}

export function lastNameSearchValue(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) return trimmed;
  const parts = trimmed.split(/\s+/);
  const last = parts.pop() ?? "";
  return `${last}, ${parts.join(" ")}`.trim();
}
