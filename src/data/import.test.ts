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

describe("services and vendors import", () => {
  it("reads a Services sheet into vendors with their fee", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Event Name,Date\nSpring Gala,2026-11-16", "Event"),
        parseCsvTable(
          [
            "Service,Category,Email,Phone,Fee,Notes",
            "Golden Gate Catering,Catering,events@ggc.example,+1 415 555 0121,28400,Plated dinner for 300",
            "Apex AV,AV & Tech,bookings@apex.example,,11250,Stage and lighting",
          ].join("\n"),
          "Services",
        ),
      ],
      "Spring Gala.xlsx",
    );

    expect(plan.vendors).toHaveLength(2);
    expect(plan.vendors[0]).toMatchObject({
      vendor: { name: "Golden Gate Catering", category: "Catering", contactEmail: "events@ggc.example" },
      feeCents: 2_840_000,
      notes: "Plated dinner for 300",
    });
    expect(plan.vendors[1]!.vendor.contactPhone).toBeNull();
  });

  it("also recognises the sheet when it is called Vendors or Suppliers", () => {
    for (const name of ["Vendors", "Suppliers", "Service Providers"]) {
      const plan = buildEventImportPlan(
        [parseCsvTable("Vendor,Category\nBloom & Vine,Decor", name)],
        "x.xlsx",
      );
      expect(plan.vendors.map((v) => v.vendor.name), name).toEqual(["Bloom & Vine"]);
    }
  });

  it("skips rows with no vendor name rather than importing a blank supplier", () => {
    const plan = buildEventImportPlan(
      [parseCsvTable("Vendor,Fee\nReal Vendor,100\n,250", "Vendors")],
      "x.xlsx",
    );
    expect(plan.vendors).toHaveLength(1);
  });

  it("names any sheet it could not read, so nothing is dropped silently", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Event Name\nSpring Gala", "Event"),
        parseCsvTable("Song,Artist\nSomething,Someone", "Playlist"),
      ],
      "x.xlsx",
    );
    expect(plan.warnings.join(" ")).toContain("Playlist");
  });

  it("says nothing when every sheet was understood", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Event Name\nSpring Gala", "Event"),
        parseCsvTable("Vendor,Fee\nBloom & Vine,100", "Vendors"),
      ],
      "x.xlsx",
    );
    expect(plan.warnings.join(" ")).not.toContain("not recognised");
  });
});

describe("services become checklist tasks", () => {
  const sheet = (rows: string, name = "Services") => parseCsvTable(rows, name);

  it("adds a task for each imported service, in the right category", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Event Name\nSpring Gala", "Event"),
        sheet(
          [
            "Vendor,Category,Notes",
            "Golden Gate Catering,Catering,Plated dinner for 300",
            "Apex AV,AV & Tech,Stage and lighting",
            "City Coaches,Transport,",
          ].join("\n"),
        ),
      ],
      "x.xlsx",
    );

    expect(plan.checklist.map((item) => [item.title, item.category])).toEqual([
      ["Confirm Golden Gate Catering", "Catering"],
      ["Confirm Apex AV", "AV/Tech"],
      ["Confirm City Coaches", "Logistics"],
    ]);
    // What they're providing carries onto the task, so the chaser knows what for.
    expect(plan.checklist[0]!.description).toBe("Plated dinner for 300");
  });

  it("falls back to General for a category the checklist has no home for", () => {
    const plan = buildEventImportPlan(
      [sheet("Vendor,Category\nBloom & Vine,Decor")],
      "x.xlsx",
    );
    expect(plan.checklist[0]!.category).toBe("General");
  });

  it("does not duplicate a task the checklist sheet already covers", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Task,Category\nChase Golden Gate Catering for the contract,Catering", "Checklist"),
        sheet("Vendor,Category\nGolden Gate Catering,Catering\nApex AV,AV & Tech"),
      ],
      "x.xlsx",
    );
    const titles = plan.checklist.map((item) => item.title);
    expect(titles).toEqual(["Chase Golden Gate Catering for the contract", "Confirm Apex AV"]);
  });

  it("keeps sheet tasks first and appends the service ones", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Task\nBook the band", "Checklist"),
        sheet("Vendor,Category\nApex AV,AV & Tech"),
      ],
      "x.xlsx",
    );
    expect(plan.checklist.map((i) => i.title)).toEqual(["Book the band", "Confirm Apex AV"]);
    expect(plan.checklist.map((i) => i.sortOrder)).toEqual([0, 1]);
  });
});
