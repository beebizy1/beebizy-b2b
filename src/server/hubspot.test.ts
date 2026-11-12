import { describe, expect, it, vi } from "vitest";
import type { RegistrationWithGuest } from "../data/entities";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./repos", () => ({ events: {}, registrations: {} }));
vi.mock("./googleCalendar", () => ({
  openToken: vi.fn(),
  readOAuthState: vi.fn(),
  sealToken: vi.fn(),
  signOAuthState: vi.fn(),
}));

const { hubspotContactProperties, hubspotRegistrationNote, splitContactName, requireHubSpotAdmin } = await import("./hubspot");

function registration(overrides: Partial<RegistrationWithGuest> = {}): RegistrationWithGuest {
  return {
    id: "registration-1",
    ownerId: "workspace-1",
    eventId: "event-1",
    eventTitle: "Annual Gala",
    guestId: "guest-1",
    status: "confirmed",
    segment: "Sponsor",
    organization: "Santa Clara University",
    quantity: 2,
    registeredAt: "2026-11-05T20:00:00.000Z",
    checkedInAt: "2026-11-05T22:00:00.000Z",
    checkInStation: "Main entrance",
    checkInNotes: null,
    createdAt: "2026-11-05T20:00:00.000Z",
    guest: {
      id: "guest-1",
      ownerId: "workspace-1",
      name: "Cristina Cismas Florea",
      contact: "Cristina@Example.com",
      notes: null,
      createdAt: "2026-11-05T20:00:00.000Z",
    },
    ...overrides,
  };
}

describe("HubSpot contact mapping", () => {
  it("limits connection and sync settings to full-workspace owners and admins", () => {
    const context = { workspaceId: "workspace-1", userId: "user-1", email: "owner@example.invalid", role: "owner" as const };
    expect(() => requireHubSpotAdmin(context)).not.toThrow();
    expect(() => requireHubSpotAdmin({ ...context, role: "admin" })).not.toThrow();
    expect(() => requireHubSpotAdmin({ ...context, role: "member" })).toThrow("owner or admin");
    expect(() => requireHubSpotAdmin({ ...context, eventScopeId: "event-1" })).toThrow("assigned event");
  });
  it("keeps the first word as first name and the remaining words together", () => {
    expect(splitContactName("Cristina Cismas Florea")).toEqual({ firstname: "Cristina", lastname: "Cismas Florea" });
  });

  it("normalizes email and maps only standard free-CRM properties", () => {
    expect(hubspotContactProperties(registration())).toEqual({
      email: "cristina@example.com",
      firstname: "Cristina",
      lastname: "Cismas Florea",
      company: "Santa Clara University",
    });
  });

  it("skips name-only guests instead of creating duplicate-prone contacts", () => {
    expect(hubspotContactProperties(registration({ guest: { ...registration().guest!, contact: null } }))).toBeNull();
  });

  it("keeps explicit compound RSVP names when syncing and ignores stale name metadata after a rename", () => {
    const row = registration({
      guest: { ...registration().guest!, name: "María Elena de la Cruz-Taylor" },
      importedFields: [{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz-Taylor" }],
    });
    expect(hubspotContactProperties(row)).toMatchObject({ firstname: "María Elena", lastname: "de la Cruz-Taylor" });
    expect(hubspotContactProperties({ ...row, guest: { ...row.guest!, name: "Carlin Putman" } })).toMatchObject({ firstname: "Carlin", lastname: "Putman" });
  });

  it("creates one readable attendance note without exposing internal fields", () => {
    expect(hubspotRegistrationNote(registration())).toBe(
      "<strong>Beebizy registration</strong><br>Event: Annual Gala<br>Status: confirmed<br>Guest type: Sponsor<br>Organization: Santa Clara University<br>Party size: 2<br>Checked in: Yes",
    );
  });
});
