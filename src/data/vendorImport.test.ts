import { describe, expect, it } from "vitest";
import { parseVendorCsv } from "./vendorImport";

describe("parseVendorCsv", () => {
  it("reads common vendor export headings", () => {
    const preview = parseVendorCsv(
      "Company Name,Service Type,Contact Email,Phone,Website,City,State,Notes\nAcme AV,Audio Visual,av@acme.test,555-0100,https://acme.test,Santa Clara,CA,Preferred\n",
    );
    expect(preview.rows[0]).toMatchObject({
      name: "Acme AV",
      category: "Audio Visual",
      contactEmail: "av@acme.test",
      contactPhone: "555-0100",
      website: "https://acme.test",
      city: "Santa Clara",
      state: "CA",
      description: "Preferred",
      problem: null,
    });
  });

  it("flags missing names, invalid emails and duplicates instead of silently dropping rows", () => {
    const preview = parseVendorCsv(
      "vendor,category,email\n,AV,one@example.com\nAcme,AV,not-an-email\nAcme,AV,team@example.com\nAcme duplicate,AV,TEAM@example.com\n",
    );
    expect(preview.rows.map((row) => row.problem)).toEqual([
      "No vendor name",
      "Email doesn't look valid",
      null,
      "Duplicate email in this file",
    ]);
  });
});
