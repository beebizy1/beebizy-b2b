import { z } from "zod";
import { RFP_EVENT_TYPES, RFP_STATUSES, RFP_TARGET_TYPES, RFP_RESPONSE_STATUSES } from "./entities.ts";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const amount = z.number().int().min(0).max(100_000_000_00).nullable().optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional();
const instant = z.string().datetime({ offset: true }).nullable().optional();
export const rfpSpaceRequirementSchema = z.object({
  id: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(200),
  date: instant.transform((value) => value ?? null),
  startTime: time.transform((value) => value ?? null),
  endTime: time.transform((value) => value ?? null),
  capacity: z.number().int().min(1).max(1_000_000).nullable().optional().transform((value) => value ?? null),
  notes: optionalText(2_000).transform((value) => value ?? null),
});

const REQUIRED_HOTEL_SPACES = ["registration", "breakfast", "meeting", "lunch"] as const;

const rfpDraftFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  vendorCategory: z.string().trim().min(1).max(120),
  targetType: z.enum(RFP_TARGET_TYPES).optional(),
  description: optionalText(10_000),
  eventType: z.enum(RFP_EVENT_TYPES).nullable().optional(),
  eventDate: instant,
  startTime: time,
  endTime: time,
  headcount: z.number().int().min(1).max(1_000_000).nullable().optional(),
  roomBlockRequired: z.boolean().optional(),
  roomsRequired: z.number().int().min(1).max(100_000).nullable().optional(),
  checkInDate: instant,
  checkOutDate: instant,
  spaceRequirements: z.array(rfpSpaceRequirementSchema).max(50).optional(),
  foodBeverageSpendCents: amount,
  ancillarySpendCents: amount,
  ancillarySpendNotes: optionalText(5_000),
  city: optionalText(200),
  location: optionalText(500),
  budgetMinCents: amount,
  budgetMaxCents: amount,
  deadline: instant,
  requirements: optionalText(10_000),
  status: z.enum(RFP_STATUSES).optional(),
});

export const rfpDraftPatchSchema = rfpDraftFieldsSchema.partial();

export const rfpDraftSchema = rfpDraftFieldsSchema.superRefine((value, context) => {
  const requiredDetails: Array<[unknown, string, string]> = [
    [value.eventDate, "eventDate", "Event date is required."],
    [value.startTime, "startTime", "Start time is required."],
    [value.endTime, "endTime", "End time is required."],
    [value.headcount, "headcount", "Headcount is required."],
    [value.city, "city", "City is required."],
    [value.location, "location", "Location is required."],
    [value.eventType, "eventType", "Event type is required."],
  ];
  for (const [field, path, message] of requiredDetails) {
    if (field === null || field === undefined || field === "") {
      context.addIssue({ code: "custom", path: [path], message });
    }
  }

  if (!value.roomBlockRequired) return;
  if (!validHotelRfp(value)) {
    context.addIssue({ code: "custom", path: ["roomBlockRequired"], message: "Room blocks need a venue, room count, and check-out after check-in." });
  }
  if (value.foodBeverageSpendCents == null) {
    context.addIssue({ code: "custom", path: ["foodBeverageSpendCents"], message: "Expected food and beverage spend is required." });
  }
  if (value.ancillarySpendCents == null) {
    context.addIssue({ code: "custom", path: ["ancillarySpendCents"], message: "Other property spend is required. Enter 0 if none is expected." });
  }
  const purposes = new Set((value.spaceRequirements ?? []).map((space) => space.purpose.trim().toLowerCase()));
  for (const purpose of REQUIRED_HOTEL_SPACES) {
    if (!purposes.has(purpose)) {
      context.addIssue({ code: "custom", path: ["spaceRequirements"], message: `Add a ${purpose} space requirement.` });
    }
  }
  for (const [index, space] of (value.spaceRequirements ?? []).entries()) {
    if (!space.date || !space.startTime || !space.endTime || !space.capacity) {
      context.addIssue({ code: "custom", path: ["spaceRequirements", index], message: `${space.purpose} needs a date, start, end and capacity.` });
    }
  }
});

export function validHotelRfp(value: {
  roomBlockRequired?: boolean;
  roomsRequired?: number | null;
  checkInDate?: string | Date | null;
  checkOutDate?: string | Date | null;
  targetType?: string | null;
}): boolean {
  if (!value.roomBlockRequired) return true;
  if (value.targetType !== "venue" || !value.roomsRequired || !value.checkInDate || !value.checkOutDate) return false;
  return new Date(value.checkOutDate).getTime() > new Date(value.checkInDate).getTime();
}

export function validRfpBudget(value: { budgetMinCents?: number | null; budgetMaxCents?: number | null }): boolean {
  return value.budgetMinCents == null || value.budgetMaxCents == null || value.budgetMaxCents >= value.budgetMinCents;
}

export const rfpResponseSchema = z.object({
  vendorName: z.string().trim().min(1).max(200),
  contactName: optionalText(120),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
  contactPhone: optionalText(60),
  quotedAmountCents: amount,
  notes: optionalText(10_000),
  status: z.enum(RFP_RESPONSE_STATUSES).optional(),
});

export const publicProposalSchema = rfpResponseSchema.extend({
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(320),
  quotedAmountCents: z.number().int().min(0).max(100_000_000_00),
  notes: z.string().trim().min(1).max(10_000),
}).omit({ status: true, vendorName: true });
