import { describe, expect, it } from "vitest";

import { normalizeEventNavigation } from "./eventNavigation";

describe("event navigation settings", () => {
  it("keeps unique hideable tab ids and ignores essential or unknown routes", () => {
    expect(normalizeEventNavigation({
      hiddenTabIds: ["raffle", "raffle", "overview", "share", "unknown", "menu"],
      tabOrder: ["vendors", "vendors", "overview", "share", "unknown", "checklist"],
    })).toEqual({ hiddenTabIds: ["raffle", "menu"], tabOrder: ["vendors", "overview", "checklist"] });
  });

  it("defaults old events to a fully visible menu", () => {
    expect(normalizeEventNavigation(null)).toEqual({ hiddenTabIds: [], tabOrder: [] });
    expect(normalizeEventNavigation({ hiddenTabIds: ["menu"] })).toEqual({ hiddenTabIds: ["menu"], tabOrder: [] });
  });
});
