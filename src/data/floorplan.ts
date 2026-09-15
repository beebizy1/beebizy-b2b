import { z } from "zod";
import {
  FLOORPLAN_ROOM_SHAPES,
  FLOORPLAN_SHAPES,
  type FloorplanDraft,
  type FloorplanItem,
  type FloorplanRoom,
} from "./entities.ts";
import { DEFAULT_FLOORPLAN_ROOM } from "./floorplanGeometry.ts";

const floorplanItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  shape: z.enum(FLOORPLAN_SHAPES),
  label: z.string().trim().min(1).max(80),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  seats: z.number().int().min(0).max(10_000).nullable(),
  locked: z.boolean().optional(),
});

const floorplanPointSchema = z.object({
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
});

const floorplanRoomSchema = z.object({
  shape: z.enum(FLOORPLAN_ROOM_SHAPES),
  widthFeet: z.number().finite().positive().max(10_000),
  lengthFeet: z.number().finite().positive().max(10_000),
  points: z.array(floorplanPointSchema).min(3).max(24),
});

const floorplanDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(floorplanItemSchema).max(500),
  room: floorplanRoomSchema.optional(),
}).superRefine((draft, context) => {
  const ids = new Set<string>();
  for (const [index, item] of draft.items.entries()) {
    if (!ids.has(item.id)) {
      ids.add(item.id);
      continue;
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Floorplan object ids must be unique.",
      path: ["items", index, "id"],
    });
  }
});

export function parseFloorplanDraft(input: unknown): FloorplanDraft {
  return floorplanDraftSchema.parse(input);
}

/** Physical area represented by the room outline, rounded to a whole square foot. */
export function floorplanRoomSquareFeet(room: FloorplanRoom): number {
  if (room.shape === "rectangle") return Math.round(room.widthFeet * room.lengthFeet);
  if (room.shape === "oval") return Math.round(room.widthFeet * room.lengthFeet * Math.PI / 4);
  if (room.points.length < 3) return 0;

  const doubledArea = room.points.reduce((sum, point, index) => {
    const next = room.points[(index + 1) % room.points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const normalizedArea = Math.abs(doubledArea) / 2 / 10_000;
  return Math.round(room.widthFeet * room.lengthFeet * normalizedArea);
}

interface StoredFloorplanDocument {
  version: 2;
  items: FloorplanItem[];
  room: FloorplanRoom;
}

/** Existing rows stored a bare item array. New rows keep room metadata beside it. */
export function readStoredFloorplan(value: unknown): Pick<FloorplanDraft, "items" | "room"> {
  if (Array.isArray(value)) {
    const parsed = parseFloorplanDraft({ name: "Stored floorplan", items: value });
    return { items: parsed.items, room: { ...DEFAULT_FLOORPLAN_ROOM, points: roomPointsCopy(DEFAULT_FLOORPLAN_ROOM) } };
  }

  if (value && typeof value === "object") {
    const candidate = value as Partial<StoredFloorplanDocument>;
    const parsed = parseFloorplanDraft({
      name: "Stored floorplan",
      items: candidate.items,
      room: candidate.room,
    });
    return {
      items: parsed.items,
      room: parsed.room ?? { ...DEFAULT_FLOORPLAN_ROOM, points: roomPointsCopy(DEFAULT_FLOORPLAN_ROOM) },
    };
  }

  throw new Error("Stored floorplan is not a valid document.");
}

function roomPointsCopy(room: FloorplanRoom) {
  return room.points.map((point) => ({ ...point }));
}

export function writeStoredFloorplan(draft: FloorplanDraft): StoredFloorplanDocument {
  return {
    version: 2,
    items: draft.items,
    room: draft.room ?? { ...DEFAULT_FLOORPLAN_ROOM, points: roomPointsCopy(DEFAULT_FLOORPLAN_ROOM) },
  };
}
