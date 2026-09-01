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
  return { name: "Google Sheet", csv };
}
