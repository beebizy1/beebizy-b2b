import { z } from "zod";
import { FLOORPLAN_SHAPES, type FloorplanDraft } from "./entities";

const floorplanItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  shape: z.enum(FLOORPLAN_SHAPES),
  label: z.string().trim().min(1).max(80),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  seats: z.number().int().min(0).max(10_000).nullable(),
});

const floorplanDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(floorplanItemSchema).max(500),
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
