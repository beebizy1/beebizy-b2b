import { describe, expect, it } from "vitest";
import { buildEventImportPlan, googleSheetCsvUrl, parseCsvTable } from "./import";

describe("spreadsheet import", () => {
  it("parses quoted CSV values without losing commas or line breaks", () => {
    const table = parseCsvTable(
      'Event Name,Description,Capacity\r\n"Community Gala","Dinner, awards, and dancing",250\r\n"Second event","Two-line\nbrief",80',
      "Events",
    );

    expect(table).toEqual({
      name: "Events",
      headers: ["Event Name", "Description", "Capacity"],
      rows: [
        { "Event Name": "Community Gala", Description: "Dinner, awards, and dancing", Capacity: "250" },
        { "Event Name": "Second event", Description: "Two-line\nbrief", Capacity: "80" },
      ],
    });
  });

  it("turns familiar event sheets into one reviewable event plan", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable(
          "Event Name,Date,End Date,Location,Capacity,Category,Description\nPartner Gala,2026-11-14,2026-11-15,The Foundry,240,Gala,Annual partner dinner",
          "Event",
        ),
        parseCsvTable(
          "Task,Category,Due Date,Owner,Completed\nConfirm venue,Venue,2026-10-01,Laila,no\nSend final guest count,Catering,2026-11-07,Maya,yes",
          "Checklist",
        ),
        parseCsvTable(
          "Start Time,Duration,Title,Responsible,Notes\n5:30 PM,45,Guest arrival,Guest team,Open both doors\n18:15,15,Welcome,Host,",
          "Run of Show",
        ),
        parseCsvTable(
          'Item,Category,Type,Estimated,Actual,Notes\nVenue rental,Venue,Expense,"$30,000","$29,500",Includes security\nTicket sales,Revenue,Revenue,50000,52500,',
          "Budget",
        ),
        parseCsvTable("Image URL,Caption\nhttps://example.com/look.jpg,Warm floral direction", "Mood Board"),
        parseCsvTable("Name,Email,Notes\nAda Lovelace,ada@example.com,VIP", "Guests"),
      ],
      "partner-gala.xlsx",
    );

    expect(plan.event).toMatchObject({
      title: "Partner Gala",
      date: new Date("2026-11-14T09:00:00").toISOString(),
      endDate: new Date("2026-11-15T17:00:00").toISOString(),
      location: "The Foundry",
      capacity: 240,
      category: "Gala",
      status: "draft",
    });
    expect(plan.checklist).toEqual([
      expect.objectContaining({ title: "Confirm venue", category: "Venue", assignedTo: "Laila", completed: false }),
      expect.objectContaining({ title: "Send final guest count", category: "Catering", assignedTo: "Maya", completed: true }),
    ]);
    expect(plan.runOfShow).toEqual([
      expect.objectContaining({ startTime: "17:30", duration: 45, title: "Guest arrival" }),
      expect.objectContaining({ startTime: "18:15", duration: 15, title: "Welcome" }),
    ]);
    expect(plan.budget).toEqual([
      expect.objectContaining({ name: "Venue rental", type: "expense", estimatedCents: 3_000_000, actualCents: 2_950_000 }),
      expect.objectContaining({ name: "Ticket sales", type: "revenue", estimatedCents: 5_000_000, actualCents: 5_250_000 }),
    ]);
    expect(plan.moodBoard).toEqual([{ url: "https://example.com/look.jpg", caption: "Warm floral direction" }]);
    expect(plan.guests).toEqual([{ name: "Ada Lovelace", contact: "ada@example.com", notes: "VIP" }]);
    expect(plan.warnings).toEqual([]);
  });

  it("accepts only Google Sheets links and keeps the selected tab", () => {
    expect(
      googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/abc_DEF-123/edit#gid=456"),
    ).toBe("https://docs.google.com/spreadsheets/d/abc_DEF-123/export?format=csv&gid=456");
    expect(() => googleSheetCsvUrl("https://example.com/spreadsheets/d/abc/edit")).toThrow(
      "Paste a Google Sheets link",
    );
  });
});
