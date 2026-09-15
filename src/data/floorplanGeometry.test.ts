import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOORPLAN_ROOM,
  addRoomCorner,
  nearestPointInsideRoom,
  pointIsInsideRoom,
  roomClipPath,
  roomPointsForShape,
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
});
