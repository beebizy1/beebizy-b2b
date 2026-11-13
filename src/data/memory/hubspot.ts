import { DataError, type HubSpotRepository } from "../adapter";
import { EMPTY_HUBSPOT_INBOUND, type HubSpotContactRow } from "../hubspotContacts";
import type { MemoryDb } from "./seed";
import type { HubSpotEventSourceStatus } from "../hubspotEventSource";

/** Explicitly labelled demo data; this adapter never calls HubSpot or sends email. */
export function demoHubSpot(store: () => MemoryDb, ownerId: string) {
  let enabled = false; let syncedAt: string | null = null;
  const eventSources = new Map<string, HubSpotEventSourceStatus>();
  const source = [
    { id: "1001", firstName: "María Elena", lastName: "de la Cruz-Taylor", email: "maria@example.invalid", company: "Example School", emailOptOut: false },
    { id: "1002", firstName: "Jordan", lastName: "Lee", email: "jordan@example.invalid", company: "Example School", emailOptOut: false },
    { id: "1003", firstName: "Sam", lastName: "Patel", email: "sam@example.invalid", company: "Community Foundation", emailOptOut: true },
    { id: "1004", firstName: "Cher", lastName: "", email: null, company: null, emailOptOut: false },
  ];
  const rows = () => syncedAt ? source.map(contact => ({ ...contact, guestId: store().guests.find(guest => guest.id === `demo-hubspot-${contact.id}` || (contact.email && guest.contact?.toLowerCase() === contact.email))?.id ?? null, name: [contact.firstName, contact.lastName].filter(Boolean).join(" "), phone: null, issue: null, alreadyRegistered: false })) : [];
  const adapter: HubSpotRepository = {
    async status() { return { state: "connected", isConfigured: true, isDemo: true, portalId: "Demo contacts only", lastSyncedAt: null, lastError: null, contactsSynced: 0, inbound: { ...EMPTY_HUBSPOT_INBOUND, enabled, state: syncedAt ? "ready" : "idle", processed: syncedAt ? source.length : 0, contacts: rows().length, lastSyncedAt: syncedAt } }; },
    async beginConnect() { throw new DataError("unavailable", "This is a demo connection. Sign in to connect your real HubSpot account."); },
    async setContactSync(value) { enabled = value; if (value) await adapter.syncContacts(); return adapter.status(); },
    async syncContacts() {
      if (!enabled) throw new DataError("invalid", "Turn on contact sync first.");
      for (const contact of source) {
        if (store().guests.some(guest => guest.id === `demo-hubspot-${contact.id}` || (contact.email && guest.contact?.toLowerCase() === contact.email))) continue;
        store().guests.push({ id: `demo-hubspot-${contact.id}`, ownerId, name: [contact.firstName, contact.lastName].filter(Boolean).join(" "), contact: contact.email, notes: null, createdAt: new Date().toISOString() });
      }
      syncedAt = new Date().toISOString(); return adapter.status();
    },
    async contacts(filter) {
      const needle = filter.search?.toLowerCase().trim() ?? "";
      const registered = new Set(store().registrations.filter(item => item.eventId === filter.eventId).map(item => item.guestId));
      const all: HubSpotContactRow[] = rows().filter(item => !needle || [item.name, item.email, item.company].some(value => value?.toLowerCase().includes(needle))).map(item => ({ ...item, alreadyRegistered: Boolean(item.guestId && registered.has(item.guestId)) }));
      const start = Number(filter.cursor ?? 0); const limit = filter.limit ?? 50;
      return { contacts: structuredClone(all.slice(start, start + limit)), total: all.length, nextCursor: start + limit < all.length ? String(start + limit) : null };
    },
    async addContacts(eventId, ids) {
      const event = store().events.find(item => item.id === eventId);
      if (!event) throw new DataError("not-found", "That event no longer exists.");
      const selected = rows().filter(item => ids.includes(item.id));
      const fresh = selected.filter(item => item.guestId && !store().registrations.some(reg => reg.eventId === eventId && reg.guestId === item.guestId));
      if (event.capacity !== null && event.registrationCount + fresh.length > event.capacity) throw new DataError("conflict", "Increase capacity or choose fewer contacts.");
      for (const contact of fresh) {
        store().registrations.push({ id: `reg-${crypto.randomUUID()}`, ownerId, eventId, eventTitle: event.title, guestId: contact.guestId!, status: "pending", segment: "General", organization: contact.company, quantity: 1, checkedInAt: null, checkInStation: null, checkInNotes: null, registeredAt: new Date().toISOString(), createdAt: new Date().toISOString(), importedFields: [{ label: "Full Name", value: contact.name }, { label: "First Name", value: contact.firstName }, { label: "Last Name", value: contact.lastName }, { label: "Email Address", value: contact.email ?? "" }, { label: "RSVP Response", value: "Pending" }, { label: "Source", value: "HubSpot demo" }, { label: "HubSpot email opt-out", value: contact.emailOptOut ? "Yes" : "No" }] });
      }
      event.registrationCount += fresh.length;
      return { added: fresh.length, alreadyOnList: ids.length - fresh.length };
    },
    async registrationLists() { return { lists: [{ id: "1", name: "Sample registered guests", size: source.length }], nextOffset: null }; },
    async eventSource(eventId) { return structuredClone(eventSources.get(eventId) ?? null); },
    async setEventSource(eventId, draft) {
      if (draft.listId !== "1") throw new DataError("not-found", "That sample list does not exist.");
      if (draft.enabled && !enabled) throw new DataError("invalid", "Turn on sample contact sync first.");
      if (draft.enabled) {
        const existing = new Set(store().registrations.filter(item => item.eventId === eventId).map(item => item.id));
        await adapter.addContacts(eventId, source.map(contact => contact.id));
        for (const registration of store().registrations.filter(item => item.eventId === eventId && !existing.has(item.id))) registration.status = "confirmed";
      }
      eventSources.set(eventId, { listId: "1", listName: "Sample registered guests", enabled: draft.enabled, state: draft.enabled ? "ready" : "paused", registrations: store().registrations.filter(item => item.eventId === eventId && item.importedFields?.some(field => field.label === "Source" && field.value === "HubSpot demo")).length, lastSyncedAt: new Date().toISOString(), error: null });
      return adapter.eventSource(eventId);
    },
    async setEventSync(eventId, value) { const event = store().events.find(item => item.id === eventId); if (!event) throw new DataError("not-found", "That event no longer exists."); event.hubspotSyncEnabled = value; return { event: structuredClone(event), synced: 0, skipped: 0, failed: 0, lastSyncedAt: new Date().toISOString() }; },
    async syncEvent() { return { synced: 0, skipped: 0, failed: 0, lastSyncedAt: new Date().toISOString() }; },
    async disconnect() { enabled = false; syncedAt = null; },
  };
  return { adapter, reset() { enabled = false; syncedAt = null; eventSources.clear(); } };
}
