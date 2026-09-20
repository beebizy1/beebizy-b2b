import { z } from "zod";
import { RFP_STATUSES, RFP_TARGET_TYPES, RFP_RESPONSE_STATUSES } from "./entities.ts";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const amount = z.number().int().min(0).max(100_000_000_00).nullable().optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional();
const instant = z.string().datetime({ offset: true }).nullable().optional();

export const rfpDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  vendorCategory: z.string().trim().min(1).max(120),
  targetType: z.enum(RFP_TARGET_TYPES).optional(),
  description: optionalText(10_000),
  eventType: optionalText(120),
  eventDate: instant,
  startTime: time,
  endTime: time,
  headcount: z.number().int().min(1).max(1_000_000).nullable().optional(),
  city: optionalText(200),
  location: optionalText(500),
  budgetMinCents: amount,
  budgetMaxCents: amount,
  deadline: instant,
  requirements: optionalText(10_000),
  status: z.enum(RFP_STATUSES).optional(),
});

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
