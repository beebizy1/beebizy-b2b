import { describe, expect, it } from "vitest";
import type { RegistrationWithGuest } from "./entities";
import { attendanceNamesCsv, buildUniqueAttendanceReport, normalizeAttendeeName } from "./attendanceReport";

function registration(
  id: string,
  name: string,
  options: {
    email?: string | null;
    checkedInAt?: string | null;
    status?: "pending" | "confirmed" | "cancelled";
    imported?: boolean;
    segment?: string | null;
  } = {},
): RegistrationWithGuest {
  return {
    id,
    ownerId: "workspace-1",
    eventId: "event-1",
    eventTitle: "Demo Day",
    guestId: `guest-${id}`,
    status: options.status ?? "confirmed",
    segment: options.segment ?? null,
    organization: null,
    quantity: 1,
    registeredAt: "2026-10-01T12:00:00.000Z",
    checkedInAt: options.checkedInAt === undefined ? "2026-10-09T20:00:00.000Z" : options.checkedInAt,
    checkInStation: "Counter 2",
    checkInNotes: null,
    importedFields: options.imported ? [{ label: "Full Name", value: name }] : [],
    createdAt: "2026-10-01T12:00:00.000Z",
    guest: {
      id: `guest-${id}`,
      ownerId: "workspace-1",
      name,
      contact: options.email ?? null,
      notes: options.imported ? "Imported" : "Registered at event check-in.",
      createdAt: "2026-10-01T12:00:00.000Z",
    },
  };
}

describe("unique attendance reporting", () => {
  it("normalizes capitalization and repeated spaces", () => {
    expect(normalizeAttendeeName("  Toby   HSU ")).toBe("toby hsu");
  });

  it("consolidates duplicate names and keeps the row with contact data", () => {
    const report = buildUniqueAttendanceReport([
      registration("tarang-1", "Tarang Goyal"),
      registration("tarang-2", " tarang   goyal "),
      registration("arnav-walkin", "Arnav Mani"),
      registration("arnav-import", "Arnav Mani", { email: "arnav@example.com", imported: true }),
      registration("no-show", "No Show", { checkedInAt: null, status: "pending" }),
      registration("cancelled", "Cancelled Person", { checkedInAt: null, status: "cancelled" }),
    ]);

    expect(report.summary).toEqual({
      registrationRows: 5,
      uniqueRegistered: 3,
      checkedInRows: 4,
      uniqueCheckedIn: 2,
      duplicateCheckedInRows: 2,
      emailReady: 1,
      missingEmail: 1,
      attendanceRate: 66.7,
    });
    expect(report.attendees).toHaveLength(2);
    expect(report.attendees.find((row) => row.name === "Arnav Mani")).toMatchObject({
      email: "arnav@example.com",
      duplicateRecordsConsolidated: 1,
      registrationSource: "Imported registration",
    });
  });

  it("exports one CSV row per unique attendee", () => {
    const report = buildUniqueAttendanceReport([
      registration("one", "Ada Lovelace", { email: "ada@example.com", imported: true }),
      registration("two", "ada lovelace"),
    ]);
    const csv = attendanceNamesCsv(report.attendees);
    expect(csv).toContain("Full Name");
    expect(csv.match(/\r\n/g)).toHaveLength(2);
    expect(csv).toContain("Ada Lovelace");
    expect(csv).not.toContain("ada@example.com");
  });
});
