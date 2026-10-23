import { describe, expect, it } from "vitest";

import { normalizeEventNavigation } from "./eventNavigation";

describe("event navigation settings", () => {
  it("keeps unique hideable tab ids and ignores essential or unknown routes", () => {
    expect(normalizeEventNavigation({ hiddenTabIds: ["raffle", "raffle", "overview", "share", "unknown", "menu"] }))
      .toEqual({ hiddenTabIds: ["raffle", "menu"] });
  });

  it("defaults old events to a fully visible menu", () => {
    expect(normalizeEventNavigation(null)).toEqual({ hiddenTabIds: [] });
  });
});
