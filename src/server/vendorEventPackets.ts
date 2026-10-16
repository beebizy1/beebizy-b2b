import { and, eq } from "drizzle-orm";
import type { VendorEventPacketDraft, VendorEventPacketDelivery, VendorEventPacketResult } from "../data/vendorEventPackets.ts";
import { isVendorPacketEmail } from "../data/vendorEventPackets.ts";
import { formatInZone } from "../lib/datetime.ts";
import { HttpError, type RequestContext } from "./auth.ts";
import { db } from "./db.ts";
import { notifyVendorEventPacket } from "./notify.ts";
import { events, eventVendors, floorplan, runOfShow } from "./repos.ts";
import * as s from "./schema.ts";
import { vendorPacketAttachments, vendorPacketSnapshotFingerprint } from "./vendorPacketPdfs.ts";

export async function sendVendorEventPackets(ctx: RequestContext, eventId: string, draft: VendorEventPacketDraft): Promise<VendorEventPacketResult> {
  const event = await events.get(ctx, eventId);
  if (!event) throw new HttpError(404, "That event no longer exists.");
  const [bookings, cues, plans, [workspace]] = await Promise.all([
    eventVendors.list(ctx, eventId),
    runOfShow.list(ctx, eventId),
    floorplan.list(ctx, eventId),
    db.select({ name: s.workspaces.name, legalName: s.workspaces.legalName, timeZone: s.workspaces.timeZone }).from(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId)).limit(1),
  ]);
  if (!workspace) throw new HttpError(404, "That workspace no longer exists.");
  const requestedFloorplans = new Set(draft.floorplanIds);
  const selectedPlans = plans.filter((plan) => requestedFloorplans.has(plan.id));
  if (selectedPlans.length !== requestedFloorplans.size) throw new HttpError(409, "One of the selected floorplans is no longer available.");
  if (selectedPlans.reduce((total, plan) => total + plan.items.length, 0) > 2_000) throw new HttpError(400, "The selected floorplans contain too many objects to attach safely.");
  if (new Set(selectedPlans.flatMap((plan) => plan.items.flatMap((item) => item.imageUrl ? [item.imageUrl] : []))).size > 50) throw new HttpError(400, "Choose floorplans with no more than 50 uploaded images in one email.");
  const attachments = await vendorPacketAttachments(event, cues, selectedPlans, draft.includeRunOfShow, workspace.timeZone);
  const attachmentNames = attachments.map((attachment) => attachment.filename);
  const eventWhen = formatInZone(event.date, workspace.timeZone, "full");
  const eventLocation = event.locationRecord?.name ?? event.location ?? "Location to be confirmed";
  const contentFingerprint = vendorPacketSnapshotFingerprint({ draft, event, eventWhen, eventLocation, timeZone: workspace.timeZone, cues, plans: selectedPlans });
  const senderName = workspace.legalName || workspace.name;

  if (draft.testEmail) {
    if (!ctx.email || draft.testEmail.toLowerCase() !== ctx.email.toLowerCase()) throw new HttpError(403, "Send the test to your signed-in email address.");
    const outcome = await notifyVendorEventPacket({
      requestId: draft.requestId, vendorId: `test-${contentFingerprint.slice(0, 16)}`, to: draft.testEmail, vendorName: "Test recipient", senderName,
      replyTo: ctx.email, subject: `[TEST] ${draft.subject}`, message: draft.message, eventTitle: event.title,
      eventWhen, eventLocation, attachments,
    });
    const status = outcome.status === "sent" ? "sent" : "failed";
    await db.insert(s.eventHistory).values({
      id: `history_${crypto.randomUUID().replaceAll("-", "")}`, workspaceId: ctx.workspaceId, eventId,
      actorId: ctx.userId, resource: "vendor-packet", resourceId: `${draft.requestId}:test`, action: "created",
      summary: `Vendor event packet test ${status}`, before: null,
      after: { packetRequestId: draft.requestId, test: true, contentFingerprint, status, email: draft.testEmail, reason: outcome.status === "sent" ? null : outcome.reason, subject: draft.subject, attachmentNames, sentBy: ctx.email },
    });
    return { sent: status === "sent" ? 1 : 0, failed: status === "failed" ? 1 : 0, skipped: 0, attachmentNames, deliveries: [{ vendorId: null, vendorName: "Test recipient", email: draft.testEmail, status, reason: outcome.status === "sent" ? null : outcome.reason }] };
  }

  if (!draft.consentConfirmed) throw new HttpError(400, "Confirm the recipient list before sending.");
  const testAttempts = await db.select({ after: s.eventHistory.after }).from(s.eventHistory).where(and(eq(s.eventHistory.workspaceId, ctx.workspaceId), eq(s.eventHistory.eventId, eventId), eq(s.eventHistory.resource, "vendor-packet"), eq(s.eventHistory.resourceId, `${draft.requestId}:test`))).limit(20);
  if (!testAttempts.some((entry) => entry.after?.status === "sent" && entry.after?.contentFingerprint === contentFingerprint)) {
    throw new HttpError(409, "Send a successful test of this exact message and attachments before emailing vendors.");
  }
  const uniqueVendorIds = [...new Set(draft.vendorIds)];
  const bookingByVendor = new Map(bookings.map((booking) => [booking.vendorId, booking]));
  if (uniqueVendorIds.some((vendorId) => !bookingByVendor.has(vendorId))) throw new HttpError(409, "One of the selected vendors is no longer booked on this event.");
  if (uniqueVendorIds.some((vendorId) => bookingByVendor.get(vendorId)?.status === "cancelled")) throw new HttpError(409, "Cancelled vendors cannot receive an event packet.");
  const seenEmails = new Set<string>();
  const deliveries: VendorEventPacketDelivery[] = [];
  const recipients = uniqueVendorIds.map((vendorId) => bookingByVendor.get(vendorId)!);

  for (let offset = 0; offset < recipients.length; offset += 10) {
    const batch = recipients.slice(offset, offset + 10);
    const batchDeliveries = await Promise.all(batch.map(async (booking): Promise<VendorEventPacketDelivery> => {
      const vendor = booking.vendor;
      const email = vendor?.contactEmail?.trim() ?? "";
      if (!vendor || !isVendorPacketEmail(email)) return { vendorId: booking.vendorId, vendorName: vendor?.name ?? "Removed vendor", email, status: "skipped", reason: "No valid contact email" };
      const normalizedEmail = email.toLowerCase();
      if (seenEmails.has(normalizedEmail)) return { vendorId: vendor.id, vendorName: vendor.name, email, status: "skipped", reason: "Duplicate contact email" };
      seenEmails.add(normalizedEmail);
      const resourceId = `${draft.requestId}:${contentFingerprint}:${vendor.id}`;
      const prior = await db.select({ after: s.eventHistory.after }).from(s.eventHistory).where(and(eq(s.eventHistory.workspaceId, ctx.workspaceId), eq(s.eventHistory.eventId, eventId), eq(s.eventHistory.resource, "vendor-packet"), eq(s.eventHistory.resourceId, resourceId))).limit(10);
      if (prior.some((entry) => entry.after?.status === "sent")) return { vendorId: vendor.id, vendorName: vendor.name, email, status: "skipped", reason: "Already sent for this request" };
      const outcome = await notifyVendorEventPacket({ requestId: draft.requestId, vendorId: `${vendor.id}-${contentFingerprint.slice(0, 16)}`, to: email, vendorName: vendor.name, senderName, replyTo: ctx.email, subject: draft.subject, message: draft.message, eventTitle: event.title, eventWhen, eventLocation, attachments });
      const status = outcome.status === "sent" ? "sent" : "failed";
      const reason = outcome.status === "sent" ? null : outcome.reason;
      const messageId = `vm_${crypto.randomUUID().replaceAll("-", "")}`;
      await db.batch([
        db.insert(s.vendorMessages).values({ id: messageId, workspaceId: ctx.workspaceId, vendorId: vendor.id, eventId, direction: "outbound", senderName: ctx.email ?? "Event organizer", subject: draft.subject, body: draft.message, isRead: true, deliveredAt: status === "sent" ? new Date() : null, deliveryError: reason }),
        db.insert(s.eventHistory).values({ id: `history_${crypto.randomUUID().replaceAll("-", "")}`, workspaceId: ctx.workspaceId, eventId, actorId: ctx.userId, resource: "vendor-packet", resourceId, action: "created", summary: `Event packet ${status} for ${vendor.name}`, before: null, after: { packetRequestId: draft.requestId, contentFingerprint, vendorId: vendor.id, vendorName: vendor.name, email, status, reason, subject: draft.subject, attachmentNames, sentBy: ctx.email ?? ctx.userId } }),
      ]);
      return { vendorId: vendor.id, vendorName: vendor.name, email, status, reason };
    }));
    deliveries.push(...batchDeliveries);
  }
  return {
    sent: deliveries.filter((delivery) => delivery.status === "sent").length,
    failed: deliveries.filter((delivery) => delivery.status === "failed").length,
    skipped: deliveries.filter((delivery) => delivery.status === "skipped").length,
    attachmentNames,
    deliveries,
  };
}
