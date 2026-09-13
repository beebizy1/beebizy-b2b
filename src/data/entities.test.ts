import { describe, expect, it } from "vitest";
import { EVENT_CATEGORIES, REGISTRATION_SEGMENTS } from "./entities";

describe("event categories", () => {
  it("offers community, school and nonprofit planning choices", () => {
    expect(EVENT_CATEGORIES).toEqual(
      expect.arrayContaining(["Community Event", "School Event", "Nonprofit Event"]),
    );
  });
});

describe("registration segments", () => {
  it("offers the Santa Clara guest types by default", () => {
    expect(REGISTRATION_SEGMENTS).toEqual(expect.arrayContaining(["Investor", "Company", "General"]));
  });
});
