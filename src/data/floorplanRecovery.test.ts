import { describe, expect, it } from "vitest";
import type { Floorplan, FloorplanDraft, FloorplanItem } from "./entities";
import { isRecoveredFloorplanCopy, recoveredFloorplanName, resolveFloorplanRecovery } from "./floorplanRecovery";

const item = (id: string): FloorplanItem => ({
  id,
  shape: "stage",
  label: id,
  x: 50,
  y: 50,
  seats: null,
});

const saved: Floorplan = {
  id: "floorplan-1",
  eventId: "event-1",
  name: "Main room",
  items: [item("saved")],
  updatedAt: "2026-10-14T19:53:24.818Z",
};

const rawDraft = (editedAt: number, draft: FloorplanDraft) => JSON.stringify({ editedAt, draft });

describe("floorplan browser recovery", () => {
  it("offers a valid browser copy newer than the server save without overwriting the server", () => {
    const recovery = resolveFloorplanRecovery(saved, rawDraft(Date.parse(saved.updatedAt) + 1_000, {
      name: "Main room",
      items: [item("saved"), item("newer-browser-item")],
    }));

    expect(recovery).toMatchObject({ itemCount: 2 });
  });

  it("builds a unique recovered-room name within the 120-character limit", () => {
    const original = "A".repeat(120);
    const first = recoveredFloorplanName(original, []);
    const second = recoveredFloorplanName(original, [first]);

    expect(first).toBe(`${"A".repeat(103)} - recovered copy`);
    expect(second).toBe(`${"A".repeat(101)} - recovered copy 2`);
    expect(first).toHaveLength(120);
    expect(second).toHaveLength(120);
  });

  it("recognizes an already recovered copy even when its room name changed", () => {
    const draft: FloorplanDraft = {
      name: "Main room",
      items: [item("saved"), item("browser-only")],
    };
    const recovered: Floorplan = {
      ...saved,
      id: "recovered",
      name: "Main room - recovered copy",
      items: draft.items,
    };

    expect(isRecoveredFloorplanCopy(recovered, draft)).toBe(true);
    expect(isRecoveredFloorplanCopy({ ...recovered, name: "Unrelated room" }, draft)).toBe(false);
  });

  it("offers a different browser copy even when its device clock is older", () => {
    const recovery = resolveFloorplanRecovery(saved, rawDraft(Date.parse(saved.updatedAt) - 60_000, {
      name: "Main room",
      items: [item("saved"), item("unsynced-browser-item")],
    }));

    expect(recovery).toMatchObject({ itemCount: 2 });
  });

  it("ignores identical and invalid browser copies", () => {
    expect(resolveFloorplanRecovery(saved, rawDraft(Date.now(), { name: saved.name, items: saved.items }))).toBeNull();
    expect(resolveFloorplanRecovery(saved, "not-json")).toBeNull();
  });
});
