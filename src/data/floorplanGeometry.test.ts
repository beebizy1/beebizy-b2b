import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOORPLAN_ROOM,
  FLOORPLAN_ITEM_OVERLAY,
  addRoomCorner,
  nearestPointInsideRoom,
  pointIsInsideRoom,
  roomClipPath,
  roomPointsForShape,
  rotationFromPointerAngles,
  smoothClosedPath,
} from "./floorplanGeometry";

describe("floorplan room geometry", () => {
  it("recognizes points inside standard room shapes", () => {
    expect(pointIsInsideRoom(DEFAULT_FLOORPLAN_ROOM, 50, 50)).toBe(true);
    expect(pointIsInsideRoom({ ...DEFAULT_FLOORPLAN_ROOM, shape: "oval" }, 2, 2)).toBe(false);
    expect(
      pointIsInsideRoom(
        { ...DEFAULT_FLOORPLAN_ROOM, shape: "l-shape", points: roomPointsForShape("l-shape") },
        80,
        80,
      ),
    ).toBe(false);
  });

  it("creates CSS outlines for oval and polygon rooms", () => {
    expect(roomClipPath({ ...DEFAULT_FLOORPLAN_ROOM, shape: "oval" })).toMatch(/^ellipse/);
    expect(roomClipPath(DEFAULT_FLOORPLAN_ROOM)).toMatch(/^polygon/);
  });

  it("adds a custom corner at the midpoint of the longest edge", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 20 },
    ];
    const result = addRoomCorner(points);
    expect(result.points).toHaveLength(4);
    expect(result.points[result.index]).toEqual({ x: 50, y: 0 });
    expect(points).toHaveLength(3);
  });

  it("builds a closed smooth path for curved and freehand shapes", () => {
    const path = smoothClosedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(path).toMatch(/^M /);
    expect(path.match(/ Q /g)).toHaveLength(3);
    expect(path).toMatch(/ Z$/);
    expect(smoothClosedPath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe("");
  });

  it("places new objects inside an irregular room that excludes the canvas center", () => {
    const room = {
      ...DEFAULT_FLOORPLAN_ROOM,
      shape: "custom" as const,
      points: [
        { x: 4, y: 4 },
        { x: 30, y: 4 },
        { x: 30, y: 30 },
        { x: 4, y: 30 },
      ],
    };
    const placement = nearestPointInsideRoom(room, { x: 50, y: 50 });
    expect(pointIsInsideRoom(room, placement.x, placement.y)).toBe(true);
    expect(placement.x).toBeLessThanOrEqual(30);
    expect(placement.y).toBeLessThanOrEqual(30);
  });

  it("rotates objects smoothly across the -180/180 degree pointer boundary", () => {
    expect(rotationFromPointerAngles(10, 20, 50)).toBe(40);
    expect(rotationFromPointerAngles(350, 170, -170)).toBe(10);
    expect(rotationFromPointerAngles(15, -170, 170)).toBe(355);
  });

  it("keeps custom-shape edit handles clear of the floating move and rotate toolbar", () => {
    expect(FLOORPLAN_ITEM_OVERLAY.toolbarGapPx).toBeGreaterThanOrEqual(16);
    expect(FLOORPLAN_ITEM_OVERLAY.cornerHandleZIndex).toBeGreaterThan(FLOORPLAN_ITEM_OVERLAY.toolbarZIndex);
  });
});
