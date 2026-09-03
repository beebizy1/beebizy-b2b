import { describe, expect, it, vi } from "vitest";
import { fetchGoogleSheetCsv, sheetNameFrom} from "./imports";

describe("Google Sheets import", () => {
  it("downloads only the selected public sheet as bounded CSV", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("Event Name,Date\nPartner Gala,2026-11-14", {
        status: 200,
        headers: { "content-type": "text/csv", "content-length": "44" },
      }),
    );

    const result = await fetchGoogleSheetCsv(
      "https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=42",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://docs.google.com/spreadsheets/d/sheet_123/export?format=csv&gid=42",
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(result.csv).toContain("Partner Gala");
  });

  it("explains when a Google Sheet is not publicly readable", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    await expect(
      fetchGoogleSheetCsv("https://docs.google.com/spreadsheets/d/private/edit", fetcher),
    ).rejects.toThrow("Anyone with the link");
  });
});

describe("sheetNameFrom", () => {
  it("takes the document title from the download filename", () => {
    expect(sheetNameFrom('attachment; filename="Annual Reunion Event - Sheet1.csv"')).toBe("Annual Reunion Event");
  });

  it("keeps a hyphenated title that is not a tab name", () => {
    expect(sheetNameFrom('attachment; filename="Q3 Gala - Los Angeles.csv"')).toBe("Q3 Gala - Los Angeles");
  });

  it("handles the encoded form", () => {
    expect(sheetNameFrom("attachment; filename*=UTF-8''Annual%20Reunion%20Event%20-%20Sheet1.csv")).toBe(
      "Annual Reunion Event",
    );
  });

  it("falls back when the header is missing or unparseable", () => {
    expect(sheetNameFrom(null)).toBe("Google Sheet");
    expect(sheetNameFrom("attachment")).toBe("Google Sheet");
  });
});
