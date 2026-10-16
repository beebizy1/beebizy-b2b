import { describe, expect, it } from "vitest";
import type { RunOfShowItem } from "./entities";
import {
  parseDeletedRunOfShowCues,
  parseRunOfShowDraft,
  rememberDeletedRunOfShowCue,
  runOfShowDeletedCueStorageKey,
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
});
