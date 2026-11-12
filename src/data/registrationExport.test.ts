import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import readExcelFile from "read-excel-file/node";
import { buildSeed } from "./memory/seed";
import { registrationExportTable, registrationCsv } from "./registrationExport";

describe("registration downloads", () => {
  const seed = buildSeed();
  const guest = { ...seed.guests[0]!, name: "María Elena de la Cruz-Taylor", contact: "qa@example.invalid" };
  const row = { ...seed.registrations[0]!, guest, status: "confirmed" as const, quantity: 2, checkedInAt: null, importedFields: [{ label: "First Name", value: "María Elena" }, { label: "Last Name", value: "de la Cruz-Taylor" }, { label: "RSVP Response", value: "Pending" }, { label: "Favorite color", value: '=HYPERLINK("https://example.invalid")' }, { label: "Memory", value: 'Line one, with "quotes"\nLine two' }] };
  it("exports actual status, explicit compound names, every answer and registration audit fields", () => {
    const [headers, values] = registrationExportTable([row]);
    const record = Object.fromEntries(headers!.map((header, i) => [header, values![i]]));
    expect(record).toMatchObject({ "First Name": "María Elena", "Last Name": "de la Cruz-Taylor", "Full Name": guest.name, "Email Address": guest.contact, "RSVP Response": "Yes", Attendees: "2", "Favorite color": row.importedFields[3]!.value, Memory: row.importedFields[4]!.value, "Registration ID": row.id, "Checked In At (UTC)": "" });
    expect(new Set(headers).size).toBe(headers!.length);
  });
  it("writes CSV with Unicode, quoted multiline answers and formula protection", () => {
    const csv = registrationCsv([row]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"María Elena"');
    expect(csv).toContain('"Line one, with ""quotes""\nLine two"');
    expect(csv).toContain('"\'=HYPERLINK(');
  });
  it("round-trips a genuine Excel workbook without converting answers into formulas", async () => {
    const table = registrationExportTable([row]);
    const buffer = await writeExcelFile(table).toBuffer();
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const [{ data: recovered }] = await readExcelFile(buffer);
    expect(recovered[0]).toEqual(table[0]);
    expect(recovered[1]!.map(value => value ?? "")).toEqual(table[1]);
  });
  it("exports only supplied filtered rows and supports an empty list", () => {
    expect(registrationExportTable([row])).toHaveLength(2);
    expect(registrationExportTable([])).toHaveLength(1);
  });
});
