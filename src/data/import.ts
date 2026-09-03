import type {
  BudgetItemDraft,
  ChecklistItemDraft,
  EventDraft,
  GuestDraft,
  RunOfShowItemDraft,
  VendorDraft,
} from "./entities";

export type SpreadsheetValue = string | number | boolean | Date | null;

export interface SpreadsheetTable {
  name: string;
  headers: string[];
  rows: Record<string, SpreadsheetValue>[];
}

export interface ImportedMoodReference {
  url: string;
  caption: string | null;
}

export interface EventImportPlan {
  sourceName: string;
  event: EventDraft;
  checklist: ChecklistItemDraft[];
  runOfShow: RunOfShowItemDraft[];
  budget: BudgetItemDraft[];
  moodBoard: ImportedMoodReference[];
  guests: GuestDraft[];
  /** Suppliers from a Services or Vendors sheet, with the fee agreed for this event. */
  vendors: ImportedVendor[];
  warnings: string[];
}

export interface ImportedVendor {
  vendor: VendorDraft;
  /** What this event is paying them, when the sheet said. */
  feeCents: number | null;
  /** What they are providing for this event. */
  notes: string | null;
}

const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

export function googleSheetCsvUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a Google Sheets link.");
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !match) {
    throw new Error("Paste a Google Sheets link.");
  }
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") ?? hashParameters.get("gid") ?? "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

const aliases = {
  eventTitle: ["event name", "event title", "name", "title"],
  date: ["date", "event date", "start date", "starts at", "start"],
  endDate: ["end date", "ends at", "end"],
  location: ["location", "venue", "event location", "address"],
  capacity: ["capacity", "headcount", "guest count", "attendees", "attendance"],
  category: ["category", "event type", "type"],
  description: ["description", "event description", "brief", "notes"],
  task: ["task", "checklist item", "action", "to do", "todo", "title"],
  dueDate: ["due date", "deadline", "due"],
  owner: ["owner", "assigned to", "assignee", "responsible"],
  completed: ["completed", "done", "status"],
  startTime: ["start time", "time", "cue time"],
  duration: ["duration", "duration minutes", "minutes", "mins"],
  cueTitle: ["cue", "cue title", "agenda item", "activity", "title"],
  responsible: ["responsible", "owner", "lead"],
  item: ["item", "budget item", "line item", "name", "title"],
  estimated: ["estimated", "estimate", "planned", "budget", "amount"],
  actual: ["actual", "spent", "received"],
  imageUrl: ["image url", "url", "image", "reference"],
  caption: ["caption", "description", "notes", "direction"],
  guestName: ["guest name", "attendee name", "name"],
  email: ["email", "email address", "contact", "guest email"],
  vendorName: ["vendor", "vendor name", "supplier", "supplier name", "service", "service provider", "company", "name"],
  // Not "service": a sheet that titles its name column "Service" would have its vendor
  // name read back as the category, because header matching walks the sheet's own column
  // order rather than this list.
  vendorCategory: ["category", "service type", "vendor type", "type", "discipline"],
  vendorPhone: ["phone", "telephone", "phone number", "contact number", "mobile"],
  vendorFee: ["fee", "agreed fee", "cost", "price", "amount", "quote", "total"],
  vendorNotes: ["notes", "scope", "providing", "details", "description", "what they're providing"],
} as const;

const normalize = (value: string): string => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

function matchingHeader(table: SpreadsheetTable, names: readonly string[]): string | null {
  const wanted = new Set(names.map(normalize));
  return table.headers.find((header) => wanted.has(normalize(header))) ?? null;
}

function valueFrom(row: Record<string, SpreadsheetValue>, table: SpreadsheetTable, names: readonly string[]): SpreadsheetValue {
  const header = matchingHeader(table, names);
  return header ? row[header] ?? null : null;
}

function stringFrom(row: Record<string, SpreadsheetValue>, table: SpreadsheetTable, names: readonly string[]): string {
  const value = valueFrom(row, table, names);
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? "" : String(value).trim();
}

function tableNamed(tables: SpreadsheetTable[], patterns: RegExp[], required?: readonly string[]): SpreadsheetTable | null {
  return (
    tables.find((table) => patterns.some((pattern) => pattern.test(normalize(table.name)))) ??
    (required ? tables.find((table) => required.every((name) => matchingHeader(table, [name]))) : undefined) ??
    null
  );
}

function dateTime(value: SpreadsheetValue, defaultHour: number): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T${String(defaultHour).padStart(2, "0")}:00:00`).toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function integer(value: SpreadsheetValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyCents(value: SpreadsheetValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  if (!text) return null;
  const parsed = Number(text.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function truthy(value: SpreadsheetValue): boolean {
  if (typeof value === "boolean") return value;
  return ["yes", "true", "done", "complete", "completed", "1"].includes(normalize(String(value ?? "")));
}

function clockTime(value: SpreadsheetValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sourceTitle(sourceName: string): string {
  return sourceName.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[_-]+/g, " ").trim() || "Imported event";
}

export function buildEventImportPlan(tables: SpreadsheetTable[], sourceName: string): EventImportPlan {
  const warnings: string[] = [];
  const eventTable = tableNamed(tables, [/^event(s| details| overview)?$/, /^overview$/], ["date"]);
  const eventRow = eventTable?.rows[0] ?? {};
  const startsAt = eventTable ? dateTime(valueFrom(eventRow, eventTable, aliases.date), 9) : null;
  const endsAt = eventTable ? dateTime(valueFrom(eventRow, eventTable, aliases.endDate), 17) : null;
  if (!eventTable) warnings.push("No event overview sheet was detected. Review the event details before creating it.");
  if (!startsAt) warnings.push("No valid event date was detected. A date 30 days from now was used.");
  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() + 30);
  fallbackDate.setHours(9, 0, 0, 0);

  const title = eventTable ? stringFrom(eventRow, eventTable, aliases.eventTitle) : "";
  const capacity = eventTable ? integer(valueFrom(eventRow, eventTable, aliases.capacity)) : null;
  const event: EventDraft = {
    title: title || sourceTitle(sourceName),
    description: eventTable ? stringFrom(eventRow, eventTable, aliases.description) || null : null,
    date: startsAt ?? fallbackDate.toISOString(),
    endDate: endsAt,
    location: eventTable ? stringFrom(eventRow, eventTable, aliases.location) || null : null,
    capacity: capacity === null ? null : Math.max(0, capacity),
    status: "draft",
    category: (eventTable ? stringFrom(eventRow, eventTable, aliases.category) : "") || "Other",
  };

  const checklistTable = tableNamed(tables, [/check\s*list/, /tasks?/, /to dos?/]);
  const checklist = (checklistTable?.rows ?? []).flatMap((row, index): ChecklistItemDraft[] => {
    const itemTitle = stringFrom(row, checklistTable!, aliases.task);
    if (!itemTitle) return [];
    return [{
      title: itemTitle,
      description: stringFrom(row, checklistTable!, aliases.description) || null,
      category: stringFrom(row, checklistTable!, aliases.category) || "General",
      dueDate: dateTime(valueFrom(row, checklistTable!, aliases.dueDate), 17),
      assignedTo: stringFrom(row, checklistTable!, aliases.owner) || null,
      completed: truthy(valueFrom(row, checklistTable!, aliases.completed)),
      sortOrder: index,
    }];
  });

  const runTable = tableNamed(tables, [/run of show/, /schedule/, /agenda/, /timeline/]);
  const runOfShow = (runTable?.rows ?? []).flatMap((row, index): RunOfShowItemDraft[] => {
    const cueTitle = stringFrom(row, runTable!, aliases.cueTitle);
    const startTime = clockTime(valueFrom(row, runTable!, aliases.startTime));
    if (!cueTitle || !startTime) return [];
    return [{
      startTime,
      duration: integer(valueFrom(row, runTable!, aliases.duration)),
      title: cueTitle,
      description: stringFrom(row, runTable!, aliases.description) || null,
      responsible: stringFrom(row, runTable!, aliases.responsible) || null,
      sortOrder: index,
    }];
  });

  const budgetTable = tableNamed(tables, [/budget/, /expenses?/, /financials?/]);
  const budget = (budgetTable?.rows ?? []).flatMap((row, index): BudgetItemDraft[] => {
    const name = stringFrom(row, budgetTable!, aliases.item);
    const estimatedCents = moneyCents(valueFrom(row, budgetTable!, aliases.estimated));
    if (!name || estimatedCents === null) return [];
    const typeValue = normalize(stringFrom(row, budgetTable!, aliases.category).includes("revenue")
      ? "revenue"
      : stringFrom(row, budgetTable!, ["type"]));
    return [{
      name,
      category: stringFrom(row, budgetTable!, aliases.category) || "General",
      type: typeValue === "revenue" || typeValue === "income" ? "revenue" : "expense",
      estimatedCents,
      actualCents: moneyCents(valueFrom(row, budgetTable!, aliases.actual)),
      notes: stringFrom(row, budgetTable!, aliases.description) || null,
      sortOrder: index,
    }];
  });

  const moodTable = tableNamed(tables, [/mood/, /inspiration/, /references?/]);
  const moodBoard = (moodTable?.rows ?? []).flatMap((row): ImportedMoodReference[] => {
    const url = stringFrom(row, moodTable!, aliases.imageUrl);
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ url, caption: stringFrom(row, moodTable!, aliases.caption) || null }];
  });

  const guestTable = tableNamed(tables, [/guests?/, /attendees?/, /invitees?/]);
  const guests = (guestTable?.rows ?? []).flatMap((row): GuestDraft[] => {
    const name = stringFrom(row, guestTable!, aliases.guestName);
    const contact = stringFrom(row, guestTable!, aliases.email);
    if (!name || !contact) return [];
    return [{ name, contact, notes: stringFrom(row, guestTable!, aliases.description) || null }];
  });

  /* ------------------------------------------------------------------ vendors */

  const vendorTable = tableNamed(tables, [/services?/, /vendors?/, /suppliers?/, /providers?/]);
  const vendors = (vendorTable?.rows ?? []).flatMap((row): ImportedVendor[] => {
    const name = stringFrom(row, vendorTable!, aliases.vendorName);
    if (!name) return [];
    return [
      {
        vendor: {
          name,
          category: stringFrom(row, vendorTable!, aliases.vendorCategory) || "Other",
          contactEmail: stringFrom(row, vendorTable!, aliases.email) || null,
          contactPhone: stringFrom(row, vendorTable!, aliases.vendorPhone) || null,
        },
        feeCents: moneyCents(valueFrom(row, vendorTable!, aliases.vendorFee)),
        notes: stringFrom(row, vendorTable!, aliases.vendorNotes) || null,
      },
    ];
  });

  /*
   * Any sheet that produced nothing is named back to the reader. A tab that is silently
   * ignored is worse than one that fails: the import looks like it worked and the gap is
   * only found later, by someone who assumed the data was there.
   */
  const consumed = new Set(
    [eventTable, checklistTable, runTable, budgetTable, moodTable, guestTable, vendorTable]
      .filter(Boolean)
      .map((table) => table!.name),
  );
  const ignored = tables.filter((table) => !consumed.has(table.name) && table.rows.length > 0);
  if (ignored.length > 0) {
    warnings.push(
      `${ignored.length === 1 ? "This sheet was" : "These sheets were"} not recognised and nothing was imported from ${ignored.length === 1 ? "it" : "them"}: ${ignored.map((table) => table.name).join(", ")}.`,
    );
  }

  return { sourceName, event, checklist, runOfShow, budget, moodBoard, guests, vendors, warnings };
}

/** RFC 4180-style CSV parser used for uploads and Google Sheets CSV exports. */
export function parseCsvTable(source: string, name = "Sheet 1"): SpreadsheetTable {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) matrix.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) matrix.push(row);

  const [headerRow = [], ...body] = matrix;
  const headers = headerRow.map((header, index) => header.trim() || `Column ${index + 1}`);
  return {
    name,
    headers,
    rows: body.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
    ),
  };
}

function spreadsheetValue(value: unknown): SpreadsheetValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function tableFromMatrix(name: string, matrix: readonly (readonly unknown[])[]): SpreadsheetTable {
  const normalized = matrix.map((row) => row.map(spreadsheetValue));
  const nonEmpty = normalized.filter((row) => row.some((value) => value !== null && String(value).trim() !== ""));
  const [headerRow = [], ...body] = nonEmpty;
  const used = new Map<string, number>();
  const headers = headerRow.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
  return {
    name,
    headers,
    rows: body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null]))),
  };
}

export async function readSpreadsheetFile(file: File): Promise<SpreadsheetTable[]> {
  if (file.size > MAX_SPREADSHEET_BYTES) throw new Error("Choose a spreadsheet smaller than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") return [parseCsvTable(await file.text(), sourceTitle(file.name))];
  if (extension !== "xlsx") throw new Error("Use an .xlsx or .csv file.");

  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const tables = sheets.map(({ sheet, data }) => tableFromMatrix(sheet, data));
  if (tables.every((table) => table.rows.length === 0)) throw new Error("The spreadsheet does not contain any data rows.");
  return tables;
}
