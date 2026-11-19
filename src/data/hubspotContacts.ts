import { z } from "zod";

export const HUBSPOT_CONTACT_PROPERTIES = ["firstname", "lastname", "email", "company", "phone", "hs_email_optout"] as const;
const id = z.union([z.string(), z.number().int().safe().nonnegative()]).transform(String).pipe(z.string().regex(/^\d{1,50}$/));
export const hubspotRemoteContactSchema = z.object({
  id, properties: z.record(z.string().max(10_000).nullable()), updatedAt: z.string().datetime({ offset: true }), archived: z.boolean().optional(),
});
export const hubspotRemotePageSchema = z.object({ results: z.array(hubspotRemoteContactSchema).max(100), paging: z.object({ next: z.object({ after: z.union([z.string(), z.number()]).transform(String).pipe(z.string().max(512)) }).optional() }).optional() });
export type NormalizedHubSpotContact = ReturnType<typeof normalizeHubSpotContact>;
export function normalizeHubSpotContact(raw: unknown) {
  const contact = hubspotRemoteContactSchema.parse(raw);
  const text = (key: string) => contact.properties[key]?.trim() || "";
  const rawEmail = text("email").toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
  const firstName = text("firstname"); const lastName = text("lastname");
  return { id: contact.id, firstName, lastName, email, company: text("company") || null, phone: text("phone") || null, emailOptOut: text("hs_email_optout").toLowerCase() === "true", name: [firstName, lastName].filter(Boolean).join(" ") || email || `HubSpot contact ${contact.id}`, hasName: Boolean(firstName || lastName), sourceUpdatedAt: contact.updatedAt, archived: contact.archived === true, issue: rawEmail && !email ? "The email address in HubSpot is not valid." : null };
}
export interface HubSpotInboundStatus {
  enabled: boolean;
  state: "idle" | "queued" | "running" | "paused" | "error" | "ready";
  processed: number;
  contacts: number;
  issues: number;
  pending: number;
  lastSyncedAt: string | null;
  lastWebhookAt: string | null;
  error: string | null;
}
export const EMPTY_HUBSPOT_INBOUND: HubSpotInboundStatus = { enabled: false, state: "idle", processed: 0, contacts: 0, issues: 0, pending: 0, lastSyncedAt: null, lastWebhookAt: null, error: null };
export interface HubSpotContactRow {
  id: string;
  guestId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  emailOptOut: boolean;
  issue: string | null;
  alreadyRegistered: boolean;
}
export interface HubSpotContactPage { contacts: HubSpotContactRow[]; total: number; nextCursor: string | null }
export interface HubSpotContactFilter { eventId?: string; search?: string; cursor?: string; limit?: number }
export interface HubSpotEventImportResult { added: number; alreadyOnList: number }
export const hubspotSelectedIdsSchema = z.array(id).max(2000).transform(ids => [...new Set(ids)]);
export function recoverHubSpotSelection(value: string | undefined): string[] {
  try { return hubspotSelectedIdsSchema.parse(JSON.parse(value ?? "[]")); } catch { return []; }
}

/** A missing API result only archives a contact after an explicit deletion/merge event. */
export function normalizeHubSpotWebhookBatch(raw: unknown, pending: Array<{ hubspotContactId: string; occurredAt: Date; eventKind: string }>) {
  const batch = z.object({ results: z.array(hubspotRemoteContactSchema).max(100), status: z.string().optional(), errors: z.array(z.object({ category: z.string().optional() }).passthrough()).optional(), numErrors: z.number().optional() }).parse(raw);
  if ((batch.status && batch.status !== "COMPLETE") || batch.errors?.some(error => error.category !== "OBJECT_NOT_FOUND") || (batch.numErrors && !batch.errors?.length)) throw new Error("HubSpot could not read every contact. Saved updates will retry; no contacts were removed.");
  const current = new Map(batch.results.map(contact => [contact.id, normalizeHubSpotContact(contact)]));
  return pending.map(item => {
    const contact = current.get(item.hubspotContactId);
    if (!contact) {
      if (!/\.(deletion|merge)$/.test(item.eventKind)) throw new Error("HubSpot hasn't returned this contact yet. Its update is saved and will retry.");
      return normalizeHubSpotContact({ id: item.hubspotContactId, properties: {}, updatedAt: item.occurredAt.toISOString(), archived: true });
    }
    return item.eventKind.endsWith(".restore") && new Date(contact.sourceUpdatedAt) < item.occurredAt ? { ...contact, sourceUpdatedAt: item.occurredAt.toISOString() } : contact;
  });
}
