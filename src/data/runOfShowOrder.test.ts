import { describe, expect, it } from "vitest";
import { moveRunOfShowCue, validRunOfShowOrder } from "./runOfShowOrder";

describe("Run of Show ordering", () => {
  it("moves one cue and assigns stable one-based sort positions", () => {
    expect(moveRunOfShowCue(["cue-a", "cue-b", "cue-c"], "cue-c", "cue-a")).toEqual([
      { id: "cue-c", sortOrder: 1 },
      { id: "cue-a", sortOrder: 2 },
      { id: "cue-b", sortOrder: 3 },
    ]);
  });

  it("rejects missing, duplicate, or foreign cue ids", () => {
    expect(validRunOfShowOrder(["cue-a", "cue-b"], ["cue-b", "cue-a"])).toBe(true);
    expect(validRunOfShowOrder(["cue-a", "cue-b"], ["cue-a"])).toBe(false);
    expect(validRunOfShowOrder(["cue-a", "cue-b"], ["cue-a", "cue-a"])).toBe(false);
    expect(validRunOfShowOrder(["cue-a", "cue-b"], ["cue-a", "cue-x"])).toBe(false);
  });
});
