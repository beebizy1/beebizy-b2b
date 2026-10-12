/** Prevents spreadsheet programs from evaluating user-controlled cells as formulas. */
export function spreadsheetText(value: unknown): string {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  return `"${spreadsheetText(value).replaceAll('"', '""')}"`;
}

export function spreadsheetHtmlCell(value: unknown): string {
  return spreadsheetText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
