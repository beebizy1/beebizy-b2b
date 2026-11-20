import { z } from "zod";
import type { RegistrationQuestion } from "./registrationPage.ts";
const vendorTime = z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time using HH:mm.");
export const bizyVendorScheduleSchema = z.object({ arrivalTime: vendorTime, serviceTime: vendorTime, departureTime: vendorTime, notes: z.string().max(2000) });

export const bizyPartnerDraftSchema = z.object({
  role: z.enum(["sponsor", "vendor"]), resourceId: z.string().min(1).max(200),
  seatLimit: z.number().int().min(1).max(50).default(10),
});
export interface BizyPartnerSummary { id: string; name: string; role: "sponsor" | "vendor"; expiresAt: string; revoked: boolean; submitted: boolean; vendorNotes?: string }
export interface BizyPartnerGrant extends BizyPartnerSummary { resourceId: string; seatLimit: number; registrationIds: string[]; vendorNotes?: string }
export interface BizyPublicPayload {
  eventTitle: string; guestTypes: string[]; contributionLinks: Array<{ title: string; token: string }>;
  eventDate?: string; eventEndDate?: string | null; timeZone?: string; location?: string | null;
  partner?: { name: string; role: "sponsor" | "vendor"; seatLimit: number; submitted: boolean; questions: RegistrationQuestion[]; schedule?: { arrivalTime: string; serviceTime: string; departureTime: string; notes: string } };
}
export async function bizyPublicRequest<T>(path: string, body?: unknown, method: "POST" | "PUT" = "POST"): Promise<T> {
  const response = await fetch(`/api/public/bizy/${path}`, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Your Bizy Link could not load.");
  return payload as T;
}
