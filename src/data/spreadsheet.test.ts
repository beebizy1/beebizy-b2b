import { describe, expect, it } from "vitest";
import { csvCell, spreadsheetHtmlCell, spreadsheetText } from "./spreadsheet";

describe("spreadsheet exports", () => {
  it.each(["=SUM(A1:A2)", "+cmd", "-10+20", "@IMPORTXML(A1)"])("neutralizes formula-like text: %s", (value) => {
    expect(spreadsheetText(value)).toBe(`'${value}`);
  });

  it("quotes CSV and escapes HTML without losing ordinary text", () => {
    expect(csvCell('Patel, "Family"')).toBe('"Patel, ""Family"""');
    expect(spreadsheetHtmlCell("<b>Family & Friends</b>")).toBe("&lt;b&gt;Family &amp; Friends&lt;/b&gt;");
  });
});
