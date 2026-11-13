import { z } from "zod";

export const hubspotListId = z.string().regex(/^\d{1,50}$/);
export const hubspotListSchema = z.object({
  listId: hubspotListId,
  name: z.string().min(1).max(1000),
  objectTypeId: z.string(),
  processingStatus: z.string(),
  additionalProperties: z.record(z.string()).optional(),
});
export const hubspotListsSchema = z.object({ lists: z.array(hubspotListSchema), hasMore: z.boolean(), offset: z.number().int().nonnegative() });
export const hubspotMembershipsSchema = z.object({
  results: z.array(z.object({ recordId: hubspotListId })).max(250),
  paging: z.object({ next: z.object({ after: z.union([z.string(), z.number()]).transform(String) }).optional() }).optional(),
});
export const hubspotEventSourceDraftSchema = z.object({ listId: hubspotListId, enabled: z.boolean() });
export const hubspotEventSourceMessageSchema = z.object({ eventId: z.string().min(1).max(100), generation: z.string().uuid(), tick: z.number().int().nonnegative() });
export type HubSpotEventSourceMessage = z.infer<typeof hubspotEventSourceMessageSchema>;
export interface HubSpotRegistrationList { id: string; name: string; size: number | null }
export interface HubSpotRegistrationLists { lists: HubSpotRegistrationList[]; nextOffset: number | null }
export interface HubSpotEventSourceStatus {
  listId: string;
  listName: string;
  enabled: boolean;
  state: string;
  registrations: number;
  lastSyncedAt: string | null;
  error: string | null;
}
