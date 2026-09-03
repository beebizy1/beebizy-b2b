import { googleSheetCsvUrl } from "../data/import.ts";

const MAX_GOOGLE_SHEET_BYTES = 2 * 1024 * 1024;

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_GOOGLE_SHEET_BYTES) throw new Error("This sheet is larger than the 2 MB import limit.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_GOOGLE_SHEET_BYTES) {
      await reader.cancel();
      throw new Error("This sheet is larger than the 2 MB import limit.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

/**
 * The document's own title, which the CSV export sends back as the download filename:
 * `attachment; filename="Annual Reunion Event - Sheet1.csv"`.
 *
 * Worth the parsing because this becomes the imported event's name. Falling back to the
 * literal "Google Sheet" produced events called "Google Sheet" when the spreadsheet was
 * sitting there titled "Annual Reunion Event".
 */
export function sheetNameFrom(contentDisposition: string | null): string {
  if (!contentDisposition) return "Google Sheet";
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = contentDisposition.match(/filename="([^"]+)"/i);
  const raw = encoded?.[1] ? decodeURIComponent(encoded[1]) : plain?.[1];
  if (!raw) return "Google Sheet";

  const withoutExtension = raw.replace(/\.(csv|tsv|xlsx?)$/i, "").trim();
  // Google appends the tab name: "Annual Reunion Event - Sheet1". The document title is
  // the useful half, but only strip a trailing segment that looks like a default tab.
  const withoutTab = withoutExtension.replace(/\s*-\s*(sheet\s*\d*|tab\s*\d*)$/i, "").trim();
  return withoutTab || withoutExtension || "Google Sheet";
}

export async function fetchGoogleSheetCsv(
  sourceUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<{ name: string; csv: string }> {
  const exportUrl = googleSheetCsvUrl(sourceUrl);
  const response = await fetcher(exportUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "text/csv,text/plain;q=0.9" },
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok || contentType.includes("text/html")) {
    throw new Error('Set Google Sheets sharing to "Anyone with the link can view," then try again.');
  }
  const csv = await boundedText(response);
  if (!csv.trim() || !csv.includes(",")) throw new Error("The selected Google Sheets tab does not contain tabular data.");
  return { name: sheetNameFrom(response.headers.get("content-disposition")), csv };
}
