import { describe, expect, it } from "vitest";
import { GUEST_CSV_TEMPLATE, parseGuestCsv, parseGuestSpreadsheetTables } from "./guestImport";
import { tableFromMatrix } from "./import";

describe("parseGuestCsv", () => {
  it("reads the template it hands out", () => {
    const { rows, matched } = parseGuestCsv(GUEST_CSV_TEMPLATE);
    expect(matched).toEqual({ name: "name", contact: "email", attendance: null, notes: "notes", organization: "company", segment: "guest type", partySize: null });
    expect(rows.filter((r) => r.problem === null)).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      line: 2,
      name: "Jane Doe",
      contact: "jane@example.com",
      notes: "Vegetarian",
      organization: "Acme Ventures",
      segment: "Investor",
    });
    expect(rows[1]!.notes).toBeNull();
  });

  it("matches headers loosely, whatever the exporter called them", () => {
    const { matched } = parseGuestCsv("Full Name,E-Mail Address,Comments\nA,a@b.co,x\n");
    expect(matched).toEqual({ name: "Full Name", contact: "E-Mail Address", attendance: null, notes: "Comments", organization: null, segment: null, partySize: null });
  });

  it("reads common HubSpot first-name, last-name, company and lifecycle columns", () => {
    const { rows, matched } = parseGuestCsv(
      "First Name,Last Name,Email,Company Name,Lifecycle Stage\nAda,Lovelace,ada@example.com,Analytical Engines,Customer\n",
    );
    expect(matched).toEqual({
      name: "First Name + Last Name",
      contact: "Email",
      attendance: null,
      notes: null,
      organization: "Company Name",
      segment: "Lifecycle Stage",
      partySize: null,
    });
    expect(rows[0]).toMatchObject({
      name: "Ada Lovelace",
      contact: "ada@example.com",
      organization: "Analytical Engines",
      segment: "Customer",
      problem: null,
    });
  });

  it("flags rows rather than dropping them", () => {
    const { rows } = parseGuestCsv(
      ["name,email", "Valid Person,ok@example.com", ",orphan@example.com", "No Email,", "Bad Email,not-an-email"].join(
        "\n",
      ),
    );
    expect(rows.map((r) => r.problem)).toEqual([null, "No name", null, "Email doesn't look valid"]);
    // Every row survives, so a count in the UI can't quietly shrink.
    expect(rows).toHaveLength(4);
  });

  it("catches duplicate emails within one file, keeping the first", () => {
    const { rows } = parseGuestCsv(
      ["name,email", "First,dup@example.com", "Second,DUP@example.com"].join("\n"),
    );
    expect(rows[0]!.problem).toBeNull();
    expect(rows[1]!.problem).toBe("Duplicate email in this file");
  });

  it("reports 1-based spreadsheet line numbers, not array indexes", () => {
    const { rows } = parseGuestCsv("name,email\nA,a@b.co\nB,b@b.co\n");
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("survives a file with no recognisable columns", () => {
    const { rows, matched } = parseGuestCsv("colour,size\nred,large\n");
    expect(matched).toEqual({ name: null, contact: null, attendance: null, notes: null, organization: null, segment: null, partySize: null });
    expect(rows[0]!.problem).toBe("Empty row");
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseGuestCsv('name,email,notes\n"Doe, Jane",jane@example.com,"Vegan, no nuts"\n');
    expect(rows[0]).toMatchObject({ name: "Doe, Jane", contact: "jane@example.com", notes: "Vegan, no nuts" });
    expect(rows[0]!.problem).toBeNull();
  });

  it("understands the Mrs Bench sheet without mistaking Contact names for emails", () => {
    const source = [
      "Contact,YES/NO,Private Trade Video?,Attendees",
      "Alex Rivera,,,2",
      "Jordan Lee,,,0",
    ].join("\n");

    const { rows, matched } = parseGuestCsv(source);

    expect(matched).toMatchObject({ name: "Contact", contact: null, attendance: "YES/NO", partySize: "Attendees" });
    expect(rows[0]).toMatchObject({
      name: "Alex Rivera",
      contact: null,
      partySize: 2,
      problem: null,
    });
    expect(rows[1]).toMatchObject({
      name: "Jordan Lee",
      contact: null,
      partySize: 0,
      problem: "Attendee count must be between 1 and 10,000",
    });
  });

  it("reads an Excel guest sheet with Contact names and attendee totals", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("Notes", [["Description"], ["Planning notes only"]]),
      tableFromMatrix("RSVP list", [
        ["Contact", "YES/NO", "Private Trade Video?", "Attendees"],
        ["Rivera Family", null, null, 3],
        ["Lee Family", null, null, 2],
        ["Morgan Family", null, null, null],
      ]),
    ]);

    expect(preview.matched).toMatchObject({ name: "Contact", contact: null, attendance: "YES/NO", partySize: "Attendees" });
    expect(preview.rows.filter((row) => row.problem === null)).toHaveLength(3);
    expect(preview.rows.reduce((total, row) => total + row.partySize, 0)).toBe(6);
  });

  it("regression: rejects an empty workbook instead of rendering an unusable preview", () => {
    expect(() => parseGuestSpreadsheetTables([])).toThrow("The workbook does not contain any worksheets.");
  });

  it("prefers a worksheet with a recognized name column when valid-row counts tie", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("Email only", [["Email"], ["guest@example.com"]]),
      tableFromMatrix("Named but invalid", [["Name", "Attendees"], ["Guest One", 0]]),
    ]);

    expect(preview.matched.name).toBe("Name");
    expect(preview.rows[0]).toMatchObject({
      name: "Guest One",
      problem: "Attendee count must be between 1 and 10,000",
    });
  });

  it("uses worksheet row count as the final selection tie-breaker", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("Longer", [["Name", "Attendees"], ["Guest One", 1], [null, 0], [null, 0]]),
      tableFromMatrix("Shorter", [["Name", "Attendees"], ["Guest Two", 1]]),
    ]);

    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({ name: "Guest One", problem: null });
  });

  it("prefers a clearly named RSVP worksheet over a larger unrelated worksheet", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("Vendors", [["Name"], ["Vendor One"], ["Vendor Two"], ["Vendor Three"]]),
      tableFromMatrix("RSVP list", [["Contact", "Attendees"], ["Guest One", 2]]),
    ]);

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ name: "Guest One", partySize: 2, problem: null });
  });

  it("recognizes plural guest-list worksheet names without preferring an empty tab", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("Guests", [["Name"]]),
      tableFromMatrix("Attendees", [["Contact", "Attendees"], ["Guest One", 2]]),
    ]);

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ name: "Guest One", partySize: 2, problem: null });
  });

  it("skips guests who explicitly declined while keeping blank responses importable", () => {
    const { rows, matched } = parseGuestCsv([
      "Contact,YES/NO,Attendees",
      "Guest One,No,2",
      "Guest Two,,1",
    ].join("\n"));

    expect(matched.attendance).toBe("YES/NO");
    expect(rows.map((row) => row.problem)).toEqual(["Not attending", null]);
  });

  it("skips Excel boolean false RSVP values", () => {
    const preview = parseGuestSpreadsheetTables([
      tableFromMatrix("RSVP list", [
        ["Contact", "YES/NO", "Attendees"],
        ["Guest One", false, 2],
        ["Guest Two", true, 1],
      ]),
    ]);

    expect(preview.rows.map((row) => row.problem)).toEqual(["Not attending", null]);
  });

  it("lets an organizer correct unfamiliar columns before importing", () => {
    const source = "Who is coming?,Best way to reach them,Seats\nAda Lovelace,ada@example.com,3\n";
    const { rows, matched } = parseGuestCsv(source, {
      name: "Who is coming?",
      contact: "Best way to reach them",
      partySize: "Seats",
    });

    expect(matched).toMatchObject({
      name: "Who is coming?",
      contact: "Best way to reach them",
      partySize: "Seats",
    });
    expect(rows[0]).toMatchObject({
      name: "Ada Lovelace",
      contact: "ada@example.com",
      partySize: 3,
      problem: null,
    });
  });

  it("suggests an unfamiliar name column and respects an RSVP response column", () => {
    const source = "Who is coming?,Response\nAda Lovelace,Yes\nGrace Hopper,No\n";
    const { rows, matched } = parseGuestCsv(source);

    expect(matched.name).toBe("Who is coming?");
    expect(rows.map((row) => row.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(rows.map((row) => row.problem)).toEqual([null, "Not attending"]);
  });

  it("rejects attendee counts that cannot be stored safely", () => {
    const { rows } = parseGuestCsv("Name,Attendees\nLarge group,10001\n");
    expect(rows[0]!.problem).toBe("Attendee count must be between 1 and 10,000");
  });
});
