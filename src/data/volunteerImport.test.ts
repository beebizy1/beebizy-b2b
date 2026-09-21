import { describe, expect, it } from "vitest";
import { parseVolunteerCsv, parseVolunteerTable, volunteerShiftImportKey, VOLUNTEER_CSV_TEMPLATE } from "./volunteerImport";

describe("parseVolunteerCsv", () => {
  it("maps a Santa Clara volunteer roster into editable shifts", () => {
    const preview = parseVolunteerCsv([
      "Volunteer Name,Email,Phone,Role,Day,Start Time,End Time,Status,Notes",
      "Maya Chen,maya@example.com,408-555-0100,East entrance,1,8:00 AM,12:30 PM,Confirmed,Arrive at loading dock",
      "Luis Rivera,luis@example.com,,Room monitor,Day 2,13:00,17:00,Scheduled,Building B",
    ].join("\n"));

    expect(preview.rows).toEqual([
      expect.objectContaining({
        line: 2,
        name: "Maya Chen",
        role: "East entrance",
        dayNumber: 1,
        startTime: "08:00",
        endTime: "12:30",
        status: "confirmed",
        problem: null,
      }),
      expect.objectContaining({
        line: 3,
        name: "Luis Rivera",
        role: "Room monitor",
        dayNumber: 2,
        startTime: "13:00",
        endTime: "17:00",
        status: "scheduled",
        problem: null,
      }),
    ]);
  });

  it("returns invalid rows with a useful spreadsheet line number", () => {
    const preview = parseVolunteerCsv([
      "Name,Role,Start,End,Email",
      "No Time,Usher,,,person@example.com",
      "Bad Email,Welcome desk,08:00,12:00,not-an-email",
      "Backwards,Runner,13:00,13:00,backwards@example.com",
    ].join("\n"));

    expect(preview.rows.map((row) => [row.line, row.problem])).toEqual([
      [2, "Start and end time are required"],
      [3, "Email doesn't look valid"],
      [4, "Start and end time must be different"],
    ]);
  });

  it("ships a template that parses without errors", () => {
    const preview = parseVolunteerCsv(VOLUNTEER_CSV_TEMPLATE);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.rows.every((row) => row.problem === null)).toBe(true);
  });

  it("parses spreadsheet time numbers and rejects a duplicate on the same event day", () => {
    const table = {
      name: "Volunteers",
      headers: ["Name", "Role", "Day", "Start", "End", "Status"],
      rows: [
        { Name: "Ada", Role: "Welcome desk", Day: 1, Start: 8 / 24, End: 0.5, Status: "Checked in" },
        { Name: "Ada", Role: "Welcome desk", Day: 1, Start: 8 / 24, End: 0.5, Status: "Unknown" },
        { Name: "Ada", Role: "Welcome desk", Day: 2, Start: 8 / 24, End: 0.5, Status: "Unknown" },
      ],
    };
    const { rows } = parseVolunteerTable(table);

    expect(rows[0]).toMatchObject({ startTime: "08:00", endTime: "12:00", status: "checked_in", problem: null });
    expect(rows[1]?.problem).toBe("Duplicate shift in this file");
    expect(rows[2]).toMatchObject({ dayNumber: 2, status: "scheduled", problem: null });
    expect(volunteerShiftImportKey(rows[0]!)).not.toBe(volunteerShiftImportKey(rows[2]!));
  });

  it("maps a roster date to the correct day of a multi-day event", () => {
    const preview = parseVolunteerTable({
      name: "Volunteers",
      headers: ["Name", "Role", "Shift Date", "Start", "End"],
      rows: [{ Name: "Maya", Role: "Registration", "Shift Date": "2026-10-08", Start: "08:00", End: "12:00" }],
    }, { eventStartDate: "2026-10-07T09:00:00-07:00" });

    expect(preview.rows[0]).toMatchObject({ dayNumber: 2, problem: null });
  });

  it("rejects malformed and out-of-range day values", () => {
    const preview = parseVolunteerCsv([
      "Name,Role,Day,Start,End",
      "Maya,Registration,2.5,08:00,12:00",
      "Luis,Usher,999,09:00,13:00",
    ].join("\n"));
    expect(preview.rows.map((row) => row.problem)).toEqual([
      "Event day must be a whole number from 1 to 365",
      "Event day must be a whole number from 1 to 365",
    ]);
  });
});
