import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { bizyPartnerDraftSchema, bizyVendorScheduleSchema, type BizyPartnerGrant, type BizyPublicPayload } from "../data/bizyLink.ts";
import { pageAtApparelCutoff } from "../data/eventOperations.ts";
import { normalizeRegistrationPage, registrationAnswerFields } from "../data/registrationPage.ts";
import { publicRegistrationIdentity } from "../data/publicRegistrationIdentity.ts";
import { getEventOperations, readEventOperations } from "./eventOperations.ts";
import { HttpError, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { events, eventVendors, vendors, sponsorships, donationCampaigns } from "./schema.ts";
import { publicRsvpPartyQueries } from "./publicRsvpStore.ts";
import { registrationGuestDraftSchema, type RegistrationGuestDraft } from "../data/registrationGuestDraft.ts";
import { eventByShareToken } from "./repos.ts";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
function grants(page: unknown): Record<string, BizyPartnerGrant> { return (page as { _bizyPartners?: Record<string, BizyPartnerGrant> } | null)?._bizyPartners ?? {}; }
async function eventForLink(token: string) {
  const [event] = await db.select().from(events).where(eq(events.shareToken, token)).limit(1);
  if (!event || event.status === "cancelled" || event.status === "completed") throw new HttpError(404, "This event link is no longer active.");
  return event;
}
function activeGrant(page: unknown, access: string) {
  if (!/^[a-f0-9]{64}$/.test(access)) throw new HttpError(404, "This personal link is not available.");
  const grant = grants(page)[digest(access)];
  if (!grant || grant.revoked || new Date(grant.expiresAt).getTime() <= Date.now()) throw new HttpError(404, "This personal link has expired or was closed. Ask the organizer for a new link.");
  return grant;
}
async function resolvePartner(event: Awaited<ReturnType<typeof eventForLink>>, access: string) {
  const grant = activeGrant(event.registrationPage, access);
  const source = grant.role === "sponsor" ? sponsorships : eventVendors;
  const [resource] = await db.select({ id: source.id }).from(source).where(and(eq(source.id, grant.resourceId), eq(source.eventId, event.id), eq(source.workspaceId, event.workspaceId))).limit(1);
  if (!resource) throw new HttpError(404, "This partnership is no longer active. Ask the organizer for a new link.");
  return grant;
}
export async function getBizyPartnerDraft(token: string, access: string): Promise<RegistrationGuestDraft | null> {
  const event = await eventForLink(token); await resolvePartner(event, access);
  const value = (event.registrationPage as { _bizyPartnerDrafts?: Record<string, unknown> })?._bizyPartnerDrafts?.[digest(access)];
  const parsed = registrationGuestDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export async function saveBizyPartnerDraft(token: string, access: string, value: unknown) {
  const event = await eventForLink(token); await resolvePartner(event, access);
  const draft = registrationGuestDraftSchema.parse(value); const hash = digest(access);
  if (draft.revision > Date.now() + 300000) throw new HttpError(400, "Your device clock is ahead. Keep this page open.");
  await db.update(events).set({ registrationPage: sql`jsonb_set(coalesce(${events.registrationPage},'{}'::jsonb), '{_bizyPartnerDrafts}', coalesce(${events.registrationPage}->'_bizyPartnerDrafts','{}'::jsonb) || jsonb_build_object(${hash}::text,${JSON.stringify(draft)}::jsonb))` }).where(and(eq(events.id, event.id), sql`coalesce((${events.registrationPage} #>> ARRAY['_bizyPartnerDrafts',${hash},'revision'])::bigint,0) < ${draft.revision}`, sql`${events.registrationPage} #>> ARRAY['_bizyPartners',${hash},'revoked'] = 'false'`));
  return getBizyPartnerDraft(token, access);
}
export async function listBizyPartners(ctx: RequestContext, eventId: string) {
  await getEventOperations(ctx, eventId);
  const [event] = await db.select({ page: events.registrationPage }).from(events).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId)));
  return Object.values(grants(event?.page)).map(({ id, name, role, expiresAt, revoked, submitted, vendorNotes }) => ({ id, name, role, expiresAt, revoked, submitted, vendorNotes }));
}
export async function createBizyPartner(ctx: RequestContext, eventId: string, value: unknown) {
  await getEventOperations(ctx, eventId);
  const input = bizyPartnerDraftSchema.parse(value);
  const [event] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event?.shareToken) throw new HttpError(400, "Enable event sharing before creating personal Bizy Links.");
  if (Object.keys(grants(event.registrationPage)).length >= 100) throw new HttpError(400, "This event has reached its personal link limit. Contact Beebizy support.");
  let name: string;
  if (input.role === "sponsor") {
    const [sponsor] = await db.select().from(sponsorships).where(and(eq(sponsorships.id, input.resourceId), eq(sponsorships.eventId, eventId), eq(sponsorships.workspaceId, ctx.workspaceId))).limit(1);
    if (!sponsor) throw new HttpError(404, "Choose a sponsor in this event.");
    name = sponsor.companyName;
  } else {
    const [booking] = await db.select({ name: vendors.name }).from(eventVendors).innerJoin(vendors, eq(vendors.id, eventVendors.vendorId)).where(and(eq(eventVendors.id, input.resourceId), eq(eventVendors.eventId, eventId), eq(eventVendors.workspaceId, ctx.workspaceId))).limit(1);
    if (!booking) throw new HttpError(404, "Choose a vendor in this event.");
    name = booking.name;
  }
  const access = randomBytes(32).toString("hex"); const hash = digest(access);
  const grant: BizyPartnerGrant = { id: randomBytes(12).toString("hex"), name, role: input.role, resourceId: input.resourceId, seatLimit: input.seatLimit, expiresAt: new Date(Math.max(Date.now(), (event.endsAt ?? event.startsAt).getTime()) + 30 * 86400000).toISOString(), revoked: false, submitted: false, registrationIds: [] };
  await db.update(events).set({ registrationPage: sql`jsonb_set(coalesce(${events.registrationPage}, '{}'::jsonb), '{_bizyPartners}', coalesce(${events.registrationPage}->'_bizyPartners','{}'::jsonb) || jsonb_build_object(${hash}::text,${JSON.stringify(grant)}::jsonb))` }).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId)));
  return { ...grant, path: `/bizy/${event.shareToken}?access=${access}` };
}
export async function revokeBizyPartner(ctx: RequestContext, eventId: string, id: string) {
  await getEventOperations(ctx, eventId);
  const [event] = await db.select({ page: events.registrationPage }).from(events).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId)));
  const pair = Object.entries(grants(event?.page)).find(([, grant]) => grant.id === id);
  if (!pair) throw new HttpError(404, "That personal link no longer exists.");
  await db.update(events).set({ registrationPage: sql`jsonb_set(${events.registrationPage}, ARRAY['_bizyPartners',${pair[0]},'revoked'], 'true'::jsonb)` }).where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId)));
  return { ok: true };
}
export async function publicBizyLink(token: string, access?: string): Promise<BizyPublicPayload> {
  const event = await eventForLink(token);
  const page = normalizeRegistrationPage(event.registrationPage);
  const [campaigns, shared] = await Promise.all([
    db.select({ title: donationCampaigns.title, token: donationCampaigns.publicToken }).from(donationCampaigns).where(and(eq(donationCampaigns.eventId, event.id), eq(donationCampaigns.workspaceId, event.workspaceId), eq(donationCampaigns.isActive, true))),
    eventByShareToken(token),
  ]);
  const result: BizyPublicPayload = { eventTitle: event.title, guestTypes: page.registrationTypes, contributionLinks: campaigns };
  if (shared) Object.assign(result, { eventDate: shared.event.date, eventEndDate: shared.event.endDate, timeZone: shared.timeZone, location: shared.event.location });
  if (!access) return result;
  const grant = await resolvePartner(event, access);
  const operations = await readEventOperations(event.id);
  const questions = pageAtApparelCutoff(page, operations.document.apparel).questions.filter(question => operations.document.apparel.questionIds.includes(question.id));
  result.partner = { name: grant.name, role: grant.role, seatLimit: grant.seatLimit, submitted: grant.submitted, questions };
  if (grant.role === "vendor") {
    const [booking] = await db.select({ arrivalTime: eventVendors.arrivalTime, serviceTime: eventVendors.serviceTime, departureTime: eventVendors.departureTime, notes: eventVendors.notes }).from(eventVendors).where(and(eq(eventVendors.id, grant.resourceId), eq(eventVendors.eventId, event.id), eq(eventVendors.workspaceId, event.workspaceId))).limit(1);
    if (!booking) throw new HttpError(404, "This booking is no longer active.");
    result.partner.schedule = { arrivalTime: booking.arrivalTime ?? "", serviceTime: booking.serviceTime ?? "", departureTime: booking.departureTime ?? "", notes: grant.vendorNotes ?? "" };
  }
  return result;
}
export async function submitBizyPartner(token: string, access: string, value: unknown) {
  const event = await eventForLink(token); const grant = await resolvePartner(event, access); const hash = digest(access);
  if (grant.role === "vendor") {
    const fields = bizyVendorScheduleSchema;
    const input = z.object({ schedule: fields, expected: fields }).parse(value);
    const result = await db.execute<{ id: string }>(sql`with authorized as (
      select id from events where id=${event.id} and workspace_id=${event.workspaceId}
      and registration_page #>> ARRAY['_bizyPartners',${hash},'revoked'] = 'false'
      and coalesce(registration_page #>> ARRAY['_bizyPartners',${hash},'vendorNotes'],'')=${input.expected.notes}
      and (registration_page #>> ARRAY['_bizyPartners',${hash},'expiresAt'])::timestamptz > clock_timestamp() for update
    ), saved as (
      update event_vendors set arrival_time=${input.schedule.arrivalTime}, service_time=${input.schedule.serviceTime}, departure_time=${input.schedule.departureTime}
      where id=${grant.resourceId} and event_id=${event.id} and workspace_id=${event.workspaceId} and exists(select 1 from authorized)
      and coalesce(arrival_time,'')=${input.expected.arrivalTime} and coalesce(service_time,'')=${input.expected.serviceTime} and coalesce(departure_time,'')=${input.expected.departureTime} returning id
    ) update events set registration_page=jsonb_set(registration_page, ARRAY['_bizyPartners',${hash},'vendorNotes'],${JSON.stringify(input.schedule.notes)}::jsonb)
      where id=${event.id} and exists(select 1 from saved) returning id`);
    if (!result.rows.length) throw new HttpError(409, "The organizer changed this schedule or closed the link. Reload the latest details before applying your recovered draft.");
    return { ok: true };
  }
  if (grant.submitted) return { ok: true, registered: grant.registrationIds.length, alreadySubmitted: true };
  const input = z.object({ people: z.array(z.object({ firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120), email: z.union([z.string().email().max(320), z.literal("")]).default(""), answers: z.record(z.string().max(200), z.string().max(1000)).default({}) })).min(1).max(grant.seatLimit) }).parse(value);
  const emails = input.people.map(person => person.email.trim().toLowerCase()).filter(Boolean);
  if (new Set(emails).size !== emails.length) throw new HttpError(400, "Use different emails for each guest or leave optional emails blank.");
  const { document } = await readEventOperations(event.id);
  const questions = pageAtApparelCutoff(normalizeRegistrationPage(event.registrationPage), document.apparel).questions.filter(question => document.apparel.questionIds.includes(question.id));
  const people = input.people.map((person, index) => {
    const identity = publicRegistrationIdentity(person); const stableId = digest(`${grant.id}:${index}`).slice(0, 28);
    let answers;
    try { answers = registrationAnswerFields(questions.map(question => ({ ...question, audience: "both" })), person.answers); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Check the apparel answers."); }
    return { name: identity.name, email: person.email.trim().toLowerCase() || null, fields: [...identity.fields, ...answers, { label: "Sponsor", value: grant.name }], guestId: `att_bizy_${stableId}`, registrationId: `reg_bizy_${stableId}` };
  });
  const updatedGrant = { ...grant, submitted: true, registrationIds: people.map(person => person.registrationId) };
  // Every grant has stable per-seat IDs. Repeated/concurrent submission rolls back
  // at the unique registration key, then returns the original submission.
  // Use the transaction's start time so an expiry cannot split a roster halfway
  // through insertion. Event and sponsor locks hold permission stable throughout.
  const authorization = sql`exists(select 1 from events where id=${event.id} and registration_page #>> ARRAY['_bizyPartners',${hash},'revoked'] = 'false' and registration_page #>> ARRAY['_bizyPartners',${hash},'submitted'] = 'false' and (registration_page #>> ARRAY['_bizyPartners',${hash},'expiresAt'])::timestamptz > current_timestamp) and exists(select 1 from sponsorships where id=${grant.resourceId} and event_id=${event.id} and workspace_id=${event.workspaceId})`;
  const queries = publicRsvpPartyQueries({ eventId: event.id, workspaceId: event.workspaceId, segment: "Sponsor guest", organization: grant.name, partyId: `bizy_${grant.id}`, people, authorization });
  try {
    const result = await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(hashtext(${event.id}))`),
      // Lock the event row before checking/revoking tokens or editing capacities.
      db.execute(sql`select id from events where id=${event.id} for update`),
      db.execute(sql`select id from sponsorships where id=${grant.resourceId} and event_id=${event.id} and workspace_id=${event.workspaceId} for key share`),
      ...queries.map(query => db.execute(query)),
      db.update(events).set({ registrationPage: sql`jsonb_set(${events.registrationPage}, ARRAY['_bizyPartners',${hash}], ${JSON.stringify(updatedGrant)}::jsonb)` }).where(and(eq(events.id, event.id), authorization)).returning({ id: events.id }),
    ]);
    if ((result.at(-1) as Array<{ id: string }>).length) return { ok: true, registered: people.length };
  } catch (error) {
    const current = await resolvePartner(await eventForLink(token), access);
    if (current.submitted) return { ok: true, registered: current.registrationIds.length, alreadySubmitted: true };
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new HttpError(409, "One guest is already registered. Check with the organizer before resubmitting.");
    if (code === "23514") throw new HttpError(409, "There is not enough event capacity for this roster. No guests were added.");
    throw error;
  }
  const saved = await resolvePartner(await eventForLink(token), access);
  if (!saved.submitted) throw new HttpError(409, "Your roster could not be saved. Please retry.");
  return { ok: true, registered: saved.registrationIds.length, alreadySubmitted: true };
}
