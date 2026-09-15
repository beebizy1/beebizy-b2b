/** Guest categories Santa Clara asked to see even before the first registration arrives. */
export const SANTA_CLARA_REGISTRATION_SEGMENTS = ["Investor", "Company", "General", "Student"] as const;

export function registrationSegmentSummary(
  rows: Array<{ segment: string | null | undefined }>,
): Array<[string, number]> {
  const counts = new Map<string, number>(SANTA_CLARA_REGISTRATION_SEGMENTS.map((segment) => [segment, 0]));
  for (const row of rows) {
    const segment = row.segment?.trim();
    if (segment) counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  const requested = SANTA_CLARA_REGISTRATION_SEGMENTS.map(
    (segment) => [segment, counts.get(segment) ?? 0] as [string, number],
  );
  const custom = [...counts.entries()]
    .filter(([segment]) => !(SANTA_CLARA_REGISTRATION_SEGMENTS as readonly string[]).includes(segment))
    .sort(([a], [b]) => a.localeCompare(b));
  return [...requested, ...custom];
}

export interface VolunteerCoverageNeed {
  id: string;
  role: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
}

export interface VolunteerCoverageShift {
  needId?: string | null;
  status: import("./entities").VolunteerStatus;
}

export function volunteerCoverage<T extends VolunteerCoverageNeed>(
  needs: T[],
  shifts: VolunteerCoverageShift[],
): Array<T & { filledCount: number; openCount: number; isFull: boolean }> {
  return needs.map((need) => {
    const filledCount = shifts.filter(
      (shift) => shift.status !== "cancelled" && shift.needId === need.id,
    ).length;
    const openCount = Math.max(0, need.requiredCount - filledCount);
    return { ...need, filledCount, openCount, isFull: openCount === 0 };
  });
}
