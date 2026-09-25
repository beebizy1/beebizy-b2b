import type {
  AuctionItemDraft,
  BudgetItemDraft,
  CheckInStationDraft,
  ChecklistItemDraft,
  DepositDraft,
  EventDraft,
  FloorplanDraft,
  GuestDraft,
  MenuItemDraft,
  RaffleItemDraft,
  RfpDraft,
  RunOfShowItemDraft,
  SponsorshipDraft,
  TeamHoursDraft,
  TeamUpdateDraft,
  TicketTypeDraft,
  VendorDraft,
  VolunteerNeedDraft,
  VolunteerShiftDraft,
  VolunteerStatus,
} from "./entities.ts";
import { RFP_EVENT_TYPES } from "./entities.ts";
import { parseFloorplanDraft } from "./floorplan.ts";
import { rfpDraftSchema } from "./rfp.ts";

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
  guests: ImportedGuest[];
  /** Suppliers from a Services or Vendors sheet, with the fee agreed for this event. */
  vendors: ImportedVendor[];
  /** Volunteer staffing roster imported for every workspace unless a constrained flow opts out. */
  volunteers: VolunteerShiftDraft[];
  volunteerNeeds: VolunteerNeedDraft[];
  checkInStations: CheckInStationDraft[];
  menu: MenuItemDraft[];
  tickets: TicketTypeDraft[];
  auctions: AuctionItemDraft[];
  raffle: RaffleItemDraft[];
  sponsorships: SponsorshipDraft[];
  rfps: RfpDraft[];
  deposits: DepositDraft[];
  teamHours: TeamHoursDraft[];
  teamUpdates: TeamUpdateDraft[];
  floorplans: FloorplanDraft[];
  warnings: string[];
}

export interface EventImportOptions {
  includeVolunteers?: boolean;
}

export interface ImportedGuest extends GuestDraft {
  /** Event-specific grouping, such as Investor, Company or General. */
  segment: string | null;
  /** The fund, business or school this guest represents. */
  organization: string | null;
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
  task: ["task", "tasks", "checklist item", "checklist items", "contingency task", "action", "actions", "to do", "to dos", "todo", "title"],
  dueDate: ["due date", "deadline", "due"],
  owner: ["owner", "assigned to", "assignee", "responsible"],
  completed: ["completed", "done", "status"],
  dayNumber: ["day", "event day", "conference day", "day number"],
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
  assigneeEmail: ["assignee email", "assigned email", "owner email", "responsible email", "lead email", "email", "email address"],
  guestSegment: ["guest type", "registration type", "segment", "group", "category", "lifecycle stage"],
  guestOrganization: ["organization", "organisation", "company", "firm", "school", "fund"],
  // Plurals matter: a column headed SERVICES is at least as common as SERVICE, and
  // matching is exact after normalising, so both spellings have to be listed.
  vendorName: [
    "vendor", "vendors", "vendor name",
    "supplier", "suppliers", "supplier name",
    "service", "services", "service provider", "service providers",
    "provider", "providers",
    "company", "name",
  ],
  // Not "service": a sheet that titles its name column "Service" would have its vendor
  // name read back as the category, because header matching walks the sheet's own column
  // order rather than this list.
  vendorCategory: ["category", "service type", "vendor type", "type", "discipline"],
  vendorPhone: ["phone", "telephone", "phone number", "contact number", "mobile"],
  vendorFee: ["fee", "agreed fee", "cost", "price", "amount", "quote", "total"],
  vendorNotes: ["notes", "scope", "providing", "details", "description", "what they're providing"],
  volunteerName: ["volunteer", "volunteer name", "name", "full name"],
  volunteerRole: ["role", "assignment", "position", "job", "station", "entrance"],
  volunteerDate: ["shift date", "volunteer date", "date"],
  volunteerStart: ["start", "start time", "shift start", "starts"],
  volunteerEnd: ["end", "end time", "shift end", "ends"],
  volunteerStatus: ["status", "confirmation status"],
  volunteerPhone: ["phone", "telephone", "mobile", "phone number"],
} as const;

/**
 * Vendor categories and checklist categories are different vocabularies, so a booked
 * supplier lands in the part of the checklist someone would look for it in. Anything
 * unmapped falls to General rather than inventing a category the picker doesn't offer.
 */
const VENDOR_TO_CHECKLIST_CATEGORY: Record<string, string> = {
  Venue: "Venue",
  Catering: "Catering",
  "AV & Tech": "AV/Tech",
  Staffing: "Staffing",
  Transport: "Logistics",
  Print: "Marketing",
};

function checklistCategoryForVendor(category: string): string {
  return VENDOR_TO_CHECKLIST_CATEGORY[category] ?? "General";
}

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

function emailFrom(row: Record<string, SpreadsheetValue>, table: SpreadsheetTable, names: readonly string[]): string | null {
  const email = stringFrom(row, table, names).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function tableNamed(tables: SpreadsheetTable[], patterns: RegExp[], required?: readonly string[]): SpreadsheetTable | null {
  return (
    tables.find((table) => patterns.some((pattern) => pattern.test(normalize(table.name)))) ??
    (required ? tables.find((table) => required.every((name) => matchingHeader(table, [name]))) : undefined) ??
    null
  );
}

/**
 * What a sheet is, judged by its columns rather than its name.
 *
 * A Google Sheets import is always a single tab the server names "Google Sheet", so
 * name matching alone can never classify it — a perfectly good checklist imported as
 * nothing. Headers are the only signal left, so each role declares the columns that
 * only it would have. "Name" and "Notes" are deliberately absent: they appear on
 * every kind of sheet and would match all of them.
 */
const ROLE_SIGNATURES = {
  checklist: ["task", "tasks", "checklist item", "checklist items", "to do", "to dos", "todo", "todos", "action", "actions"],
  runOfShow: ["start time", "cue", "cue time", "agenda item", "activity"],
  vendors: [
    "vendor", "vendors", "vendor name",
    "supplier", "suppliers", "supplier name",
    "service", "services", "service provider", "service providers",
    "provider", "providers",
  ],
  budget: ["budget item", "line item", "estimated", "estimate", "actual", "spent"],
  guests: ["guest name", "guest names", "guests", "attendee name", "attendees", "rsvp", "guest email"],
  volunteers: ["volunteer", "volunteer name", "shift start", "shift end", "assignment", "position", "role"],
  moodBoard: ["image url", "reference", "image"],
} as const;

type TableRole = keyof typeof ROLE_SIGNATURES;

const ALL_NAME_PATTERNS: RegExp[] = [
  /^event(s| details| overview)?$/, /^overview$/,
  /check\s*list/, /tasks?/, /to dos?/,
  /run of show/, /schedule/, /agenda/, /timeline/,
  /budget/, /expenses?/, /financials?/,
  /mood/, /inspiration/, /references?/,
  /guests?/, /attendees?/, /invitees?/,
  /volunteers?/, /staffing/, /shifts?/,
  /services?/, /vendors?/, /suppliers?/, /providers?/,
  /check[ -]?in stations?/, /entrances?/, /lanes?/,
  /volunteer needs?/, /staffing needs?/,
  /menus?/, /food/, /beverages?/,
  /tickets?/, /admission/,
  /silent auctions?/, /live auctions?/, /auction items?/,
  /raffles?/, /raffle prizes?/,
  /sponsors?/, /sponsorships?/,
  /rfps?/, /requests? for proposals?/,
  /deposits?/, /payments?/,
  /team hours?/, /labor hours?/,
  /live updates?/, /team updates?/, /alerts?/,
  /floor ?plans?/, /room layouts?/,
  /contingenc(y|ies)/, /weather plans?/,
];

/** True when some role already claims this sheet by name, so headers needn't guess. */
function nameIsMeaningful(table: SpreadsheetTable): boolean {
  return ALL_NAME_PATTERNS.some((pattern) => pattern.test(normalize(table.name)));
}

/**
 * The single best role for a sheet, by counting distinctive header hits. Ties go to
 * nothing rather than to a coin flip: importing a budget as a guest list is worse than
 * importing neither and saying so.
 */
export function classifyByHeaders(table: SpreadsheetTable): TableRole | null {
  // A deposit ledger commonly starts with a Vendor column. It is not a vendor
  // directory, and importing it as both would create suppliers and checklist tasks.
  if (
    matchingHeader(table, ["deposit amount", "deposit"])
    && matchingHeader(table, ["vendor", "vendor name", "payee"])
  ) {
    return null;
  }

  let best: TableRole | null = null;
  let bestScore = 0;
  let tied = false;

  for (const [role, signature] of Object.entries(ROLE_SIGNATURES) as Array<[TableRole, readonly string[]]>) {
    const score = signature.filter((header) => matchingHeader(table, [header])).length;
    if (score === 0) continue;
    if (score > bestScore) {
      best = role;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * The sheet for a role: by name where the name says so, otherwise by columns. Only
 * sheets whose name means nothing are classified by header, so an explicitly named tab
 * is never overridden by a lucky column match elsewhere.
 */
function tableFor(tables: SpreadsheetTable[], role: TableRole, patterns: RegExp[]): SpreadsheetTable | null {
  const named = tableNamed(tables, patterns);
  if (named) return named;
  return tables.find((table) => !nameIsMeaningful(table) && classifyByHeaders(table) === role) ?? null;
}

/** Named workbook tabs are preferred; a one-tab Google Sheet falls back to distinctive headers. */
function tableForSection(
  tables: SpreadsheetTable[],
  patterns: RegExp[],
  signature: ReadonlyArray<readonly string[]>,
): SpreadsheetTable | null {
  const named = tableNamed(tables, patterns);
  if (named) return named;
  return tables.find((table) =>
    !nameIsMeaningful(table) && signature.every((alternatives) => matchingHeader(table, alternatives)),
  ) ?? null;
}

function dateTime(value: SpreadsheetValue, defaultHour: number): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T${String(defaultHour).padStart(2, "0")}:00:00`).toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Checklist deadlines are civil dates, so store them at UTC noon without a browser-zone conversion. */
function checklistDueDate(value: SpreadsheetValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.toISOString().slice(0, 10)}T12:00:00.000Z`;
  }
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const civilDate = isoDate ?? (usDate
    ? `${usDate[3]}-${usDate[1]!.padStart(2, "0")}-${usDate[2]!.padStart(2, "0")}`
    : null);
  if (civilDate) {
    const parsed = new Date(`${civilDate}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : `${parsed.toISOString().slice(0, 10)}T12:00:00.000Z`;
}

function integer(value: SpreadsheetValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: SpreadsheetValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function bounded(value: SpreadsheetValue, minimum: number, maximum: number, fallback: number): number {
  const parsed = decimal(value);
  return Math.min(maximum, Math.max(minimum, parsed ?? fallback));
}

function volunteerDayNumber(dayValue: SpreadsheetValue, dateValue: SpreadsheetValue, eventStart: string): number | null {
  const dayText = String(dayValue ?? "").trim();
  if (dayText) {
    const match = dayText.match(/^(?:day\s*)?(\d{1,3})$/i);
    const explicit = typeof dayValue === "number" && Number.isInteger(dayValue) ? dayValue : match ? Number(match[1]) : null;
    return explicit !== null && explicit >= 1 && explicit <= 365 ? explicit : null;
  }
  const dateText = String(dateValue ?? "").trim();
  if (!dateText) return 1;
  const shiftDateText = dateText;
  const dateOnly = shiftDateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const shiftDate = dateValue instanceof Date ? dateValue : new Date(shiftDateText);
  const startDate = new Date(eventStart);
  if (Number.isNaN(shiftDate.getTime()) || Number.isNaN(startDate.getTime())) return null;
  const shiftDay = dateOnly
    ? Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : Date.UTC(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate());
  const firstDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const result = Math.round((shiftDay - firstDay) / 86_400_000) + 1;
  return result >= 1 && result <= 365 ? result : null;
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

export function buildEventImportPlan(
  tables: SpreadsheetTable[],
  sourceName: string,
  options: EventImportOptions = {},
): EventImportPlan {
  const includeVolunteers = options.includeVolunteers ?? true;
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

  const checklistTable = tableFor(tables, "checklist", [/check\s*list/, /tasks?/, /to dos?/]);
  const checklistFromSheet = (checklistTable?.rows ?? []).flatMap((row, index): ChecklistItemDraft[] => {
    const itemTitle = stringFrom(row, checklistTable!, aliases.task);
    if (!itemTitle) return [];
    return [{
      title: itemTitle,
      description: stringFrom(row, checklistTable!, aliases.description) || null,
      category: stringFrom(row, checklistTable!, aliases.category) || "General",
      dueDate: checklistDueDate(valueFrom(row, checklistTable!, aliases.dueDate)),
      assignedTo: stringFrom(row, checklistTable!, aliases.owner) || null,
      assignedEmail: emailFrom(row, checklistTable!, aliases.assigneeEmail),
      completed: truthy(valueFrom(row, checklistTable!, aliases.completed)),
      sortOrder: index,
    }];
  });

  const runTable = tableFor(tables, "runOfShow", [/run of show/, /schedule/, /agenda/, /timeline/]);
  const runOfShow = (runTable?.rows ?? []).flatMap((row, index): RunOfShowItemDraft[] => {
    const cueTitle = stringFrom(row, runTable!, aliases.cueTitle);
    const startTime = clockTime(valueFrom(row, runTable!, aliases.startTime));
    if (!cueTitle || !startTime) return [];
    return [{
      dayNumber: Math.max(1, integer(valueFrom(row, runTable!, aliases.dayNumber)) ?? 1),
      startTime,
      duration: integer(valueFrom(row, runTable!, aliases.duration)),
      title: cueTitle,
      description: stringFrom(row, runTable!, aliases.description) || null,
      responsible: stringFrom(row, runTable!, aliases.responsible) || null,
      assignedEmail: emailFrom(row, runTable!, aliases.assigneeEmail),
      sortOrder: index,
    }];
  });

  const budgetTable = tableFor(tables, "budget", [/budget/, /expenses?/, /financials?/]);
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

  const moodTable = tableFor(tables, "moodBoard", [/mood/, /inspiration/, /references?/]);
  const moodBoard = (moodTable?.rows ?? []).flatMap((row): ImportedMoodReference[] => {
    const url = stringFrom(row, moodTable!, aliases.imageUrl);
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ url, caption: stringFrom(row, moodTable!, aliases.caption) || null }];
  });

  const guestTable = tableFor(tables, "guests", [/guests?/, /attendees?/, /invitees?/]);
  const guests = (guestTable?.rows ?? []).flatMap((row): ImportedGuest[] => {
    const name = stringFrom(row, guestTable!, aliases.guestName);
    const contact = stringFrom(row, guestTable!, aliases.email);
    if (!name || !contact) return [];
    return [{
      name,
      contact,
      notes: stringFrom(row, guestTable!, aliases.description) || null,
      segment: stringFrom(row, guestTable!, aliases.guestSegment) || null,
      organization: stringFrom(row, guestTable!, aliases.guestOrganization) || null,
    }];
  });

  /* --------------------------------------------------------------- volunteers */

  const volunteerTable = includeVolunteers
    ? tableFor(tables, "volunteers", [/^volunteers?( shifts?| schedule| roster)?$/, /^staffing( schedule| roster| shifts?)?$/, /^shifts?$/])
    : null;
  const volunteers = (volunteerTable?.rows ?? []).flatMap((row, index): VolunteerShiftDraft[] => {
    const name = stringFrom(row, volunteerTable!, aliases.volunteerName);
    const role = stringFrom(row, volunteerTable!, aliases.volunteerRole);
    const startTime = clockTime(valueFrom(row, volunteerTable!, aliases.volunteerStart));
    const endTime = clockTime(valueFrom(row, volunteerTable!, aliases.volunteerEnd));
    const dayNumber = volunteerDayNumber(
      valueFrom(row, volunteerTable!, aliases.dayNumber),
      valueFrom(row, volunteerTable!, aliases.volunteerDate),
      event.date,
    );
    if (!name || !role || !startTime || !endTime || startTime === endTime || dayNumber === null) return [];
    const normalizedStatus = normalize(stringFrom(row, volunteerTable!, aliases.volunteerStatus)).replace(/\s+/g, "_");
    const status: VolunteerStatus = ["scheduled", "confirmed", "checked_in", "completed", "cancelled"].includes(normalizedStatus)
      ? normalizedStatus as VolunteerStatus
      : "scheduled";
    return [{
      name,
      email: stringFrom(row, volunteerTable!, aliases.email) || null,
      phone: stringFrom(row, volunteerTable!, aliases.volunteerPhone) || null,
      role,
      dayNumber,
      startTime,
      endTime,
      status,
      notes: stringFrom(row, volunteerTable!, aliases.description) || null,
      sortOrder: index,
    }];
  });
  const skippedVolunteerRows = (volunteerTable?.rows.length ?? 0) - volunteers.length;
  if (skippedVolunteerRows > 0) {
    warnings.push(
      `${skippedVolunteerRows} volunteer ${skippedVolunteerRows === 1 ? "row was" : "rows were"} skipped because a name, role, valid event day or date, start time, or end time was missing.`,
    );
  }

  /* ------------------------------------------------------------------ vendors */

  const vendorTable = tableFor(tables, "vendors", [/services?/, /vendors?/, /suppliers?/, /providers?/]);
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

  /* ------------------------------------------------------ section-specific tabs */

  const stationTable = tableForSection(tables, [/check[ -]?in stations?/, /entrances?/, /check[ -]?in lanes?/], [
    ["station", "station name", "entrance"], ["lane", "device count", "devices", "ipads", "scanners"],
  ]);
  const checkInStations = (stationTable?.rows ?? []).flatMap((row, index): CheckInStationDraft[] => {
    const name = stringFrom(row, stationTable!, ["station", "station name", "entrance", "name"]);
    if (!name) return [];
    return [{
      name,
      lane: stringFrom(row, stationTable!, ["lane", "lane name", "area"]) || name,
      lead: stringFrom(row, stationTable!, ["lead", "owner", "assigned to", "responsible"]) || null,
      deviceCount: Math.max(1, integer(valueFrom(row, stationTable!, ["devices", "device count", "ipads", "scanners"])) ?? 1),
      notes: stringFrom(row, stationTable!, aliases.description) || null,
      sortOrder: index,
    }];
  });

  const volunteerNeedTable = tableForSection(tables, [/volunteer needs?/, /staffing needs?/, /open shifts?/], [
    ["role", "position"], ["required count", "needed", "required"], ["start time", "shift start"], ["end time", "shift end"],
  ]);
  const volunteerNeeds = (volunteerNeedTable?.rows ?? []).flatMap((row, index): VolunteerNeedDraft[] => {
    const role = stringFrom(row, volunteerNeedTable!, aliases.volunteerRole);
    const startTime = clockTime(valueFrom(row, volunteerNeedTable!, aliases.volunteerStart));
    const endTime = clockTime(valueFrom(row, volunteerNeedTable!, aliases.volunteerEnd));
    if (!role || !startTime || !endTime || startTime === endTime) return [];
    return [{
      dayNumber: Math.max(1, integer(valueFrom(row, volunteerNeedTable!, aliases.dayNumber)) ?? 1),
      role,
      startTime,
      endTime,
      requiredCount: Math.max(1, integer(valueFrom(row, volunteerNeedTable!, ["needed", "required", "required count", "people", "count"])) ?? 1),
      notes: stringFrom(row, volunteerNeedTable!, aliases.description) || null,
      signupOpen: !["no", "false", "closed", "0"].includes(normalize(stringFrom(row, volunteerNeedTable!, ["signup open", "open"]))),
      sortOrder: index,
    }];
  });

  const menuTable = tableForSection(tables, [/menus?/, /food( and | & )beverage/, /catering menu/], [["menu item", "dish"]]);
  const menu = (menuTable?.rows ?? []).flatMap((row, index): MenuItemDraft[] => {
    const name = stringFrom(row, menuTable!, ["menu item", "dish", "item", "name", "title"]);
    if (!name) return [];
    const dietary = stringFrom(row, menuTable!, ["dietary tags", "dietary", "allergens", "tags"]);
    return [{
      name,
      description: stringFrom(row, menuTable!, aliases.description) || null,
      course: stringFrom(row, menuTable!, ["course", "section", "meal"]) || "Other",
      dietaryTags: dietary ? dietary.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean) : [],
      priceCents: moneyCents(valueFrom(row, menuTable!, ["price", "cost", "amount"])),
      serves: integer(valueFrom(row, menuTable!, ["serves", "servings", "quantity"])),
      notes: stringFrom(row, menuTable!, ["notes", "special instructions"]) || null,
      sortOrder: index,
    }];
  });

  const ticketTable = tableForSection(tables, [/tickets?/, /ticket types?/, /admission/], [["ticket type", "ticket"], ["quantity", "available", "inventory"]]);
  const tickets = (ticketTable?.rows ?? []).flatMap((row, index): TicketTypeDraft[] => {
    const name = stringFrom(row, ticketTable!, ["ticket", "ticket type", "name", "title"]);
    const priceCents = moneyCents(valueFrom(row, ticketTable!, ["price", "ticket price", "amount"]));
    const quantityTotal = integer(valueFrom(row, ticketTable!, ["quantity", "available", "inventory", "capacity", "total"]));
    if (!name || priceCents === null || quantityTotal === null) return [];
    return [{
      name,
      description: stringFrom(row, ticketTable!, aliases.description) || null,
      priceCents: Math.max(0, priceCents),
      quantityTotal: Math.max(0, quantityTotal),
      isActive: !["no", "false", "inactive", "0"].includes(normalize(stringFrom(row, ticketTable!, ["active", "is active", "status"]))),
      sortOrder: index,
    }];
  });

  const silentAuctionTable = tableForSection(tables, [/silent auctions?/, /silent auction items?/], [["auction item"], ["starting bid", "opening bid", "minimum bid"]]);
  const liveAuctionTable = tableNamed(tables, [/live auctions?/, /live auction items?/]);
  const generalAuctionTable = tableNamed(tables, [/^auctions?$/, /auction items?/]);
  const auctionTables = Array.from(new Set([silentAuctionTable, liveAuctionTable, generalAuctionTable].filter(Boolean)));
  const auctions = auctionTables.flatMap((table): AuctionItemDraft[] => table!.rows.flatMap((row): AuctionItemDraft[] => {
    const title = stringFrom(row, table!, ["auction item", "item", "name", "title"]);
    if (!title) return [];
    const tableName = normalize(table!.name);
    const typeText = normalize(stringFrom(row, table!, ["auction type", "type"]));
    return [{
      title,
      description: stringFrom(row, table!, aliases.description) || null,
      imageUrl: stringFrom(row, table!, aliases.imageUrl) || null,
      startingBidCents: moneyCents(valueFrom(row, table!, ["starting bid", "opening bid", "minimum bid"])),
      currentBidCents: moneyCents(valueFrom(row, table!, ["current bid", "winning bid"])),
      fairMarketValueCents: moneyCents(valueFrom(row, table!, ["fair market value", "market value", "value"])),
      winnerName: stringFrom(row, table!, ["winner", "winner name"]) || null,
      donorName: stringFrom(row, table!, ["donor", "donor name"]) || null,
      auctionType: typeText === "live" || tableName.includes("live") ? "live" : "silent",
      lotNumber: integer(valueFrom(row, table!, ["lot", "lot number", "number"])),
    }];
  }));

  const raffleTable = tableForSection(tables, [/raffles?/, /raffle prizes?/, /raffle items?/], [["prize", "raffle item"], ["ticket price"]]);
  const raffle = (raffleTable?.rows ?? []).flatMap((row): RaffleItemDraft[] => {
    const name = stringFrom(row, raffleTable!, ["raffle item", "prize", "name", "title"]);
    if (!name) return [];
    return [{
      name,
      description: stringFrom(row, raffleTable!, aliases.description) || null,
      imageUrl: stringFrom(row, raffleTable!, aliases.imageUrl) || null,
      ticketPriceCents: Math.max(0, moneyCents(valueFrom(row, raffleTable!, ["ticket price", "price", "amount"])) ?? 0),
      totalTickets: Math.max(0, integer(valueFrom(row, raffleTable!, ["total tickets", "tickets", "quantity"])) ?? 0),
    }];
  });

  const sponsorshipTable = tableForSection(tables, [/sponsorships?/, /^sponsors?$/], [["sponsor", "sponsor name"], ["tier", "sponsorship amount"]]);
  const sponsorships = (sponsorshipTable?.rows ?? []).flatMap((row): SponsorshipDraft[] => {
    const companyName = stringFrom(row, sponsorshipTable!, ["company", "company name", "sponsor", "sponsor name", "name"]);
    if (!companyName) return [];
    const tierText = normalize(stringFrom(row, sponsorshipTable!, ["tier", "level"]));
    return [{
      companyName,
      tier: (["gold", "silver", "bronze"].includes(tierText) ? tierText : "custom") as SponsorshipDraft["tier"],
      amountCents: moneyCents(valueFrom(row, sponsorshipTable!, ["amount", "value", "sponsorship amount"])),
      logoUrl: stringFrom(row, sponsorshipTable!, ["logo", "logo url", "image url"]) || null,
      contactEmail: emailFrom(row, sponsorshipTable!, ["contact email", "email", "email address"]),
      contactName: stringFrom(row, sponsorshipTable!, ["contact name", "contact", "representative"]) || null,
      notes: stringFrom(row, sponsorshipTable!, aliases.description) || null,
    }];
  });

  const rfpTable = tableForSection(tables, [/rfps?/, /requests? for proposals?/], [["rfp title", "room block required", "rooms required"]]);
  const rfps = (rfpTable?.rows ?? []).flatMap((row): RfpDraft[] => {
    const title = stringFrom(row, rfpTable!, ["rfp title", "title", "name"]);
    if (!title) return [];
    const target = normalize(stringFrom(row, rfpTable!, ["target", "target type", "send to"]));
    const rawEventType = stringFrom(row, rfpTable!, ["event type", "type"]);
    const eventType = RFP_EVENT_TYPES.find((candidate) => normalize(candidate) === normalize(rawEventType));
    const eventDate = dateTime(valueFrom(row, rfpTable!, aliases.date), 9);
    const startTime = clockTime(valueFrom(row, rfpTable!, aliases.startTime));
    const endTime = clockTime(valueFrom(row, rfpTable!, ["end time", "ends"]));
    const rawHeadcount = integer(valueFrom(row, rfpTable!, aliases.capacity));
    const headcount = rawHeadcount === null || rawHeadcount < 1 ? null : rawHeadcount;
    const city = stringFrom(row, rfpTable!, ["city"]);
    const location = stringFrom(row, rfpTable!, aliases.location);
    const roomsRequested = integer(valueFrom(row, rfpTable!, ["rooms", "rooms required", "room count"]));
    const roomBlockRequired = truthy(valueFrom(row, rfpTable!, ["room block", "room block required"])) || (roomsRequested ?? 0) > 0;
    const checkInDate = dateTime(valueFrom(row, rfpTable!, ["check in date", "hotel check in"]), 15);
    const checkOutDate = dateTime(valueFrom(row, rfpTable!, ["check out date", "hotel check out"]), 11);
    const budgetMinCents = moneyCents(valueFrom(row, rfpTable!, ["minimum budget", "budget min", "min budget"]));
    const rawBudgetMax = moneyCents(valueFrom(row, rfpTable!, ["maximum budget", "budget max", "max budget", "budget"]));
    const budgetMaxCents = rawBudgetMax === null || budgetMinCents === null ? rawBudgetMax : Math.max(rawBudgetMax, budgetMinCents);
    const foodBeverageSpendCents = moneyCents(valueFrom(row, rfpTable!, ["food beverage spend", "f&b spend", "food and beverage spend"]));
    const ancillarySpendCents = moneyCents(valueFrom(row, rfpTable!, ["ancillary spend", "other spend"]));
    const targetType = target.includes("venue") || target.includes("hotel")
      ? "venue"
      : target.includes("vendor") ? "vendor" : null;
    const missing = [
      !targetType && "target type",
      !eventType && "event type",
      !eventDate && "event date",
      !startTime && "start time",
      !endTime && "end time",
      headcount === null && "headcount",
      !city && "city",
      !location && "location",
    ].filter(Boolean) as string[];

    const hotelPurposes = ["registration", "breakfast", "meeting", "lunch"] as const;
    const spaceRequirements = roomBlockRequired ? hotelPurposes.flatMap((purpose) => {
      const spaceDate = dateTime(valueFrom(row, rfpTable!, [`${purpose} date`]), 9);
      const spaceStart = clockTime(valueFrom(row, rfpTable!, [`${purpose} start time`, `${purpose} start`]));
      const spaceEnd = clockTime(valueFrom(row, rfpTable!, [`${purpose} end time`, `${purpose} end`]));
      const spaceCapacity = integer(valueFrom(row, rfpTable!, [`${purpose} capacity`, `${purpose} headcount`]));
      return spaceDate && spaceStart && spaceEnd && spaceCapacity !== null && spaceCapacity > 0 ? [{
        id: `import-${purpose}`,
        purpose,
        date: spaceDate,
        startTime: spaceStart,
        endTime: spaceEnd,
        capacity: spaceCapacity,
        notes: stringFrom(row, rfpTable!, [`${purpose} notes`]) || null,
      }] : [];
    }) : [];

    if (roomBlockRequired) {
      if (targetType !== "venue") missing.push("venue target type");
      if (roomsRequested === null || roomsRequested < 1) missing.push("rooms required");
      if (!checkInDate) missing.push("check-in date");
      if (!checkOutDate) missing.push("check-out date");
      if (foodBeverageSpendCents === null) missing.push("food and beverage spend");
      if (ancillarySpendCents === null) missing.push("ancillary spend");
      if (spaceRequirements.length !== hotelPurposes.length) {
        missing.push("registration, breakfast, meeting, and lunch space details");
      }
    }

    if (missing.length > 0) {
      const uniqueMissing = Array.from(new Set(missing));
      warnings.push(`RFP “${title}” was skipped because ${uniqueMissing.join(", ")} ${uniqueMissing.length === 1 ? "is" : "are"} required.`);
      return [];
    }

    const draft: RfpDraft = {
      title,
      targetType: targetType!,
      vendorCategory: stringFrom(row, rfpTable!, ["vendor category", "category", "service"]) || "Other",
      description: stringFrom(row, rfpTable!, aliases.description) || null,
      eventType: eventType!,
      eventDate: eventDate!,
      startTime: startTime!,
      endTime: endTime!,
      city,
      location,
      budgetMinCents,
      budgetMaxCents,
      headcount: headcount!,
      roomBlockRequired,
      roomsRequired: roomBlockRequired ? roomsRequested : null,
      checkInDate: roomBlockRequired ? checkInDate : null,
      checkOutDate: roomBlockRequired ? checkOutDate : null,
      spaceRequirements,
      foodBeverageSpendCents: roomBlockRequired ? foodBeverageSpendCents : null,
      ancillarySpendCents: roomBlockRequired ? ancillarySpendCents : null,
      ancillarySpendNotes: stringFrom(row, rfpTable!, ["ancillary spend notes", "other spend notes"]) || null,
      deadline: dateTime(valueFrom(row, rfpTable!, ["deadline", "response deadline", "due date"]), 17),
      requirements: stringFrom(row, rfpTable!, ["requirements", "needs", "details"]) || null,
    };
    const parsed = rfpDraftSchema.safeParse(draft);
    if (parsed.success) return [parsed.data];
    warnings.push(`RFP “${title}” was skipped because its dates, times, budget, or hotel details were invalid.`);
    return [];
  });

  const depositTable = tableForSection(tables, [/deposits?/, /vendor deposits?/, /deposit payments?/], [["deposit amount", "deposit"], ["vendor", "vendor name", "payee"]]);
  const deposits = (depositTable?.rows ?? []).flatMap((row): DepositDraft[] => {
    const vendorName = stringFrom(row, depositTable!, ["vendor", "vendor name", "payee", "name"]);
    const amountCents = moneyCents(valueFrom(row, depositTable!, ["amount", "deposit", "deposit amount"]));
    if (!vendorName || amountCents === null) return [];
    const statusText = normalize(stringFrom(row, depositTable!, ["status"]));
    return [{
      vendorName,
      amountCents: Math.max(0, amountCents),
      dueDate: dateTime(valueFrom(row, depositTable!, ["due date", "due"]), 12),
      paidDate: dateTime(valueFrom(row, depositTable!, ["paid date", "date paid"]), 12),
      paidBy: stringFrom(row, depositTable!, ["paid by", "payer"]) || null,
      paymentMethod: stringFrom(row, depositTable!, ["payment method", "method"]) || null,
      status: (["paid", "overdue", "refunded"].includes(statusText) ? statusText : "pending") as DepositDraft["status"],
      notes: stringFrom(row, depositTable!, aliases.description) || null,
    }];
  });

  const teamHoursTable = tableForSection(tables, [/team hours?/, /labor hours?/, /staff hours?/], [["staff member", "team member"], ["hours", "total hours"]]);
  const teamHours = (teamHoursTable?.rows ?? []).flatMap((row): TeamHoursDraft[] => {
    const staffMember = stringFrom(row, teamHoursTable!, ["staff member", "team member", "person", "name"]);
    const role = stringFrom(row, teamHoursTable!, ["role", "job", "position"]);
    const hours = decimal(valueFrom(row, teamHoursTable!, ["hours", "total hours", "time"]));
    return staffMember && role && hours !== null ? [{ staffMember, role, hours: Math.max(0, hours) }] : [];
  });

  const updateTable = tableForSection(tables, [/live updates?/, /team updates?/, /alerts?/], [["message", "update", "alert"], ["kind", "type"]]);
  const teamUpdates = (updateTable?.rows ?? []).flatMap((row): TeamUpdateDraft[] => {
    const message = stringFrom(row, updateTable!, ["message", "update", "alert", "description", "notes"]);
    if (!message) return [];
    const kindText = normalize(stringFrom(row, updateTable!, ["kind", "type", "category"]));
    return [{
      kind: kindText.includes("vendor") ? "vendor-delay" : kindText.includes("schedule") ? "schedule" : "general",
      message,
      notifyTeam: false,
    }];
  });

  const floorplanTable = tableForSection(tables, [/floor ?plans?/, /room layouts?/], [["shape", "object type", "item type"], ["x", "x position"], ["y", "y position"]]);
  const allFloorplanRows = floorplanTable?.rows ?? [];
  const floorplanRows = allFloorplanRows.slice(0, 500);
  if (allFloorplanRows.length > floorplanRows.length) {
    warnings.push(`Only the first 500 floorplan objects were imported. ${allFloorplanRows.length - floorplanRows.length} extra rows were skipped.`);
  }
  const floorplanShapes = new Set(["round-table", "long-table", "stage", "bar", "entrance", "dancefloor", "booth", "av", "tree", "chair", "chair-row"]);
  const floorplanName = floorplanTable && floorplanRows.length > 0
    ? stringFrom(floorplanRows[0]!, floorplanTable, ["floorplan", "floorplan name", "room", "room name", "plan name"])
    : "";
  let skippedFloorplanRows = 0;
  const floorplanItems = floorplanRows.flatMap((row, index) => {
    const label = stringFrom(row, floorplanTable!, ["label", "item", "object", "name"]);
    const rawShape = normalize(stringFrom(row, floorplanTable!, ["shape", "object type", "item type", "type"])).replace(/\s+/g, "-");
    if (!label || label.length > 80 || !floorplanShapes.has(rawShape)) {
      skippedFloorplanRows += 1;
      return [];
    }
    return [{
      id: `imported-${index + 1}`,
      shape: rawShape as FloorplanDraft["items"][number]["shape"],
      label,
      x: bounded(valueFrom(row, floorplanTable!, ["x", "x position", "left percent"]), 0, 100, 10 + (index % 6) * 14),
      y: bounded(valueFrom(row, floorplanTable!, ["y", "y position", "top percent"]), 0, 100, 10 + (Math.floor(index / 6) % 6) * 14),
      seats: Math.min(10_000, Math.max(0, integer(valueFrom(row, floorplanTable!, ["seats", "seat count", "capacity"])) ?? 0)),
      locked: truthy(valueFrom(row, floorplanTable!, ["locked", "fixed", "existing"])),
    }];
  });
  if (skippedFloorplanRows > 0) {
    warnings.push(`${skippedFloorplanRows} floorplan ${skippedFloorplanRows === 1 ? "row was" : "rows were"} skipped because its label or shape was invalid.`);
  }
  let floorplans: FloorplanDraft[] = [];
  if (floorplanTable && floorplanRows.length > 0) {
    try {
      floorplans = [parseFloorplanDraft({
        name: floorplanName || floorplanTable.name,
        items: floorplanItems,
        room: {
          shape: "rectangle",
          widthFeet: Math.min(10_000, Math.max(1, decimal(valueFrom(floorplanRows[0]!, floorplanTable, ["room width", "width feet", "width"])) ?? 60)),
          lengthFeet: Math.min(10_000, Math.max(1, decimal(valueFrom(floorplanRows[0]!, floorplanTable, ["room length", "length feet", "length"])) ?? 40)),
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        },
      })];
    } catch {
      warnings.push(`Floorplan “${floorplanName || floorplanTable.name}” was skipped because its name or room details were invalid.`);
    }
  }

  const contingencyTable = tableForSection(tables, [/contingenc(y|ies)/, /weather plans?/], [["contingency task"]]);
  const contingency = (contingencyTable?.rows ?? []).flatMap((row, index): ChecklistItemDraft[] => {
    const itemTitle = stringFrom(row, contingencyTable!, aliases.task);
    if (!itemTitle) return [];
    return [{
      title: itemTitle,
      description: stringFrom(row, contingencyTable!, aliases.description) || null,
      category: "Contingency",
      dueDate: checklistDueDate(valueFrom(row, contingencyTable!, aliases.dueDate)),
      assignedTo: stringFrom(row, contingencyTable!, aliases.owner) || null,
      assignedEmail: emailFrom(row, contingencyTable!, aliases.assigneeEmail),
      completed: truthy(valueFrom(row, contingencyTable!, aliases.completed)),
      sortOrder: checklistFromSheet.length + index,
    }];
  });

  /*
   * Any sheet that produced nothing is named back to the reader. A tab that is silently
   * ignored is worse than one that fails: the import looks like it worked and the gap is
   * only found later, by someone who assumed the data was there.
   */
  const consumed = new Set(
    [
      eventTable, checklistTable, runTable, budgetTable, moodTable, guestTable, volunteerTable, vendorTable,
      stationTable, volunteerNeedTable, menuTable, ticketTable, ...auctionTables, raffleTable,
      sponsorshipTable, rfpTable, depositTable, teamHoursTable, updateTable, floorplanTable, contingencyTable,
    ]
      .filter(Boolean)
      .map((table) => table!.name),
  );
  const ignored = tables.filter((table) => !consumed.has(table.name) && table.rows.length > 0);
  if (ignored.length > 0) {
    warnings.push(
      `${ignored.length === 1 ? "This sheet was" : "These sheets were"} not recognised and nothing was imported from ${ignored.length === 1 ? "it" : "them"}: ${ignored.map((table) => table.name).join(", ")}.`,
    );
  }

  /*
   * Every imported service also becomes a task.
   *
   * A supplier on a spreadsheet is a commitment someone has to chase — confirm the
   * booking, sign the contract, agree the details. Importing them into the directory and
   * leaving the checklist untouched moves the row without moving the work, so the thing
   * most likely to be forgotten is the thing that was never written down.
   *
   * Skipped when the checklist sheet already mentions the vendor by name, so a
   * spreadsheet that tracks both does not produce the task twice.
   */
  const mentioned = new Set(checklistFromSheet.map((item) => normalize(item.title)));
  const vendorTasks = vendors.flatMap((imported, index): ChecklistItemDraft[] => {
    const name = imported.vendor.name;
    if ([...mentioned].some((title) => title.includes(normalize(name)))) return [];
    return [
      {
        title: `Confirm ${name}`,
        description: imported.notes,
        category: checklistCategoryForVendor(imported.vendor.category),
        dueDate: null,
        assignedTo: null,
        completed: false,
        sortOrder: checklistFromSheet.length + index,
      },
    ];
  });

  const checklist = [...checklistFromSheet, ...contingency, ...vendorTasks];

  return {
    sourceName,
    event,
    checklist,
    runOfShow,
    budget,
    moodBoard,
    guests,
    vendors,
    volunteers,
    volunteerNeeds,
    checkInStations,
    menu,
    tickets,
    auctions,
    raffle,
    sponsorships,
    rfps,
    deposits,
    teamHours,
    teamUpdates,
    floorplans,
    warnings,
  };
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
