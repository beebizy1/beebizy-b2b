import { describe, expect, it } from "vitest";
import { buildSeed, DEMO_OWNER_ID } from "./seed";
import { demoHubSpot } from "./hubspot";

describe("HubSpot guest selection workflow", () => {
  it("imports the address book once without registering, confirming or checking anyone in", async () => {
    const store = buildSeed(); const repo = demoHubSpot(() => store, DEMO_OWNER_ID).adapter;
    const before = structuredClone(store.registrations); const guests = store.guests.length;
    await repo.setContactSync(true); await repo.syncContacts();
    expect(store.guests).toHaveLength(guests + 4);
    expect(store.registrations).toEqual(before);
    expect((await repo.status()).isDemo).toBe(true);
    expect((await repo.contacts({})).contacts).toHaveLength(4);
  });
  it("adds only chosen contacts as pending, preserving compound names and avoiding duplicates", async () => {
    const store = buildSeed(); const repo = demoHubSpot(() => store, DEMO_OWNER_ID).adapter;
    await repo.setContactSync(true);
    const result = await repo.addContacts("evt-gala", ["1001", "1001"]);
    expect(result.added).toBe(1);
    const [added] = store.registrations.filter(row => row.guestId === "demo-hubspot-1001");
    expect(added).toMatchObject({ status: "pending", quantity: 1, checkedInAt: null });
    expect(added?.importedFields).toEqual(expect.arrayContaining([{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz-Taylor" }]));
    const again = await repo.addContacts("evt-gala", ["1001"]); expect(again.added).toBe(0);
    expect((await repo.contacts({ eventId: "evt-gala", search: "María" })).contacts[0]?.alreadyRegistered).toBe(true);
    added!.status = "cancelled";
    expect((await repo.addContacts("evt-gala", ["1001"])).added).toBe(0);
    expect(added!.status).toBe("cancelled");
  });
  it("keeps name-only and opted-out contacts available for attendance, with visible email restrictions", async () => {
    const store = buildSeed(); const repo = demoHubSpot(() => store, DEMO_OWNER_ID).adapter;
    await repo.setContactSync(true);
    const contacts = (await repo.contacts({})).contacts;
    expect(contacts.find(row => row.id === "1003")?.emailOptOut).toBe(true);
    expect(contacts.find(row => row.id === "1004")?.email).toBeNull();
    await repo.addContacts("evt-gala", ["1003", "1004"]);
    expect(store.registrations.filter(row => row.guestId?.startsWith("demo-hubspot-")).every(row => row.status === "pending" && !row.checkedInAt)).toBe(true);
  });
  it("rejects imports beyond capacity without partially adding registrations", async () => {
    const store = buildSeed(); const repo = demoHubSpot(() => store, DEMO_OWNER_ID).adapter;
    await repo.setContactSync(true); const event = store.events.find(item => item.id === "evt-gala")!;
    event.capacity = event.registrationCount;
    const before = structuredClone(store.registrations);
    await expect(repo.addContacts(event.id, ["1001", "1002"])).rejects.toThrow("capacity");
    expect(store.registrations).toEqual(before);
  });
});
