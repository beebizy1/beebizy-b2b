/**
 * RFP colors mirror the way an event team scans a hotel agenda.
 * Purpose text remains visible, so color reinforces meaning without carrying it alone.
 */
const SPACE_COLORS = {
  registration: "border-info/35 bg-info-tint/55",
  breakfast: "border-warning/35 bg-warning-tint/55",
  meeting: "border-primary/35 bg-primary-muted/55",
  lunch: "border-success/35 bg-success-tint/55",
  dinner: "border-primary/35 bg-primary-muted/55",
  reception: "border-info/35 bg-info-tint/55",
  other: "border-hairline bg-surface-sunken/55",
} as const;

export function rfpSpaceColor(purpose: string): string {
  const normalized = purpose.trim().toLowerCase();
  if (normalized.includes("registration") || normalized.includes("check-in")) return SPACE_COLORS.registration;
  if (normalized.includes("breakfast")) return SPACE_COLORS.breakfast;
  if (normalized.includes("meeting") || normalized.includes("summit") || normalized.includes("session")) return SPACE_COLORS.meeting;
  if (normalized.includes("lunch")) return SPACE_COLORS.lunch;
  if (normalized.includes("dinner") || normalized.includes("banquet")) return SPACE_COLORS.dinner;
  if (normalized.includes("reception") || normalized.includes("cocktail")) return SPACE_COLORS.reception;
  return SPACE_COLORS.other;
}
