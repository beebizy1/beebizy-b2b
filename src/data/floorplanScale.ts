import type { FloorplanItem, FloorplanRoom, FloorplanShape } from "./entities";

export interface FloorplanTablePreset {
  id: "round-60" | "round-66" | "round-72" | "cocktail-30";
  label: string;
  shape: Extract<FloorplanShape, "round-table" | "cocktail-table">;
  diameterFeet: number;
  seats: number | null;
}

export const FLOORPLAN_TABLE_PRESETS: readonly FloorplanTablePreset[] = [
  { id: "round-60", label: '60" round', shape: "round-table", diameterFeet: 5, seats: 8 },
  { id: "round-66", label: '66" round', shape: "round-table", diameterFeet: 5.5, seats: 10 },
  { id: "round-72", label: '72" round', shape: "round-table", diameterFeet: 6, seats: 10 },
  { id: "cocktail-30", label: '30" highboy / cocktail', shape: "cocktail-table", diameterFeet: 2.5, seats: null },
] as const;

const DEFAULT_TABLE_DIAMETER_FEET: Partial<Record<FloorplanShape, number>> = {
  "round-table": 6,
  "cocktail-table": 2.5,
};

export function floorplanItemDiameterFeet(item: FloorplanItem): number | null {
  return item.diameterFeet ?? DEFAULT_TABLE_DIAMETER_FEET[item.shape] ?? null;
}

export function floorplanItemPercentSize(
  item: FloorplanItem,
  room: FloorplanRoom,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const diameterFeet = floorplanItemDiameterFeet(item);
  if (diameterFeet !== null) {
    return {
      width: diameterFeet / room.widthFeet * 100,
      height: diameterFeet / room.lengthFeet * 100,
    };
  }

  return {
    width: item.width ?? fallback.width,
    height: item.height ?? fallback.height,
  };
}

export function floorplanCanvasAspectRatio(room: FloorplanRoom): number {
  return room.widthFeet / room.lengthFeet;
}

export function floorplanCanvasMinWidth(room: FloorplanRoom): number {
  return Math.ceil(Math.max(720, floorplanCanvasAspectRatio(room) * 360));
}
