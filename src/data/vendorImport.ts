import { parseCsvTable, type SpreadsheetValue } from "./import";

export interface ParsedVendorRow {
  line: number;
  name: string;
  category: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  problem: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const keys = {
  name: ["vendor", "vendor name", "name", "company", "company name", "supplier", "supplier name"],
  category: ["category", "service", "service type", "vendor type", "type"],
  description: ["description", "notes", "note", "services", "comments"],
  contactEmail: ["email", "e-mail", "contact email", "email address"],
  contactPhone: ["phone", "telephone", "contact phone", "phone number"],
  website: ["website", "url", "web site"],
  city: ["city"],
  state: ["state", "province"],
  country: ["country"],
} as const;

const normalise = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const pick = (headers: string[], candidates: readonly string[]) =>
  candidates.map(normalise).map((candidate) => headers.find((header) => normalise(header) === candidate)).find(Boolean) ?? null;
const text = (value: SpreadsheetValue) => value == null ? "" : value instanceof Date ? value.toISOString() : String(value).trim();

export function parseVendorCsv(source: string): { rows: ParsedVendorRow[]; matchedName: string | null } {
  const table = parseCsvTable(source, "Vendors");
  const headers = Object.fromEntries(Object.entries(keys).map(([key, candidates]) => [key, pick(table.headers, candidates)])) as Record<keyof typeof keys, string | null>;
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  const rows = table.rows.map((row, index): ParsedVendorRow => {
    const read = (key: keyof typeof keys) => headers[key] ? text(row[headers[key]!]) : "";
    const name = read("name");
    const contactEmail = read("contactEmail");
    const emailKey = contactEmail.toLowerCase();
    const nameKey = name.toLowerCase();
    let problem: string | null = null;
    if (!name && !contactEmail) problem = "Empty row";
    else if (!name) problem = "No vendor name";
    else if (contactEmail && !EMAIL_RE.test(contactEmail)) problem = "Email doesn't look valid";
    else if (contactEmail && seenEmails.has(emailKey)) problem = "Duplicate email in this file";
    else if (!contactEmail && seenNames.has(nameKey)) problem = "Duplicate vendor in this file";
    if (!problem) {
      if (contactEmail) seenEmails.add(emailKey);
      seenNames.add(nameKey);
    }
    return {
      line: index + 2,
      name,
      category: read("category") || "Other",
      description: read("description") || null,
      contactEmail: contactEmail || null,
      contactPhone: read("contactPhone") || null,
      website: read("website") || null,
      city: read("city") || null,
      state: read("state") || null,
      country: read("country") || null,
      problem,
    };
  });
  return { rows, matchedName: headers.name };
}

export const VENDOR_CSV_TEMPLATE = "vendor name,service type,contact email,phone,website,city,state,country,notes\nAcme AV,Audio Visual,av@example.com,555-0100,https://example.com,Santa Clara,CA,USA,Preferred vendor\n";
