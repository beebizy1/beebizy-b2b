import type { FloorplanPoint, FloorplanRoom, FloorplanRoomShape } from "./entities";

const RECTANGLE_POINTS: FloorplanPoint[] = [
  { x: 2, y: 2 },
  { x: 98, y: 2 },
  { x: 98, y: 98 },
  { x: 2, y: 98 },
];

const L_SHAPE_POINTS: FloorplanPoint[] = [
  { x: 2, y: 2 },
  { x: 98, y: 2 },
  { x: 98, y: 48 },
  { x: 58, y: 48 },
  { x: 58, y: 98 },
  { x: 2, y: 98 },
];

const CUSTOM_POINTS: FloorplanPoint[] = [
  { x: 12, y: 8 },
  { x: 88, y: 5 },
  { x: 97, y: 48 },
  { x: 82, y: 92 },
  { x: 20, y: 96 },
  { x: 4, y: 55 },
];

export const DEFAULT_FLOORPLAN_ROOM: FloorplanRoom = {
  shape: "rectangle",
  widthFeet: 80,
  lengthFeet: 50,
  points: RECTANGLE_POINTS,
};

export function roomPointsForShape(shape: FloorplanRoomShape): FloorplanPoint[] {
  if (shape === "l-shape") return L_SHAPE_POINTS.map((point) => ({ ...point }));
  if (shape === "custom") return CUSTOM_POINTS.map((point) => ({ ...point }));
  return RECTANGLE_POINTS.map((point) => ({ ...point }));
}

export function roomClipPath(room: FloorplanRoom): string {
  if (room.shape === "oval") return "ellipse(48% 48% at 50% 50%)";
  return `polygon(${room.points.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;
}

function pointInPolygon(points: FloorplanPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    const crosses =
      currentPoint.y > y !== previousPoint.y > y &&
      x <
        ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointIsInsideRoom(room: FloorplanRoom, x: number, y: number): boolean {
  if (room.shape === "oval") {
    const normalizedX = (x - 50) / 48;
    const normalizedY = (y - 50) / 48;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }
  return pointInPolygon(room.points, x, y);
}

/** Finds the closest usable placement when a custom room does not contain the toolbar's preferred point. */
export function nearestPointInsideRoom(
  room: FloorplanRoom,
  preferred: FloorplanPoint,
): FloorplanPoint {
  if (pointIsInsideRoom(room, preferred.x, preferred.y)) return preferred;

  let nearest: FloorplanPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let y = 3; y <= 97; y += 2) {
    for (let x = 3; x <= 97; x += 2) {
      if (!pointIsInsideRoom(room, x, y)) continue;
      const distance = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
      if (distance < nearestDistance) {
        nearest = { x, y };
        nearestDistance = distance;
      }
    }
  }

  // Valid rooms have at least three points, so this is only reachable for a very thin
  // custom polygon. Its first vertex is still a safer fallback than the canvas center.
  return nearest ?? { ...room.points[0]! };
}

export function addRoomCorner(points: FloorplanPoint[]): { points: FloorplanPoint[]; index: number } {
  if (points.length < 2) {
    const next = CUSTOM_POINTS.map((point) => ({ ...point }));
    return { points: next, index: next.length - 1 };
  }

  let longestIndex = 0;
  let longestDistance = -1;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index]!;
    const end = points[nextIndex]!;
    const distance = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (distance > longestDistance) {
      longestDistance = distance;
      longestIndex = index;
    }
  }

  const insertAt = longestIndex + 1;
  const start = points[longestIndex]!;
  const end = points[insertAt % points.length]!;
  const next = points.map((point) => ({ ...point }));
  next.splice(insertAt, 0, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
  return { points: next, index: insertAt };
}
