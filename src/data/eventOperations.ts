import { z } from "zod";
import type { RegistrationPageSettings, RegistrationQuestion } from "./registrationPage.ts";
import type { RegistrationWithGuest } from "./entities.ts";
import type { BizyPartnerSummary } from "./bizyLink.ts";

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });

export const placementGroupSchema = z.object({
  id, name: z.string().trim().min(1).max(100), kind: z.enum(["table", "golf"]),
  capacity: z.number().int().min(1).max(100),
  location: z.string().max(200).default(""),
  time: z.string().max(80).default(""),
  floorplanItemId: z.string().max(200).nullable().default(null),
}).superRefine((group, context) => {
  if (group.kind === "golf" && group.capacity > 4) context.addIssue({ code: z.ZodIssueCode.custom, message: "A golf foursome can contain up to four people.", path: ["capacity"] });
});

export const eventOperationsSchema = z.object({
  version: z.literal(1).default(1),
  apparel: z.object({
    questionIds: z.array(id).max(12).default([]),
    questionLabels: z.record(id, z.array(z.string().max(160)).max(20)).default({}),
    cutoffAt: timestamp.nullable().default(null),
    vendorNotes: z.string().max(2000).default(""),
    received: z.array(z.object({ questionId: id, size: z.string().max(100), quantity: z.number().int().min(0).max(100000) })).max(250).default([]),
    handedOutRegistrationIds: z.array(id).max(3000).default([]),
  }).default({}),
  groups: z.array(placementGroupSchema).max(500).default([]),
  assignments: z.array(z.object({ registrationId: id, groupId: id })).max(6000).default([]),
  sponsorDeliverables: z.array(z.object({
    id, sponsorId: id, description: z.string().trim().min(1).max(500),
    status: z.enum(["pending", "in-progress", "completed"]).default("pending"),
    dueAt: timestamp.nullable().default(null),
    completedBy: z.string().max(120).default(""),
  })).max(1000).default([]),
  milestones: z.array(z.object({
    id, title: z.string().trim().min(1).max(200), dueAt: timestamp.nullable(), completed: z.boolean(),
  })).max(100).default([]),
}).superRefine((document, context) => {
  const groups = new Map(document.groups.map(group => [group.id, group]));
  if (groups.size !== document.groups.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Placement groups must have unique IDs.", path: ["groups"] });
  const occupants = new Map<string, number>();
  const people = new Set<string>();
  for (const [index, assignment] of document.assignments.entries()) {
    const group = groups.get(assignment.groupId);
    if (!group) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an existing table or foursome.", path: ["assignments", index] });
      continue;
    }
    const person = `${group.kind}:${assignment.registrationId}`;
    if (people.has(person)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Each person can have one table and one golf foursome.", path: ["assignments", index] });
    people.add(person);
    occupants.set(group.id, (occupants.get(group.id) ?? 0) + 1);
  }
  for (const group of document.groups) {
    if ((occupants.get(group.id) ?? 0) > group.capacity) context.addIssue({ code: z.ZodIssueCode.custom, message: `${group.name} is full. Increase its capacity or move a person first.`, path: ["assignments"] });
  }
  for (const [key, values] of [["questionIds", document.apparel.questionIds], ["handedOutRegistrationIds", document.apparel.handedOutRegistrationIds]] as const) {
    if (new Set(values).size !== values.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Remove duplicate apparel selections.", path: ["apparel", key] });
  }
});

export type EventOperationsDocument = z.infer<typeof eventOperationsSchema>;
export type PlacementGroup = EventOperationsDocument["groups"][number];
export interface EventOperationsSnapshot { revision: number; document: EventOperationsDocument; updatedAt: string | null; previous?: { revision: number; document: EventOperationsDocument; updatedAt: string | null } }
export interface EventOperationsRepository {
  get(eventId: string): Promise<EventOperationsSnapshot>;
  save(eventId: string, expectedRevision: number, document: EventOperationsDocument): Promise<EventOperationsSnapshot>;
  financials(eventId: string): Promise<OperationsFinancials>;
  partners(eventId: string): Promise<BizyPartnerSummary[]>;
  createPartner(eventId: string, input: { role: "sponsor" | "vendor"; resourceId: string; seatLimit: number }): Promise<BizyPartnerSummary & { path: string }>;
  revokePartner(eventId: string, id: string): Promise<unknown>;
}
export interface OperationsCurrencyTotal { currency: string; ticketsCents: number; auctionsCents: number; donationsCents: number; paidPledgesCents: number; collectedCents: number }
export interface OperationsFinancials { currencies: OperationsCurrencyTotal[]; pledgedCents: number; unclassified: Array<{ id: string; source: string; amountCents: number }> }
export function operationsCurrencyTotals(tickets: Array<{ amount: number; currency: string }>, auctions: Array<{ amount: number; currency: string }>, donations: Array<{ amount: number; currency: string }>, pledges: Array<{ amount: number; currency: string }> = []): OperationsCurrencyTotal[] {
  const totals = new Map<string, OperationsCurrencyTotal>();
  for (const [key, rows] of [["ticketsCents", tickets], ["auctionsCents", auctions], ["donationsCents", donations], ["paidPledgesCents", pledges]] as const) {
    for (const row of rows) {
      const currency = row.currency.toUpperCase();
      const value = totals.get(currency) ?? { currency, ticketsCents: 0, auctionsCents: 0, donationsCents: 0, paidPledgesCents: 0, collectedCents: 0 };
      value[key] += row.amount; value.collectedCents += row.amount; totals.set(currency, value);
    }
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function emptyEventOperations(): EventOperationsDocument {
  return eventOperationsSchema.parse({});
}

export function preparationMilestones(eventDate: string): EventOperationsDocument["milestones"] {
  const date = new Date(eventDate);
  const steps = [
    ["Platform onboarding and event buildout", -110], ["Launch sponsor and guest Bizy Links", -96],
    ["Lock apparel sizing and vendor production", -34], ["Finalize tables, foursomes and check-in", -14],
    ["Live event execution", 0], ["Deliver wrap-up and fundraising report", 3],
  ] as const;
  return steps.map(([title, offset], index) => {
    const due = new Date(date); due.setUTCDate(due.getUTCDate() + offset); due.setUTCHours(12, 0, 0, 0);
    return { id: `prep-${index}-${date.toISOString().slice(0, 10)}`, title, dueAt: due.toISOString(), completed: false };
  });
}

export function placeRegistration(document: EventOperationsDocument, registrationId: string, target: string | null, kind: PlacementGroup["kind"]): EventOperationsDocument {
  const groupIds = new Set(document.groups.filter(group => group.kind === kind).map(group => group.id));
  if (target && !groupIds.has(target)) throw new Error("Choose a group in this placement view.");
  const assignments = document.assignments.filter(item => item.registrationId !== registrationId || !groupIds.has(item.groupId));
  if (target) assignments.push({ registrationId, groupId: target });
  const parsed = eventOperationsSchema.safeParse({ ...document, assignments });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review this placement.");
  return parsed.data;
}

export interface PublicApparelSettings { questionIds: string[]; cutoffAt: string | null }

/** Registration stays open after production closes; the sizing questions close at their own cutoff. */
export function pageAtApparelCutoff(page: RegistrationPageSettings, apparel: PublicApparelSettings | undefined, now = new Date()): RegistrationPageSettings {
  if (!apparel?.cutoffAt || now.getTime() < new Date(apparel.cutoffAt).getTime()) return page;
  const closed = new Set(apparel.questionIds);
  return { ...page, questions: page.questions.filter(question => !closed.has(question.id)) };
}

export const APPAREL_PRESETS = {
  shirt: { label: "Shirt size", options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
  pants: { label: "Pant size", options: ["XS", "S", "M", "L", "XL", "XXL"] },
  gift: { label: "Gift size", options: ["XS", "S", "M", "L", "XL", "One size"] },
} as const;

export function apparelQuestion(kind: keyof typeof APPAREL_PRESETS, questionId: string): RegistrationQuestion {
  const preset = APPAREL_PRESETS[kind];
  return { id: questionId, label: preset.label, type: "select", options: [...preset.options], audience: "both", required: false };
}

export function apparelReport(rows: RegistrationWithGuest[], page: RegistrationPageSettings, document: EventOperationsDocument) {
  const questions = document.apparel.questionIds.flatMap(id => {
    const current = page.questions.find(question => question.id === id);
    const label = current?.label ?? document.apparel.questionLabels?.[id]?.at(-1);
    return label ? [{ id, label }] : [];
  });
  const handouts = new Set(document.apparel.handedOutRegistrationIds);
  const people = new Map<string, RegistrationWithGuest>();
  for (const row of rows) {
    if (row.status === "cancelled" && !handouts.has(row.id)) continue;
    const existing = people.get(row.guestId);
    if (!existing || new Date(row.registeredAt).getTime() > new Date(existing.registeredAt).getTime()) people.set(row.guestId, row);
  }
  const individual = [...people.values()].flatMap(row => {
    const answers = new Map((row.importedFields ?? []).map(field => [field.label, field.value]));
    const identifiedAnswers = new Map((row.importedFields ?? []).filter(field => field.questionId).map(field => [field.questionId, field.value]));
    return questions.map(question => ({
      registrationId: row.id, name: row.guest?.name ?? "Guest", guestType: row.segment ?? "General",
      registrationStatus: row.status,
      questionId: question.id, item: question.label, size: (identifiedAnswers.get(question.id) ?? answers.get(question.label) ?? document.apparel.questionLabels?.[question.id]?.map(label => answers.get(label)).find(Boolean))?.trim() || "Not provided",
      handedOut: handouts.has(row.id),
      withinCutoff: !document.apparel.cutoffAt || new Date(row.registeredAt).getTime() <= new Date(document.apparel.cutoffAt).getTime(),
    }));
  });
  const quantities = new Map<string, { questionId: string; item: string; size: string; requested: number; received: number; handedOut: number }>();
  for (const line of individual) {
    if (line.size === "Not provided" || (!line.withinCutoff && !line.handedOut)) continue;
    const key = `${line.questionId}\u0000${line.size}`;
    const quantity = quantities.get(key) ?? { questionId: line.questionId, item: line.item, size: line.size, requested: 0, received: 0, handedOut: 0 };
    if (line.withinCutoff && line.registrationStatus !== "cancelled") quantity.requested++;
    if (line.handedOut) quantity.handedOut++;
    quantities.set(key, quantity);
  }
  for (const stock of document.apparel.received) {
    const question = questions.find(item => item.id === stock.questionId);
    if (!question) continue;
    const key = `${stock.questionId}\u0000${stock.size}`;
    const quantity = quantities.get(key) ?? { questionId: stock.questionId, item: question.label, size: stock.size, requested: 0, received: 0, handedOut: 0 };
    quantity.received += stock.quantity;
    quantities.set(key, quantity);
  }
  return {
    individual,
    quantities: [...quantities.values()].sort((a, b) => a.item.localeCompare(b.item) || a.size.localeCompare(b.size)),
    unnamedExtraGuests: [...people.values()].reduce((count, row) => count + Math.max(0, row.quantity - 1), 0),
  };
}
