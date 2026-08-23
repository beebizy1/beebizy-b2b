import { describe, expect, it } from "vitest";
import { parseFloorplanDraft } from "./floorplan";

describe("parseFloorplanDraft", () => {
  it("accepts a structured room layout", () => {
    expect(
      parseFloorplanDraft({
        name: " Ballroom A ",
        items: [{ id: "table-1", shape: "round-table", label: "Table 1", x: 42, y: 58, seats: 10 }],
      }),
    ).toEqual({
      name: "Ballroom A",
      items: [{ id: "table-1", shape: "round-table", label: "Table 1", x: 42, y: 58, seats: 10 }],
    });
  });

  it("rejects duplicate object ids", () => {
    const item = { id: "table-1", shape: "round-table", label: "Table 1", x: 42, y: 58, seats: 10 };
    expect(() => parseFloorplanDraft({ name: "Ballroom", items: [item, item] })).toThrow(/unique/i);
  });

  it.each([
    { field: "shape", value: "triangle" },
    { field: "x", value: 101 },
    { field: "y", value: -1 },
    { field: "seats", value: 1.5 },
  ])("rejects an invalid $field", ({ field, value }) => {
    const item = { id: "table-1", shape: "round-table", label: "Table 1", x: 42, y: 58, seats: 10 };
    expect(() =>
      parseFloorplanDraft({ name: "Ballroom", items: [{ ...item, [field]: value }] }),
    ).toThrow();
  });
});
