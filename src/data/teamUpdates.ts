import { TEAM_UPDATE_KINDS, type EventHistoryEntry, type TeamUpdate, type TeamUpdateKind } from "./entities.ts";

export function teamUpdateKind(value: unknown): TeamUpdateKind {
  return (TEAM_UPDATE_KINDS as readonly unknown[]).includes(value) ? value as TeamUpdateKind : "general";
}

/** One conversion shared by the real and demo adapters so their feeds cannot drift. */
export function teamUpdateFromHistory(entry: EventHistoryEntry): TeamUpdate {
  return {
    id: entry.id,
    eventId: entry.eventId,
    actorId: entry.actorId,
    kind: teamUpdateKind(entry.after?.kind),
    message: String(entry.after?.message ?? entry.summary),
    createdAt: entry.createdAt,
  };
}
