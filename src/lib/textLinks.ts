export interface TextLinkPart { text: string; href?: string }

/** Linkify plain text only. User HTML is never interpreted. */
export function textLinks(text: string): TextLinkPart[] {
  const result: TextLinkPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi)) {
    const start = match.index;
    let candidate = match[0].replace(/[.,!?;:]+$/, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
    }
    let href: string;
    try {
      const url = new URL(/^www\./i.test(candidate) ? `https://${candidate}` : candidate);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      href = url.toString();
    } catch { continue; }
    if (start > offset) result.push({ text: text.slice(offset, start) });
    result.push({ text: candidate, href });
    offset = start + candidate.length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset) });
  return result.length ? result : [{ text }];
}
function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function linkedTextHtml(text: string): string {
  return textLinks(text).map(part => part.href
    ? `<a href="${escape(part.href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;overflow-wrap:anywhere;">${escape(part.text)}</a>`
    : escape(part.text)).join("").replace(/\r?\n/g, "<br />");
}
