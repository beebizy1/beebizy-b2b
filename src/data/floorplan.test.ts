import { describe, expect, it } from "vitest";
import { floorplanRoomSquareFeet, parseFloorplanDraft, readStoredFloorplan, writeStoredFloorplan } from "./floorplan";
import { FLOORPLAN_SHAPES } from "./entities";

describe("parseFloorplanDraft", () => {
  it("supports Santa Clara site features and individual seating", () => {
    expect(FLOORPLAN_SHAPES).toEqual(expect.arrayContaining(["tree", "chair", "chair-row"]));
  });

  it("calculates usable square footage for rectangular, oval and traced rooms", () => {
    expect(floorplanRoomSquareFeet({ shape: "rectangle", widthFeet: 100, lengthFeet: 50, points: [] })).toBe(5_000);
    expect(floorplanRoomSquareFeet({ shape: "oval", widthFeet: 100, lengthFeet: 50, points: [] })).toBe(3_927);
    expect(floorplanRoomSquareFeet({
      shape: "custom",
      widthFeet: 100,
      lengthFeet: 50,
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }],
    })).toBe(2_500);
  });
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

  it("preserves fixed site features while remaining compatible with older layouts", () => {
    const base = { id: "tree-1", shape: "tree", label: "Existing tree", x: 42, y: 58, seats: null };
    expect(parseFloorplanDraft({ name: "Lawn", items: [{ ...base, locked: true }] }).items[0]).toMatchObject({
      locked: true,
    });
    expect(parseFloorplanDraft({ name: "Lawn", items: [base] }).items[0]).not.toHaveProperty("locked");
  });

  it("validates and preserves physical room dimensions and a custom outline", () => {
    const room = {
      shape: "custom" as const,
      widthFeet: 120,
      lengthFeet: 75,
      points: [
        { x: 5, y: 5 },
        { x: 95, y: 10 },
        { x: 80, y: 95 },
      ],
    };
    expect(parseFloorplanDraft({ name: "Courtyard", items: [], room }).room).toEqual(room);
  });

  it("reads legacy item arrays with a default room and writes versioned room documents", () => {
    const items = [{ id: "tree-1", shape: "tree" as const, label: "Oak", x: 42, y: 58, seats: null }];
    const legacy = readStoredFloorplan(items);
    expect(legacy.items).toEqual(items);
    expect(legacy.room).toMatchObject({ shape: "rectangle", widthFeet: 80, lengthFeet: 50 });

    expect(readStoredFloorplan(writeStoredFloorplan({ name: "Lawn", items, room: legacy.room }))).toEqual(legacy);
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
