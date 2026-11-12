import { beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter as a, resetMemoryStore } from "./adapter";
import { registrationExportTable } from "../registrationExport";

beforeEach(resetMemoryStore);
const host = { firstName: "María Elena", lastName: "de la Cruz", name: "María Elena de la Cruz", email: "party-host@example.invalid", segment: "General", answers: { food: "Vegetarian" } };
const guest = { firstName: "Alex", lastName: "Taylor", answers: { food: "No nuts" } };
async function setup() { await a.events.updateRegistrationPage("evt-skickoff", { maxAdditionalGuests: 2, questions: [{ id: "food", label: "Dietary needs", type: "text", required: true, options: [] }] }); }
describe("RSVP with additional guests", () => {
  it("creates separate confirmed guest records, links the group and exports every person's answers", async () => {
    await setup(); const before = (await a.events.get("evt-skickoff"))!.registrationCount;
    const result = await a.registrations.registerPublic("demo-evt-skickoff", { ...host, additionalGuests: [guest] });
    const rows = (await a.registrations.listForEvent("evt-skickoff")).filter(row => row.id === result.id || row.id === result.additionalGuests?.[0]?.id);
    expect(rows).toHaveLength(2); expect(new Set(rows.map(row => row.guestId)).size).toBe(2);
    expect(rows.every(row => row.quantity === 1 && row.status === "confirmed" && !row.checkedInAt)).toBe(true);
    expect((await a.events.get("evt-skickoff"))!.registrationCount).toBe(before + 2);
    const groupIds = rows.map(row => row.importedFields?.find(field => field.label === "RSVP group")?.value);
    expect(groupIds[0]).toBeTruthy(); expect(groupIds[0]).toBe(groupIds[1]);
    const table = registrationExportTable(rows); expect(table[0]).toContain("Registered by"); expect(table.flat()).toEqual(expect.arrayContaining(["Vegetarian", "No nuts", "Alex", "Taylor"]));
  });
  it("keeps the whole party unsaved when required guest details or capacity checks fail", async () => {
    await setup(); const before = await a.registrations.listForEvent("evt-skickoff"); const people = await a.guests.list();
    await expect(a.registrations.registerPublic("demo-evt-skickoff", { ...host, additionalGuests: [{ ...guest, answers: {} }] })).rejects.toThrow("Dietary needs");
    const event = (await a.events.get("evt-skickoff"))!;
    await a.events.update(event.id, { capacity: event.registrationCount + 1 });
    await expect(a.registrations.registerPublic("demo-evt-skickoff", { ...host, additionalGuests: [guest] })).rejects.toThrow("enough places");
    expect(await a.registrations.listForEvent(event.id)).toEqual(before); expect(await a.guests.list()).toEqual(people);
  });
  it("rejects a repeat party submission without creating name-only guest duplicates", async () => {
    await setup(); await a.registrations.registerPublic("demo-evt-skickoff", { ...host, additionalGuests: [guest] });
    const before = await a.registrations.listForEvent("evt-skickoff"); const people = await a.guests.list();
    await expect(a.registrations.registerPublic("demo-evt-skickoff", { ...host, additionalGuests: [guest] })).rejects.toThrow("already registered");
    expect(await a.registrations.listForEvent("evt-skickoff")).toEqual(before); expect(await a.guests.list()).toEqual(people);
  });
});
