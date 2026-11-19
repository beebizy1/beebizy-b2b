import { describe, expect, it } from "vitest";
import { normalizeHubSpotContact, normalizeHubSpotWebhookBatch, recoverHubSpotSelection, hubspotRemotePageSchema } from "./hubspotContacts";

const contact = (properties: Record<string, string | null>) => ({ id: "123", properties, updatedAt: "2026-11-11T20:00:00.000Z" });
describe("HubSpot contact import", () => {
  it("preserves compound names and normalizes contact details without changing capitalization", () => {
    expect(normalizeHubSpotContact(contact({ firstname: " María Elena ", lastname: "de la Cruz-Taylor", email: " GUEST@Example.com ", company: "School", phone: "408 555 0100", hs_email_optout: "true" }))).toMatchObject({ name: "María Elena de la Cruz-Taylor", firstName: "María Elena", email: "guest@example.com", company: "School", emailOptOut: true });
  });
  it("keeps contacts without email and flags invalid email instead of guessing an address", () => {
    expect(normalizeHubSpotContact(contact({ firstname: "Cher" }))).toMatchObject({ name: "Cher", email: null });
    expect(normalizeHubSpotContact(contact({ email: "not-an-address" }))).toMatchObject({ email: null, issue: "The email address in HubSpot is not valid." });
  });
  it("requires source timestamps to fence late updates and treats pagination as an opaque cursor", () => {
    expect(() => normalizeHubSpotContact({ ...contact({}), updatedAt: "invalid" })).toThrow();
    expect(hubspotRemotePageSchema.parse({ results: [contact({})], paging: { next: { after: "next-cursor", link: "https://untrusted.invalid/" } } }).paging?.next?.after).toBe("next-cursor");
  });
  it("recovers a bounded, deduplicated guest selection and rejects malformed IDs", () => {
    expect(recoverHubSpotSelection('["123","123","456"]')).toEqual(["123", "456"]);
    expect(recoverHubSpotSelection('["../../other-workspace"]')).toEqual([]);
    expect(recoverHubSpotSelection("unfinished")).toEqual([]);
  });
  const pending = (kind: string) => [{ hubspotContactId: "123", occurredAt: new Date("2026-11-11T20:01:00Z"), eventKind: kind }];
  it("retries partial failures and unexplained missing contacts without archiving anything", () => {
    expect(() => normalizeHubSpotWebhookBatch({ results: [], errors: [{ category: "MISSING_SCOPES" }] }, pending("contact.deletion"))).toThrow("no contacts were removed");
    expect(() => normalizeHubSpotWebhookBatch({ results: [], status: "PENDING" }, pending("contact.deletion"))).toThrow();
    expect(() => normalizeHubSpotWebhookBatch({ results: [] }, pending("contact.propertyChange"))).toThrow("will retry");
  });
  it("archives explicit deletions while keeping fresh restores newer than deletion versions", () => {
    expect(normalizeHubSpotWebhookBatch({ results: [], errors: [{ category: "OBJECT_NOT_FOUND" }] }, pending("contact.deletion"))[0]?.archived).toBe(true);
    expect(normalizeHubSpotWebhookBatch({ results: [contact({ firstname: "Restored" })] }, pending("contact.restore"))[0]).toMatchObject({ archived: false, sourceUpdatedAt: "2026-11-11T20:01:00.000Z" });
    expect(normalizeHubSpotWebhookBatch({ results: [contact({ firstname: "Restored" })] }, pending("contact.deletion"))[0]?.archived).toBe(false);
  });
});
