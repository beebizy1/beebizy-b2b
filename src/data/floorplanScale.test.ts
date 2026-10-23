import { describe, expect, it } from "vitest";

import type { FloorplanItem, FloorplanRoom } from "./entities";
import {
  FLOORPLAN_TABLE_PRESETS,
  floorplanCanvasAspectRatio,
  floorplanCanvasMinWidth,
  floorplanItemPercentSize,
} from "./floorplanScale";

const room: FloorplanRoom = {
  shape: "rectangle",
  widthFeet: 150,
  lengthFeet: 50,
  points: [
    { x: 2, y: 2 },
    { x: 98, y: 2 },
    { x: 98, y: 98 },
    { x: 2, y: 98 },
  ],
};

const roundTable = (diameterFeet?: number): FloorplanItem => ({
  id: "table-1",
  shape: "round-table",
  label: "Table 1",
  x: 50,
  y: 50,
  seats: 10,
  diameterFeet,
});

describe("floorplan physical scale", () => {
  it("renders a 60-inch round as five physical feet in a 150 by 50 foot room", () => {
    expect(floorplanItemPercentSize(roundTable(5), room, { width: 9, height: 12 })).toEqual({
      width: 5 / 150 * 100,
      height: 5 / 50 * 100,
    });
  });

  it("keeps legacy rounds at a true-scale 72-inch default", () => {
    expect(floorplanItemPercentSize(roundTable(), room, { width: 9, height: 12 })).toEqual({
      width: 6 / 150 * 100,
      height: 6 / 50 * 100,
    });
  });

  it("does not distort a 150 by 50 foot room", () => {
    expect(floorplanCanvasAspectRatio(room)).toBe(3);
    expect(floorplanCanvasMinWidth(room)).toBe(1_080);
  });

  it("offers all requested standard table sizes", () => {
    expect(FLOORPLAN_TABLE_PRESETS.map((preset) => [preset.label, preset.diameterFeet])).toEqual([
      ['60" round', 5],
      ['66" round', 5.5],
      ['72" round', 6],
      ['30" highboy / cocktail', 2.5],
    ]);
  });
});
