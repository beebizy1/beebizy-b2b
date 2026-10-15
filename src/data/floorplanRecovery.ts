import type { Floorplan, FloorplanDraft } from "./entities";
import { parseFloorplanDraft } from "./floorplan";

export interface StoredFloorplanEditorDraft {
  editedAt: number;
  draft: FloorplanDraft;
}

export interface FloorplanRecoveryCandidate {
  editedAt: number;
  itemCount: number;
  draft: FloorplanDraft;
}

const FLOORPLAN_NAME_LIMIT = 120;

function recoveredNameForCopy(original: string, copyNumber: number): string {
  const suffix = copyNumber === 1 ? " - recovered copy" : ` - recovered copy ${copyNumber}`;
  const prefix = original.trim().slice(0, FLOORPLAN_NAME_LIMIT - suffix.length).trimEnd();
  return `${prefix}${suffix}`;
}

export function recoveredFloorplanName(original: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  let copyNumber = 1;
  while (true) {
    const candidate = recoveredNameForCopy(original, copyNumber);
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
    copyNumber += 1;
  }
}

function comparableDraft(draft: FloorplanDraft) {
  return {
    name: draft.name,
    items: draft.items,
    room: draft.room ?? null,
  };
}

export function isRecoveredFloorplanCopy(saved: Floorplan, draft: FloorplanDraft): boolean {
  const parsedDraft = parseFloorplanDraft(draft);
  const parsedSaved = parseFloorplanDraft({ name: saved.name, items: saved.items, room: saved.room });
  const nameMatch = saved.name.match(/ - recovered copy(?: ([2-9]\d*))?$/);
  if (!nameMatch) return false;
  const copyNumber = nameMatch[1] ? Number(nameMatch[1]) : 1;
  if (saved.name !== recoveredNameForCopy(draft.name, copyNumber)) return false;
  return JSON.stringify({ items: parsedDraft.items, room: parsedDraft.room ?? null }) === JSON.stringify({
    items: parsedSaved.items,
    room: parsedSaved.room ?? null,
  });
}

/** Decides whether a browser-only floorplan copy should be restored or offered safely. */
export function resolveFloorplanRecovery(
  saved: Floorplan,
  raw: string | null,
): FloorplanRecoveryCandidate | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredFloorplanEditorDraft>;
    if (typeof stored.editedAt !== "number" || !stored.draft) return null;
    const draft = parseFloorplanDraft(stored.draft);
    const serverDraft = parseFloorplanDraft({ name: saved.name, items: saved.items, room: saved.room });
    if (JSON.stringify(comparableDraft(draft)) === JSON.stringify(comparableDraft(serverDraft))) return null;
    return {
      editedAt: stored.editedAt,
      itemCount: draft.items.length,
      draft,
    };
  } catch {
    return null;
  }
}
