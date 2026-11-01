import { and, eq, inArray, lte } from "drizzle-orm";
import { PRIVATE_BETA_ORIGIN } from "../lib/privateBetaHost.ts";
import { db } from "./db.ts";
import { notifyVendorPaperworkReminder } from "./notify.ts";
import * as s from "./schema.ts";

function appOrigin(): string {
  return process.env.APP_ORIGIN ?? PRIVATE_BETA_ORIGIN;
}

export async function processDueVendorPaperworkReminders(): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const rows = await db.select({ booking: s.eventVendors, vendor: s.vendors, event: s.events, workspace: s.workspaces })
    .from(s.eventVendors)
    .innerJoin(s.vendors, eq(s.eventVendors.vendorId, s.vendors.id))
    .innerJoin(s.events, eq(s.eventVendors.eventId, s.events.id))
    .innerJoin(s.workspaces, eq(s.eventVendors.workspaceId, s.workspaces.id))
    .where(and(
      lte(s.eventVendors.paperworkNextReminderAt, now),
      inArray(s.events.status, ["draft", "published"]),
    ));
  let sent = 0;
  let failed = 0;
  let processed = 0;
  for (const row of rows) {
    if (!row.vendor.contactEmail || !row.booking.paperworkPublicToken || row.event.startsAt.getTime() <= now.getTime()) {
      await db.update(s.eventVendors).set({ paperworkNextReminderAt: null }).where(eq(s.eventVendors.id, row.booking.id));
      continue;
    }
    const missing = [
      row.booking.contractRequired && !row.booking.signedContractUrl ? "signed contract" : null,
      row.booking.coiRequired && !row.booking.coiFileUrl ? "certificate of insurance" : null,
    ].filter((value): value is string => Boolean(value));
    if (missing.length === 0) {
      await db.update(s.eventVendors).set({ paperworkNextReminderAt: null }).where(eq(s.eventVendors.id, row.booking.id));
      continue;
    }
    processed += 1;
    const reminderNumber = row.booking.paperworkReminderCount + 1;
    const outcome = await notifyVendorPaperworkReminder({
      bookingId: row.booking.id,
      reminderNumber,
      to: row.vendor.contactEmail,
      vendorName: row.vendor.name,
      organizerName: row.workspace.legalName || row.workspace.name,
      replyTo: null,
      eventTitle: row.event.title,
      missing,
      url: `${appOrigin()}/vendor-paperwork/${row.booking.paperworkPublicToken}`,
    });
    if (outcome.status === "sent") sent += 1;
    else failed += 1;
    const retryDelayDays = outcome.status === "sent" ? row.booking.paperworkReminderIntervalDays : 1;
    await db.update(s.eventVendors).set({
      paperworkReminderCount: reminderNumber,
      paperworkNextReminderAt: new Date(now.getTime() + Math.max(1, retryDelayDays) * 86_400_000),
      paperworkDeliveryError: outcome.status === "sent" ? null : outcome.reason,
      updatedAt: now,
    }).where(eq(s.eventVendors.id, row.booking.id));
  }
  return { processed, sent, failed };
}
