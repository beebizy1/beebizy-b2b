import { describe, expect, it } from "vitest";
import type { EventHistoryEntry, RunOfShowItem } from "./entities";
import {
  parseDeletedRunOfShowCues,
  parseRunOfShowDraft,
  preferredRunOfShowDraft,
  rememberDeletedRunOfShowCue,
  recoverableDeletedRunOfShowCues,
  recoverableRunOfShowVersions,
  runOfShowDeletedCueStorageKey,
  runOfShowDraftDiscardStorageKey,
  runOfShowDraftFromCue,
  runOfShowDraftStorageKey,
  serializeRunOfShowDraft,
  type DeletedRunOfShowCue,
  type RunOfShowEditorDraft,
} from "./runOfShowRecovery";

const cue = (id: string, overrides: Partial<RunOfShowItem> = {}): RunOfShowItem => ({
  id,
  eventId: "event-1",
  dayNumber: 2,
  startTime: "18:30",
  duration: 45,
  title: "Dinner service",
  description: "Coordinate with catering",
  responsible: "Mary",
  assignedEmail: "mary@example.com",
  completed: false,
  sortOrder: 4,
  createdAt: "2026-10-16T01:00:00.000Z",
  ...overrides,
});

const draft: RunOfShowEditorDraft = {
  dayNumber: 2,
  startTime: "18:30",
  title: "Dinner service",
  duration: "45",
  assignee: "mary@example.com",
  description: "Coordinate with catering",
};

describe("run of show draft recovery", () => {
  it("round-trips only the draft for the requested event and cue", () => {
    const raw = serializeRunOfShowDraft("event-1", "new", draft, 1234);

    expect(parseRunOfShowDraft(raw, "event-1", "new")).toEqual({ savedAt: 1234, draft });
    expect(parseRunOfShowDraft(raw, "event-2", "new")).toBeNull();
    expect(parseRunOfShowDraft(raw, "event-1", "cue-1")).toBeNull();
    expect(parseRunOfShowDraft("not json", "event-1", "new")).toBeNull();
  });

  it("uses event-scoped keys so one event cannot replace another event's draft", () => {
    expect(runOfShowDraftStorageKey("event-1", "new")).not.toBe(runOfShowDraftStorageKey("event-2", "new"));
    expect(runOfShowDeletedCueStorageKey("event-1")).not.toBe(runOfShowDeletedCueStorageKey("event-2"));
    expect(runOfShowDraftDiscardStorageKey("event-1", "new")).not.toBe(runOfShowDraftDiscardStorageKey("event-2", "new"));
  });

  it("prefers the newest valid copy across device and server storage", () => {
    const server = { draftKey: "new-2", draft, clientUpdatedAt: 2000, updatedAt: "2026-10-16T12:00:00.000Z" };
    expect(preferredRunOfShowDraft({ savedAt: 1000, draft: { ...draft, title: "Older local" } }, server)).toEqual({
      source: "server",
      savedAt: 2000,
      draft,
    });
    expect(preferredRunOfShowDraft({ savedAt: 3000, draft: { ...draft, title: "Newer local" } }, server)).toEqual({
      source: "device",
      savedAt: 3000,
      draft: { ...draft, title: "Newer local" },
    });
    expect(preferredRunOfShowDraft(null, server, 2500)).toBeNull();
  });
});

describe("deleted run of show recovery", () => {
  it("keeps the newest ten unique cues for the same event", () => {
    let remembered: DeletedRunOfShowCue[] = [];
    for (let index = 0; index < 12; index += 1) {
      remembered = rememberDeletedRunOfShowCue(remembered, cue(`cue-${index}`), index);
    }
    remembered = rememberDeletedRunOfShowCue(remembered, cue("cue-11", { title: "Latest version" }), 99);

    expect(remembered).toHaveLength(10);
    expect(remembered[0]).toMatchObject({ deletedAt: 99, cue: { id: "cue-11", title: "Latest version" } });
    expect(remembered.filter((entry) => entry.cue.id === "cue-11")).toHaveLength(1);
    expect(parseDeletedRunOfShowCues(JSON.stringify(remembered), "event-1")).toEqual(remembered);
    expect(parseDeletedRunOfShowCues(JSON.stringify(remembered), "event-2")).toEqual([]);
  });

  it("recreates every editable cue field", () => {
    expect(runOfShowDraftFromCue(cue("cue-1"))).toEqual({
      dayNumber: 2,
      startTime: "18:30",
      duration: 45,
      title: "Dinner service",
      description: "Coordinate with catering",
      responsible: "Mary",
      assignedEmail: "mary@example.com",
      completed: false,
      sortOrder: 4,
    });
  });

  it("recovers deleted cues and previous versions from server history on any device", () => {
    const deleted = cue("cue-deleted");
    const previous = cue("cue-current", { title: "Earlier title" });
    const history: EventHistoryEntry[] = [
      { id: "history-delete", eventId: "event-1", actorId: "user-1", resource: "run-of-show", resourceId: deleted.id, action: "deleted", summary: "Deleted cue", before: deleted as unknown as Record<string, unknown>, after: null, createdAt: "2026-10-16T12:10:00.000Z" },
      { id: "history-update", eventId: "event-1", actorId: "user-1", resource: "run-of-show", resourceId: previous.id, action: "updated", summary: "Updated cue", before: previous as unknown as Record<string, unknown>, after: cue("cue-current", { title: "Current title" }) as unknown as Record<string, unknown>, createdAt: "2026-10-16T12:05:00.000Z" },
    ];
    const current = [cue("cue-current", { title: "Current title" })];

    expect(recoverableDeletedRunOfShowCues(history, current, "event-1")).toEqual([
      { historyId: "history-delete", deletedAt: Date.parse("2026-10-16T12:10:00.000Z"), cue: deleted },
    ]);
    expect(recoverableRunOfShowVersions(history, current, "event-1")).toEqual([
      { historyId: "history-update", recordedAt: Date.parse("2026-10-16T12:05:00.000Z"), cue: previous },
    ]);
  });
});
