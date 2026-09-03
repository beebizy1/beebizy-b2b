import { describe, expect, it } from "vitest";
import { GUEST_CSV_TEMPLATE, parseGuestCsv } from "./guestImport";

describe("parseGuestCsv", () => {
  it("reads the template it hands out", () => {
    const { rows, matched } = parseGuestCsv(GUEST_CSV_TEMPLATE);
    expect(matched).toEqual({ name: "name", contact: "email", notes: "notes" });
    expect(rows.filter((r) => r.problem === null)).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 2, name: "Jane Doe", contact: "jane@example.com", notes: "Vegetarian" });
    expect(rows[1]!.notes).toBeNull();
  });

  it("matches headers loosely, whatever the exporter called them", () => {
    const { matched } = parseGuestCsv("Full Name,E-Mail Address,Comments\nA,a@b.co,x\n");
    expect(matched).toEqual({ name: "Full Name", contact: "E-Mail Address", notes: "Comments" });
  });

  it("flags rows rather than dropping them", () => {
    const { rows } = parseGuestCsv(
      ["name,email", "Valid Person,ok@example.com", ",orphan@example.com", "No Email,", "Bad Email,not-an-email"].join(
        "\n",
      ),
    );
    expect(rows.map((r) => r.problem)).toEqual([null, "No name", "No email", "Email doesn't look valid"]);
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
    expect(matched).toEqual({ name: null, contact: null, notes: null });
    expect(rows[0]!.problem).toBe("Empty row");
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseGuestCsv('name,email,notes\n"Doe, Jane",jane@example.com,"Vegan, no nuts"\n');
    expect(rows[0]).toMatchObject({ name: "Doe, Jane", contact: "jane@example.com", notes: "Vegan, no nuts" });
    expect(rows[0]!.problem).toBeNull();
  });
});
