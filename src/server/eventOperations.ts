import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { emptyEventOperations, eventOperationsSchema, operationsCurrencyTotals, type EventOperationsSnapshot } from "../data/eventOperations.ts";
import { normalizeRegistrationPage } from "../data/registrationPage.ts";
import { HttpError, requireEventAccess, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { events, registrations, sponsorships, ticketOrders, auctionOrders, donations, bidderBills, fundraisingPledges } from "./schema.ts";

// Event extensions remain private: public event mapping only serializes normalized
// registration settings. JSON key updates preserve the designer and its recovery drafts.
export async function readEventOperations(eventId: string): Promise<EventOperationsSnapshot> {
  const [row] = await db.select({ value: sql`registration_page->'_operations'`, previous: sql`registration_page->'_operationsPrevious'` }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) throw new HttpError(404, "That event no longer exists.");
  const saved = row.value as EventOperationsSnapshot | null;
  const previous = row.previous as EventOperationsSnapshot | null;
  return saved ? { ...saved, document: eventOperationsSchema.parse(saved.document), ...(previous ? { previous: { revision: previous.revision, document: eventOperationsSchema.parse(previous.document), updatedAt: previous.updatedAt } } : {}) } : { revision: 0, document: emptyEventOperations(), updatedAt: null };
}

async function owned(ctx: RequestContext, eventId: string) {
  requireEventAccess(ctx, eventId);
  const [event] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
}

export async function getEventOperations(ctx: RequestContext, eventId: string) {
  await owned(ctx, eventId);
  return readEventOperations(eventId);
}

export async function eventOperationsFinancials(ctx: RequestContext, eventId: string) {
  await owned(ctx, eventId);
  const [ticketRows, auctionRows, donationRows, billRows, pledgeRows] = await Promise.all([
    db.select({ amount: ticketOrders.amountCents, currency: ticketOrders.currency }).from(ticketOrders).where(and(eq(ticketOrders.eventId, eventId), eq(ticketOrders.workspaceId, ctx.workspaceId), eq(ticketOrders.status, "paid"))),
    db.select({ amount: auctionOrders.amountCents, currency: auctionOrders.currency }).from(auctionOrders).where(and(eq(auctionOrders.eventId, eventId), eq(auctionOrders.workspaceId, ctx.workspaceId), eq(auctionOrders.status, "paid"))),
    db.select({ id: donations.id, amount: donations.amountCents, currency: donations.currency }).from(donations).where(and(eq(donations.eventId, eventId), eq(donations.workspaceId, ctx.workspaceId), eq(donations.status, "paid"))),
    // Bill-paid auction orders already appear above. Add only the pledge component.
    db.select({ id: bidderBills.id, amount: bidderBills.pledgesTotalCents, currency: bidderBills.currency }).from(bidderBills).where(and(eq(bidderBills.eventId, eventId), eq(bidderBills.workspaceId, ctx.workspaceId), eq(bidderBills.status, "paid"))),
    db.select({ amount: fundraisingPledges.amountCents }).from(fundraisingPledges).where(and(eq(fundraisingPledges.eventId, eventId), eq(fundraisingPledges.workspaceId, ctx.workspaceId))),
  ]);
  const total = (rows: Array<{ amount: number }>) => rows.reduce((sum, row) => sum + row.amount, 0);
  const known = (rows: Array<{ amount: number; currency: string | null }>) => rows.flatMap(row => row.currency ? [{ amount: row.amount, currency: row.currency }] : []);
  return { currencies: operationsCurrencyTotals(ticketRows, auctionRows, known(donationRows), known(billRows)), pledgedCents: total(pledgeRows), unclassified: [...donationRows.filter(row => !row.currency).map(row => ({ id: row.id, source: "Donation", amountCents: row.amount })), ...billRows.filter(row => !row.currency && row.amount).map(row => ({ id: row.id, source: "Paid pledge component", amountCents: row.amount }))] };
}

export async function saveEventOperations(ctx: RequestContext, eventId: string, value: unknown): Promise<EventOperationsSnapshot> {
  await owned(ctx, eventId);
  const input = z.object({ expectedRevision: z.number().int().min(0), document: eventOperationsSchema }).parse(value);
  const [event] = await db.select({ page: events.registrationPage }).from(events).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId)));
  const previous = await readEventOperations(eventId);
  const page = normalizeRegistrationPage(event?.page);
  input.document.apparel.questionLabels = Object.fromEntries(input.document.apparel.questionIds.map(id => [id, [...new Set([...(previous.document.apparel.questionLabels[id] ?? []), ...(page.questions.find(question => question.id === id)?.label ? [page.questions.find(question => question.id === id)!.label] : [])])].slice(-20)]));
  const [people, sponsors] = await Promise.all([
    db.select({ id: registrations.id, quantity: registrations.quantity }).from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.workspaceId, ctx.workspaceId))),
    db.select({ id: sponsorships.id }).from(sponsorships).where(and(eq(sponsorships.eventId, eventId), eq(sponsorships.workspaceId, ctx.workspaceId))),
  ]);
  const peopleIds = new Set(people.map(row => row.id));
  if (input.document.assignments.some(item => people.some(row => row.id === item.registrationId && row.quantity > 1))) throw new HttpError(400, "Add separate named guest records before placing a multi-person registration.");
  const sponsorIds = new Set(sponsors.map(row => row.id));
  if (input.document.assignments.some(row => !peopleIds.has(row.registrationId)) || input.document.apparel.handedOutRegistrationIds.some(id => !peopleIds.has(id))) throw new HttpError(400, "Refresh the guest list before saving these placements or handouts.");
  if (input.document.sponsorDeliverables.some(row => !sponsorIds.has(row.sponsorId))) throw new HttpError(400, "Choose sponsors belonging to this event.");
  const snapshot: EventOperationsSnapshot = { revision: input.expectedRevision + 1, document: input.document, updatedAt: new Date().toISOString() };
  const [saved] = await db.update(events).set({
    registrationPage: sql`jsonb_set(jsonb_set(coalesce(${events.registrationPage}, '{}'::jsonb), '{_operationsPrevious}', coalesce(${events.registrationPage}->'_operations','null'::jsonb)), '{_operations}', ${JSON.stringify(snapshot)}::jsonb)`,
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId), sql`coalesce((${events.registrationPage} #>> '{_operations,revision}')::bigint, 0) = ${input.expectedRevision}`)).returning({ id: events.id });
  if (!saved) throw new HttpError(409, "Another teammate saved changes. Reload the latest version before applying your recovered draft.");
  return { ...snapshot, ...(previous.revision ? { previous: { revision: previous.revision, document: previous.document, updatedAt: previous.updatedAt } } : {}) };
}
