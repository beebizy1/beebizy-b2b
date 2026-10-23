import { z } from "zod";
import {
  FLOORPLAN_ROOM_SHAPES,
  FLOORPLAN_SHAPES,
  FLOORPLAN_CUSTOM_SHAPE_MODES,
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
  width: z.number().finite().min(1).max(100).optional(),
  height: z.number().finite().min(1).max(100).optional(),
  diameterFeet: z.number().finite().min(0.5).max(100).optional(),
  rotation: z.number().finite().min(0).max(359).optional(),
  imageUrl: z.string().url().optional(),
  customShapeMode: z.enum(FLOORPLAN_CUSTOM_SHAPE_MODES).optional(),
  points: z.array(z.object({
    x: z.number().finite().min(0).max(100),
    y: z.number().finite().min(0).max(100),
  })).min(3).max(256).optional(),
}).superRefine((item, context) => {
  if (item.shape === "custom-shape" && !item.points) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom floorplan shapes need at least three corner points.",
      path: ["points"],
    });
  }
  if (item.shape === "custom-shape" && item.customShapeMode !== "freehand" && (item.points?.length ?? 0) > 24) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Straight and curved custom shapes can have at most 24 editable corners.",
      path: ["points"],
    });
  }
  if (item.shape === "image" && !item.imageUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Floorplan image objects need an uploaded image URL.",
      path: ["imageUrl"],
    });
  }
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
