import { and, asc, eq, sql } from "drizzle-orm";
import type { TicketInvitation, TicketInvitationBatchResult } from "../data/entities.ts";
import { db } from "./db.ts";
import { HttpError, newId, type RequestContext } from "./auth.ts";
import { notifyTicketInvitation } from "./notify.ts";
import { events, ticketInvitations, workspaces } from "./schema.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapInvitation(row: typeof ticketInvitations.$inferSelect): TicketInvitation {
  return {
    id: row.id,
    eventId: row.eventId,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    publicToken: row.publicToken,
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    registeredAt: row.registeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTicketInvitations(ctx: RequestContext, eventId: string): Promise<TicketInvitation[]> {
  return (await db.select().from(ticketInvitations).where(and(
    eq(ticketInvitations.workspaceId, ctx.workspaceId),
    eq(ticketInvitations.eventId, eventId),
  )).orderBy(asc(ticketInvitations.createdAt))).map(mapInvitation);
}

export async function sendTicketInvitations(
  ctx: RequestContext,
  eventId: string,
  recipients: Array<{ name: string; email: string }>,
  consentConfirmed: boolean,
  request: Request,
): Promise<TicketInvitationBatchResult> {
  if (!(["owner", "admin"] as const).includes(ctx.role as "owner" | "admin")) {
    throw new HttpError(403, "Only an owner or admin can send ticket invitations.");
  }
  if (!consentConfirmed) {
    throw new HttpError(400, "Confirm that these recipients expect event communication before sending.");
  }
  const normalized = [...new Map(recipients.map((recipient) => {
    const name = recipient.name.trim();
    const email = recipient.email.trim().toLowerCase();
    return [email, { name, email }] as const;
  })).values()].filter((recipient) => recipient.name && EMAIL.test(recipient.email));
  if (normalized.length === 0) throw new HttpError(400, "Add at least one valid name and email.");
  if (normalized.length > 500) throw new HttpError(400, "Send no more than 500 invitations at a time.");

  const [event] = await db.select({ event: events, timeZone: workspaces.timeZone }).from(events)
    .innerJoin(workspaces, eq(events.workspaceId, workspaces.id))
    .where(and(eq(events.id, eventId), eq(events.workspaceId, ctx.workspaceId))).limit(1);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  const generatedShareToken = crypto.randomUUID().replaceAll("-", "");
  const [shared] = await db.update(events).set({
    shareToken: sql`coalesce(${events.shareToken}, ${generatedShareToken})`,
    updatedAt: new Date(),
  }).where(eq(events.id, eventId)).returning({ shareToken: events.shareToken });
  if (!shared?.shareToken) throw new Error("The event ticket link could not be created.");
  const origin = (process.env.PUBLIC_APP_URL?.trim() || process.env.APP_ORIGIN?.trim() || new URL(request.url).origin).replace(/\/$/, "");

  const outcomes: Array<{ invitation: TicketInvitation; sent: boolean }> = [];
  for (let start = 0; start < normalized.length; start += 10) {
    const batch = normalized.slice(start, start + 10);
    outcomes.push(...await Promise.all(batch.map(async (recipient) => {
      const id = newId("tinv");
      const publicToken = crypto.randomUUID();
      await db.insert(ticketInvitations).values({
        id,
        workspaceId: ctx.workspaceId,
        eventId,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        publicToken,
        status: "pending",
      }).onConflictDoUpdate({
        target: [ticketInvitations.eventId, ticketInvitations.recipientEmail],
        set: {
          recipientName: recipient.name,
          status: sql`case when ${ticketInvitations.status} = 'registered' then 'registered'::invitation_delivery_status else 'pending'::invitation_delivery_status end`,
          updatedAt: new Date(),
        },
      });
      const [stored] = await db.select().from(ticketInvitations).where(and(
        eq(ticketInvitations.eventId, eventId),
        eq(ticketInvitations.recipientEmail, recipient.email),
      )).limit(1);
      if (!stored) throw new Error(`Invitation for ${recipient.email} could not be saved.`);
      const outcome = await notifyTicketInvitation({
        invitationId: stored.id,
        to: stored.recipientEmail,
        recipientName: stored.recipientName,
        eventTitle: event.event.title,
        startsAt: event.event.startsAt.toISOString(),
        timeZone: event.timeZone,
        invitationUrl: `${origin}/api/public/ticket-invitations/${encodeURIComponent(stored.publicToken)}`,
      });
      const sent = outcome.status === "sent";
      const now = new Date();
      const [updated] = await db.update(ticketInvitations).set({
        status: sent ? "sent" : "failed",
        sentAt: sent ? now : stored.sentAt,
        updatedAt: now,
      }).where(eq(ticketInvitations.id, stored.id)).returning();
      return { invitation: mapInvitation(updated!), sent };
    })));
  }
  return {
    attempted: outcomes.length,
    sent: outcomes.filter((outcome) => outcome.sent).length,
    failed: outcomes.filter((outcome) => !outcome.sent).length,
    invitations: outcomes.map((outcome) => outcome.invitation),
  };
}

export async function openTicketInvitation(token: string): Promise<string | null> {
  const [row] = await db.select({ invitation: ticketInvitations, event: events }).from(ticketInvitations)
    .innerJoin(events, eq(ticketInvitations.eventId, events.id))
    .where(eq(ticketInvitations.publicToken, token)).limit(1);
  if (!row || !row.event.shareToken || row.event.status === "cancelled") return null;
  if (row.invitation.status !== "registered") {
    await db.update(ticketInvitations).set({ status: "opened", openedAt: new Date(), updatedAt: new Date() })
      .where(eq(ticketInvitations.id, row.invitation.id));
  }
  return `/e/${encodeURIComponent(row.event.shareToken)}/tickets?invite=${encodeURIComponent(row.invitation.publicToken)}`;
}
