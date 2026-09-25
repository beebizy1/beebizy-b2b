import { describe, expect, it } from "vitest";
import { buildEventImportPlan, googleSheetCsvUrl, parseCsvTable } from "./import";
import { parseFloorplanDraft } from "./floorplan";
import { rfpDraftSchema } from "./rfp";

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
          "Task,Category,Due Date,Owner,Owner Email,Completed\nConfirm venue,Venue,2026-10-01,Laila,laila@example.com,no\nSend final guest count,Catering,2026-11-07,Maya,maya@example.com,yes",
          "Checklist",
        ),
        parseCsvTable(
          "Day,Start Time,Duration,Title,Responsible,Responsible Email,Notes\nDay 1,5:30 PM,45,Guest arrival,Guest team,guests@example.com,Open both doors\n2,18:15,15,Welcome,Host,host@example.com,",
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
      expect.objectContaining({ title: "Confirm venue", category: "Venue", assignedTo: "Laila", assignedEmail: "laila@example.com", completed: false }),
      expect.objectContaining({ title: "Send final guest count", category: "Catering", assignedTo: "Maya", completed: true }),
    ]);
    expect(plan.checklist.map((item) => item.dueDate)).toEqual([
      "2026-10-01T12:00:00.000Z",
      "2026-11-07T12:00:00.000Z",
    ]);
    expect(plan.runOfShow).toEqual([
      expect.objectContaining({ dayNumber: 1, startTime: "17:30", duration: 45, title: "Guest arrival", assignedEmail: "guests@example.com" }),
      expect.objectContaining({ dayNumber: 2, startTime: "18:15", duration: 15, title: "Welcome" }),
    ]);
    expect(plan.budget).toEqual([
      expect.objectContaining({ name: "Venue rental", type: "expense", estimatedCents: 3_000_000, actualCents: 2_950_000 }),
      expect.objectContaining({ name: "Ticket sales", type: "revenue", estimatedCents: 5_000_000, actualCents: 5_250_000 }),
    ]);
    expect(plan.moodBoard).toEqual([{ url: "https://example.com/look.jpg", caption: "Warm floral direction" }]);
    expect(plan.guests).toEqual([{
      name: "Ada Lovelace",
      contact: "ada@example.com",
      notes: "VIP",
      segment: null,
      organization: null,
    }]);
    expect(plan.warnings).toEqual([]);
  });

  it("imports the structured records used by every event section", () => {
    const plan = buildEventImportPlan([
      parseCsvTable("Event Name,Date\nDemo Day,2026-10-08", "Event"),
      parseCsvTable("Task,Owner Email\nPrepare rain route,ops@example.com", "Contingency"),
      parseCsvTable("Station,Lane,Lead,Devices\nMain entrance,A,Sam,3", "Check-in Stations"),
      parseCsvTable("Role,Start Time,End Time,Required Count\nGreeter,08:00,10:00,4", "Volunteer Needs"),
      parseCsvTable("Menu Item,Course,Dietary Tags,Price\nHarvest bowl,Lunch,vegan;gluten-free,18", "Menu"),
      parseCsvTable("Ticket Type,Price,Quantity\nGeneral admission,25,300", "Tickets"),
      parseCsvTable("Auction Item,Starting Bid,Donor\nWinery tour,500,Acme Winery", "Silent Auction"),
      parseCsvTable("Prize,Ticket Price,Total Tickets\nWeekend stay,10,500", "Raffle"),
      parseCsvTable("Sponsor,Tier,Amount,Contact Email\nAcme Ventures,Gold,10000,sponsor@example.com", "Sponsorships"),
      parseCsvTable([
        "RFP Title,Target Type,Vendor Category,Event Type,Event Date,Start Time,End Time,Headcount,City,Location,Rooms Required,Check In Date,Check Out Date,Food Beverage Spend,Ancillary Spend,Registration Date,Registration Start Time,Registration End Time,Registration Capacity,Breakfast Date,Breakfast Start Time,Breakfast End Time,Breakfast Capacity,Meeting Date,Meeting Start Time,Meeting End Time,Meeting Capacity,Lunch Date,Lunch Start Time,Lunch End Time,Lunch Capacity",
        "Conference hotel,Venue,Venue,Conference with room block,2026-10-08,09:00,17:00,200,Santa Clara,Grand Hotel,100,2026-10-07,2026-10-09,25000,5000,2026-10-08,08:00,09:00,200,2026-10-08,08:00,09:00,200,2026-10-08,09:00,12:00,200,2026-10-08,12:00,13:00,200",
      ].join("\n"), "RFPs"),
      parseCsvTable("Vendor,Amount,Due Date\nConvention Center,5000,2026-09-01", "Deposits"),
      parseCsvTable("Staff Member,Role,Hours\nAlex,Producer,12.5", "Team Hours"),
      parseCsvTable("Type,Message\nSchedule,Doors open at 8 AM", "Live Updates"),
      parseCsvTable("Floorplan Name,Room Width,Room Length,Item,Shape,X,Y,Seats,Locked\nMain ballroom,100,80,Oak tree,tree,20,25,0,yes\nMain ballroom,100,80,Front row,chair-row,50,70,20,no", "Floorplan"),
    ], "demo-day.xlsx");

    expect(plan.checklist).toEqual([expect.objectContaining({ title: "Prepare rain route", category: "Contingency", assignedEmail: "ops@example.com" })]);
    expect(plan.checkInStations).toEqual([expect.objectContaining({ name: "Main entrance", lane: "A", deviceCount: 3 })]);
    expect(plan.volunteerNeeds).toEqual([expect.objectContaining({ role: "Greeter", requiredCount: 4 })]);
    expect(plan.menu).toEqual([expect.objectContaining({ name: "Harvest bowl", priceCents: 1800 })]);
    expect(plan.tickets).toEqual([expect.objectContaining({ name: "General admission", priceCents: 2500, quantityTotal: 300 })]);
    expect(plan.auctions).toEqual([expect.objectContaining({ title: "Winery tour", auctionType: "silent", startingBidCents: 50_000 })]);
    expect(plan.raffle).toEqual([expect.objectContaining({ name: "Weekend stay", ticketPriceCents: 1000, totalTickets: 500 })]);
    expect(plan.sponsorships).toEqual([expect.objectContaining({ companyName: "Acme Ventures", tier: "gold", amountCents: 1_000_000 })]);
    expect(plan.rfps).toEqual([expect.objectContaining({ title: "Conference hotel", targetType: "venue", headcount: 200, roomsRequired: 100 })]);
    expect(plan.deposits).toEqual([expect.objectContaining({ vendorName: "Convention Center", amountCents: 500_000 })]);
    expect(plan.teamHours).toEqual([{ staffMember: "Alex", role: "Producer", hours: 12.5 }]);
    expect(plan.teamUpdates).toEqual([{ kind: "schedule", message: "Doors open at 8 AM", notifyTeam: false }]);
    expect(plan.floorplans).toEqual([expect.objectContaining({
      name: "Main ballroom",
      items: [expect.objectContaining({ label: "Oak tree", shape: "tree", locked: true }), expect.objectContaining({ label: "Front row", shape: "chair-row", seats: 20 })],
      room: expect.objectContaining({ widthFeet: 100, lengthFeet: 80 }),
    })]);
    expect(() => parseFloorplanDraft(plan.floorplans[0])).not.toThrow();
    expect(() => rfpDraftSchema.parse(plan.rfps[0])).not.toThrow();
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

describe("a single unnamed sheet, as Google Sheets always sends", () => {
  // The server names every Google Sheet import "Google Sheet", so name matching can
  // never classify it. Before headers were consulted, all of these imported nothing.
  const asGoogleSheet = (csv: string) => buildEventImportPlan([parseCsvTable(csv, "Google Sheet")], "Google Sheet");

  it("imports a checklist", () => {
    const plan = asGoogleSheet("Task,Owner,Due Date\nBook the venue,Maria,2026-10-01\nConfirm catering,Dana,2026-10-05");
    expect(plan.checklist.map((i) => i.title)).toEqual(["Book the venue", "Confirm catering"]);
    expect(plan.checklist[0]!.assignedTo).toBe("Maria");
  });

  it("imports services, and turns each into a task", () => {
    const plan = asGoogleSheet("Vendor,Category,Fee\nGolden Gate Catering,Catering,28400\nApex AV,AV & Tech,11250");
    expect(plan.vendors.map((v) => v.vendor.name)).toEqual(["Golden Gate Catering", "Apex AV"]);
    expect(plan.checklist.map((i) => i.title)).toEqual(["Confirm Golden Gate Catering", "Confirm Apex AV"]);
  });

  it("imports a guest list", () => {
    const plan = asGoogleSheet("Guest Name,Email\nPriya Raghunathan,priya@example.com");
    expect(plan.guests.map((g) => g.name)).toEqual(["Priya Raghunathan"]);
  });

  it("keeps Santa Clara guest type and organization on a full event import", () => {
    const plan = asGoogleSheet(
      "Guest Name,Email,Guest Type,Company\nPriya Raghunathan,priya@example.com,Investor,Acme Ventures",
    );
    expect(plan.guests[0]).toMatchObject({
      name: "Priya Raghunathan",
      segment: "Investor",
      organization: "Acme Ventures",
    });
  });

  it("imports a run of show", () => {
    const plan = asGoogleSheet("Start Time,Activity,Duration\n18:00,Drinks reception,60");
    expect(plan.runOfShow.map((c) => c.title)).toEqual(["Drinks reception"]);
  });

  it("imports a budget", () => {
    const plan = asGoogleSheet("Line Item,Estimated\nVenue hire,38000");
    expect(plan.budget.map((b) => b.name)).toEqual(["Venue hire"]);
  });

  it("recognises specialized section sheets by headers, not only by tab name", () => {
    expect(asGoogleSheet("Station,Lane,Devices\nMain,A,2").checkInStations).toHaveLength(1);
    expect(asGoogleSheet("Role,Start Time,End Time,Required Count\nGreeter,08:00,10:00,3").volunteerNeeds).toHaveLength(1);
    expect(asGoogleSheet("Menu Item,Course\nHarvest bowl,Lunch").menu).toHaveLength(1);
    expect(asGoogleSheet("Ticket Type,Price,Quantity\nGeneral,25,200").tickets).toHaveLength(1);
    expect(asGoogleSheet("Auction Item,Starting Bid\nDinner,500").auctions).toHaveLength(1);
    expect(asGoogleSheet("Prize,Ticket Price\nTrip,10").raffle).toHaveLength(1);
    expect(asGoogleSheet("Sponsor,Tier\nAcme,Gold").sponsorships).toHaveLength(1);
    expect(asGoogleSheet("RFP Title,Target Type,Event Type,Event Date,Start Time,End Time,Headcount,City,Location\nHotel,Venue,Conference,2026-10-08,09:00,17:00,200,Santa Clara,Convention Center").rfps).toHaveLength(1);
    const depositPlan = asGoogleSheet("Vendor,Deposit Amount\nVenue,5000");
    expect(depositPlan.deposits).toHaveLength(1);
    expect(depositPlan.vendors).toHaveLength(0);
    expect(depositPlan.checklist).toHaveLength(0);
    expect(asGoogleSheet("Staff Member,Role,Hours\nAlex,Producer,8").teamHours).toHaveLength(1);
    expect(asGoogleSheet("Type,Message\nSchedule,Doors open").teamUpdates).toHaveLength(1);
    expect(asGoogleSheet("Item,Shape,X,Y\nOak,tree,20,25").floorplans).toHaveLength(1);
    expect(asGoogleSheet("Contingency Task,Owner\nPrepare rain route,Sam").checklist).toHaveLength(1);
  });

  it("does not invent required RFP details when a row is incomplete", () => {
    const plan = asGoogleSheet("RFP Title,Headcount\nHotel,200");
    expect(plan.rfps).toHaveLength(0);
    expect(plan.warnings.join(" ")).toContain("target type");
    expect(plan.warnings.join(" ")).toContain("event date");

    const zeroHeadcount = asGoogleSheet("RFP Title,Target Type,Event Type,Event Date,Start Time,End Time,Headcount,City,Location\nHotel,Venue,Conference,2026-10-08,09:00,17:00,0,Santa Clara,Convention Center");
    expect(zeroHeadcount.rfps).toHaveLength(0);
    expect(zeroHeadcount.warnings.join(" ")).toContain("headcount");
  });

  it("treats blank decimals as missing instead of zero", () => {
    const floorplan = asGoogleSheet("Item,Shape,X,Y,Room Width,Room Length\nChair,chair,,,,").floorplans[0]!;
    expect(floorplan.items[0]).toMatchObject({ x: 10, y: 10 });
    expect(floorplan.room).toMatchObject({ widthFeet: 60, lengthFeet: 40 });
    expect(asGoogleSheet("Staff Member,Role,Hours\nAlex,Producer,").teamHours).toHaveLength(0);
  });

  it("caps floorplan imports at the persisted schema limit", () => {
    const rows = Array.from({ length: 501 }, (_, index) => `Chair ${index + 1},chair,10,10`);
    const plan = asGoogleSheet(["Item,Shape,X,Y", ...rows].join("\n"));
    expect(plan.floorplans[0]!.items).toHaveLength(500);
    expect(() => parseFloorplanDraft(plan.floorplans[0])).not.toThrow();
    expect(plan.warnings.join(" ")).toContain("first 500 floorplan objects");
  });

  it("keeps generated floorplan positions inside the canvas", () => {
    const rows = Array.from({ length: 50 }, (_, index) => `Chair ${index + 1},chair,,`);
    const plan = asGoogleSheet(["Item,Shape,X,Y", ...rows].join("\n"));
    expect(plan.floorplans[0]!.items).toHaveLength(50);
    expect(plan.floorplans[0]!.items.every((item) => item.x >= 0 && item.x <= 100 && item.y >= 0 && item.y <= 100)).toBe(true);
    expect(() => parseFloorplanDraft(plan.floorplans[0])).not.toThrow();
  });

  it("imports a volunteer schedule for every workspace by default", () => {
    const plan = buildEventImportPlan(
      [parseCsvTable("Volunteer Name,Role,Day,Start Time,End Time,Email\nMaya Chen,East entrance,2,8:00 AM,12:00 PM,maya@example.com", "Google Sheet")],
      "Google Sheet",
    );
    expect(plan.volunteers).toEqual([
      expect.objectContaining({
        name: "Maya Chen",
        role: "East entrance",
        dayNumber: 2,
        startTime: "08:00",
        endTime: "12:00",
        email: "maya@example.com",
      }),
    ]);
  });

  it("maps a volunteer shift date to the event day during a full workbook import", () => {
    const plan = buildEventImportPlan([
      parseCsvTable("Event Name,Date,End Date\nDemo Day,2026-10-07,2026-10-09", "Event"),
      parseCsvTable("Volunteer Name,Role,Shift Date,Start Time,End Time\nMaya Chen,East entrance,2026-10-08,08:00,12:00", "Volunteers"),
    ], "demo-day.xlsx", { includeVolunteers: true });

    expect(plan.volunteers[0]).toMatchObject({ name: "Maya Chen", dayNumber: 2 });
  });

  it("skips malformed volunteer days during a full workbook import", () => {
    const plan = buildEventImportPlan([
      parseCsvTable("Volunteer Name,Role,Day,Start Time,End Time\nMaya Chen,East entrance,2.5,08:00,12:00\nLuis Rivera,Usher,-2,09:00,13:00", "Volunteers"),
    ], "demo-day.xlsx", { includeVolunteers: true });

    expect(plan.volunteers).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("2 volunteer rows were skipped");
  });

  it("can deliberately exclude volunteer tabs for a constrained import flow", () => {
    const plan = buildEventImportPlan(
      [parseCsvTable("Volunteer Name,Role,Start Time,End Time\nMaya Chen,East entrance,08:00,12:00", "Volunteers")],
      "volunteers.xlsx",
      { includeVolunteers: false },
    );
    expect(plan.volunteers).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("Volunteers");
  });

  it("warns when a Santa Clara volunteer row cannot become a shift", () => {
    const plan = buildEventImportPlan(
      [parseCsvTable("Volunteer Name,Role,Start Time,End Time\nMaya Chen,East entrance,,12:00", "Volunteers")],
      "volunteers.xlsx",
      { includeVolunteers: true },
    );
    expect(plan.volunteers).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("1 volunteer row was skipped");
  });

  it("still warns when the columns mean nothing", () => {
    const plan = asGoogleSheet("Song,Artist\nSomething,Someone");
    expect(plan.warnings.join(" ")).toContain("not recognised");
  });

  it("never lets a header guess override an explicitly named tab", () => {
    const plan = buildEventImportPlan(
      [
        parseCsvTable("Task\nThe real checklist", "Checklist"),
        parseCsvTable("Task\nA stray column elsewhere", "Random Notes"),
      ],
      "x.xlsx",
    );
    expect(plan.checklist.map((i) => i.title)).toEqual(["The real checklist"]);
  });
});

describe("a wide sheet that mixes event details with a list", () => {
  /**
   * A real sheet from a customer: event details on row 2, services running down one
   * column with every other cell blank, and a plural SERVICES header. It imported the
   * date and venue and silently dropped all seven services.
   */
  const CSV = [
    "DATE,TIME,LOCATION,SERVICES",
    "5/30/2027,6-9pm,Campbell Hall,Catering",
    ",,,Balloon Artist",
    ",,,Bartenders",
    ",,,Dessert Cart",
    ",,,Magician",
    ",,,DJ",
    ",,,Popcorn cart",
  ].join("\n");

  const plan = () => buildEventImportPlan([parseCsvTable(CSV, "Annual Reunion Event")], "Annual Reunion Event");

  it("reads the event details from the first row", () => {
    expect(plan().event.location).toBe("Campbell Hall");
    expect(plan().event.date.slice(0, 4)).toBe("2027");
  });

  it("imports every service, including the ones on otherwise empty rows", () => {
    expect(plan().vendors.map((v) => v.vendor.name)).toEqual([
      "Catering", "Balloon Artist", "Bartenders", "Dessert Cart", "Magician", "DJ", "Popcorn cart",
    ]);
  });

  it("puts every service on the checklist", () => {
    expect(plan().checklist.map((c) => c.title)).toEqual([
      "Confirm Catering", "Confirm Balloon Artist", "Confirm Bartenders", "Confirm Dessert Cart",
      "Confirm Magician", "Confirm DJ", "Confirm Popcorn cart",
    ]);
  });

  it("lets one sheet be both the event overview and a list", () => {
    // Being claimed as the event table must not stop it also being read as services.
    const result = plan();
    expect(result.event.location).toBe("Campbell Hall");
    expect(result.vendors.length).toBe(7);
  });

  it("matches singular and plural column headings alike", () => {
    for (const header of ["SERVICE", "SERVICES", "Vendors", "Suppliers", "Providers"]) {
      const p = buildEventImportPlan([parseCsvTable(`${header}\nCatering`, "Google Sheet")], "x");
      expect(p.vendors.map((v) => v.vendor.name), header).toEqual(["Catering"]);
    }
  });
});
