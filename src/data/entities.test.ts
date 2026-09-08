import { describe, expect, it } from "vitest";
import { EVENT_CATEGORIES } from "./entities";

describe("event categories", () => {
  it("offers community, school and nonprofit planning choices", () => {
    expect(EVENT_CATEGORIES).toEqual(
      expect.arrayContaining(["Community Event", "School Event", "Nonprofit Event"]),
    );
  });
});
