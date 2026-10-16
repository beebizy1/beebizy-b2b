import type { EventHistoryEntry, RunOfShowItem, RunOfShowItemDraft } from "./entities";

const STORAGE_VERSION = 1;
const DELETED_CUE_LIMIT = 10;

export interface RunOfShowEditorDraft {
  dayNumber: number;
  startTime: string;
  title: string;
  duration: string;
  assignee: string;
  description: string;
}

export interface DeletedRunOfShowCue {
  deletedAt: number;
  cue: RunOfShowItem;
}

export interface ServerDeletedRunOfShowCue extends DeletedRunOfShowCue {
  historyId: string;
}

export interface RunOfShowHistoricalVersion {
  historyId: string;
  recordedAt: number;
  cue: RunOfShowItem;
}

export interface RunOfShowSyncedDraft {
  draftKey: string;
  draft: RunOfShowEditorDraft;
  clientUpdatedAt: number;
  updatedAt: string;
}

function validEditorDraft(value: unknown): value is RunOfShowEditorDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RunOfShowEditorDraft>;
  return Number.isInteger(draft.dayNumber)
    && Number(draft.dayNumber) >= 1
    && typeof draft.startTime === "string"
    && typeof draft.title === "string"
    && typeof draft.duration === "string"
    && typeof draft.assignee === "string"
    && typeof draft.description === "string";
}

export function normalizeRunOfShowEditorDraft(value: unknown): RunOfShowEditorDraft | null {
  if (!validEditorDraft(value)) return null;
  if (value.dayNumber > 365
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)
    || value.title.length > 500
    || value.duration.length > 10
    || value.assignee.length > 320
    || value.description.length > 5_000) return null;
  return { ...value };
}

export function preferredRunOfShowDraft(
  device: { savedAt: number; draft: RunOfShowEditorDraft } | null,
  server: RunOfShowSyncedDraft | null,
  discardedAt = 0,
): { source: "device" | "server"; savedAt: number; draft: RunOfShowEditorDraft } | null {
  const activeDevice = device && device.savedAt > discardedAt ? device : null;
  const activeServer = server && server.clientUpdatedAt > discardedAt ? server : null;
  if (!activeDevice && !activeServer) return null;
  if (!activeServer || (activeDevice && activeDevice.savedAt > activeServer.clientUpdatedAt)) {
    return { source: "device", savedAt: activeDevice!.savedAt, draft: activeDevice!.draft };
  }
  return { source: "server", savedAt: activeServer.clientUpdatedAt, draft: activeServer.draft };
}

function validCue(value: unknown, eventId: string): value is RunOfShowItem {
  if (!value || typeof value !== "object") return false;
  const cue = value as Partial<RunOfShowItem>;
  return cue.eventId === eventId
    && typeof cue.id === "string"
    && Number.isInteger(cue.dayNumber)
    && typeof cue.startTime === "string"
    && typeof cue.title === "string"
    && (cue.duration === null || typeof cue.duration === "number")
    && (cue.description === null || typeof cue.description === "string")
    && (cue.responsible === null || typeof cue.responsible === "string")
    && (cue.assignedEmail === null || typeof cue.assignedEmail === "string")
    && typeof cue.completed === "boolean"
    && typeof cue.sortOrder === "number"
    && typeof cue.createdAt === "string";
}

export function runOfShowDraftStorageKey(eventId: string, cueId: string): string {
  return `beebizy:run-of-show:draft:${encodeURIComponent(eventId)}:${encodeURIComponent(cueId)}`;
}

export function runOfShowDraftDiscardStorageKey(eventId: string, cueId: string): string {
  return `beebizy:run-of-show:discarded:${encodeURIComponent(eventId)}:${encodeURIComponent(cueId)}`;
}

export function runOfShowDeletedCueStorageKey(eventId: string): string {
  return `beebizy:run-of-show:deleted:${encodeURIComponent(eventId)}`;
}

export function serializeRunOfShowDraft(
  eventId: string,
  cueId: string,
  draft: RunOfShowEditorDraft,
  savedAt = Date.now(),
): string {
  return JSON.stringify({ version: STORAGE_VERSION, eventId, cueId, savedAt, draft });
}

export function parseRunOfShowDraft(
  raw: string | null,
  eventId: string,
  cueId: string,
): { savedAt: number; draft: RunOfShowEditorDraft } | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as {
      version?: unknown;
      eventId?: unknown;
      cueId?: unknown;
      savedAt?: unknown;
      draft?: unknown;
    };
    const draft = normalizeRunOfShowEditorDraft(stored.draft);
    if (stored.version !== STORAGE_VERSION
      || stored.eventId !== eventId
      || stored.cueId !== cueId
      || typeof stored.savedAt !== "number"
      || !draft) return null;
    return { savedAt: stored.savedAt, draft };
  } catch {
    return null;
  }
}

export function parseDeletedRunOfShowCues(raw: string | null, eventId: string): DeletedRunOfShowCue[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry): DeletedRunOfShowCue[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<DeletedRunOfShowCue>;
      return typeof candidate.deletedAt === "number" && validCue(candidate.cue, eventId)
        ? [{ deletedAt: candidate.deletedAt, cue: candidate.cue }]
        : [];
    }).slice(0, DELETED_CUE_LIMIT);
  } catch {
    return [];
  }
}

export function rememberDeletedRunOfShowCue(
  current: DeletedRunOfShowCue[],
  cue: RunOfShowItem,
  deletedAt = Date.now(),
): DeletedRunOfShowCue[] {
  return [{ deletedAt, cue }, ...current.filter((entry) => entry.cue.id !== cue.id)].slice(0, DELETED_CUE_LIMIT);
}

function cueFingerprint(cue: RunOfShowItem): string {
  return JSON.stringify({
    dayNumber: cue.dayNumber,
    startTime: cue.startTime,
    duration: cue.duration,
    title: cue.title,
    description: cue.description,
    responsible: cue.responsible,
    assignedEmail: cue.assignedEmail,
    completed: cue.completed,
  });
}

export function recoverableDeletedRunOfShowCues(
  history: EventHistoryEntry[],
  current: RunOfShowItem[],
  eventId: string,
): ServerDeletedRunOfShowCue[] {
  const currentFingerprints = new Set(current.map(cueFingerprint));
  const seen = new Set<string>();
  return history.flatMap((entry): ServerDeletedRunOfShowCue[] => {
    if (entry.eventId !== eventId
      || entry.resource !== "run-of-show"
      || entry.action !== "deleted"
      || !entry.resourceId
      || seen.has(entry.resourceId)
      || !validCue(entry.before, eventId)) return [];
    seen.add(entry.resourceId);
    if (currentFingerprints.has(cueFingerprint(entry.before))) return [];
    return [{ historyId: entry.id, deletedAt: Date.parse(entry.createdAt), cue: entry.before }];
  }).slice(0, 20);
}

export function recoverableRunOfShowVersions(
  history: EventHistoryEntry[],
  current: RunOfShowItem[],
  eventId: string,
): RunOfShowHistoricalVersion[] {
  const currentIds = new Set(current.map((cue) => cue.id));
  return history.flatMap((entry): RunOfShowHistoricalVersion[] => {
    if (entry.eventId !== eventId
      || entry.resource !== "run-of-show"
      || entry.action !== "updated"
      || !entry.resourceId
      || !currentIds.has(entry.resourceId)
      || !validCue(entry.before, eventId)) return [];
    return [{ historyId: entry.id, recordedAt: Date.parse(entry.createdAt), cue: entry.before }];
  }).slice(0, 20);
}

export function runOfShowDraftFromCue(cue: RunOfShowItem): RunOfShowItemDraft {
  return {
    dayNumber: cue.dayNumber,
    startTime: cue.startTime,
    duration: cue.duration,
    title: cue.title,
    description: cue.description,
    responsible: cue.responsible,
    assignedEmail: cue.assignedEmail,
    completed: cue.completed,
    sortOrder: cue.sortOrder,
  };
}
