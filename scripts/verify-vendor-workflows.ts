/** Real database smoke test. Creates and removes only its own isolated fixture workspace.
 * All email calls are intercepted; this script never sends vendor emails.
 * Run: node --env-file=<server-env> --import tsx scripts/verify-vendor-workflows.ts
 */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema as s } from "../src/server/db";
import * as repos from "../src/server/repos";
import type { RequestContext } from "../src/server/auth";

const suffix = crypto.randomUUID();
const ctx: RequestContext = { userId: `qa_${suffix}`, workspaceId: `qa_vendor_${suffix}`, role: "owner" };
const fetchBefore = globalThis.fetch;
const emailBodies: Array<{ text: string }> = [];
let rejectEmail = false;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://api.resend.com/emails") {
    emailBodies.push(JSON.parse(String(init?.body)));
    return new Response(rejectEmail ? "Controlled failure" : '{"id":"qa-only"}', { status: rejectEmail ? 503 : 200 });
  }
  return fetchBefore(input, init);
};
process.env.RESEND_API_KEY = "qa-intercepted-not-a-real-key";
process.env.EMAIL_FROM = "Beebizy QA <qa@example.com>";

try {
  await db.insert(s.workspaces).values({ id: ctx.workspaceId, name: "Disposable vendor workflow QA" });
  const event = await repos.events.create(ctx, { title: "Disposable QA event", date: "2026-12-01T18:00:00.000Z", category: "Conference", status: "published" });
  const vendor = await repos.vendors.create(ctx, { name: "QA Venue", category: "Venue", contactEmail: "qa@example.com" });
  const rfp = await repos.rfps.create(ctx, event.id, {
    title: "QA brief", vendorCategory: "Venue", targetType: "venue", description: "Stage and chairs",
    eventDate: "2026-12-01T12:00:00.000Z", startTime: "10:00", endTime: "17:00", headcount: 100,
    city: "Santa Clara", location: "QA venue", budgetMinCents: 10000, budgetMaxCents: 20000,
    deadline: "2026-11-15T23:59:00.000Z",
    eventType: "Conference with room block", roomBlockRequired: true, roomsRequired: 50,
    checkInDate: "2026-11-30T12:00:00.000Z", checkOutDate: "2026-12-03T12:00:00.000Z",
    foodBeverageSpendCents: 3500000, ancillarySpendCents: 1000000, ancillarySpendNotes: "Parking and AV",
    spaceRequirements: [
      { id: "registration", purpose: "Registration", date: "2026-11-30T12:00:00.000Z", startTime: "15:00", endTime: "18:00", capacity: 100, notes: "Foyer" },
      { id: "breakfast", purpose: "Breakfast", date: "2026-12-01T12:00:00.000Z", startTime: "07:30", endTime: "09:00", capacity: 100, notes: null },
      { id: "meeting", purpose: "Meeting", date: "2026-12-01T12:00:00.000Z", startTime: "09:00", endTime: "12:00", capacity: 100, notes: null },
      { id: "lunch", purpose: "Lunch", date: "2026-12-01T12:00:00.000Z", startTime: "12:00", endTime: "13:30", capacity: 100, notes: null },
    ],
  });
  const editedRfp = await repos.rfps.update(ctx, event.id, rfp.id, { roomsRequired: 55 });
  assert.equal(editedRfp.roomsRequired, 55);
  const invitation = await repos.rfps.inviteVendor(ctx, event.id, rfp.id, vendor.id);
  assert.ok(invitation.deliveredAt);
  const publicBrief = await repos.publicRfp(invitation.publicToken);
  assert.equal(publicBrief?.rfp.city, "Santa Clara");
  assert.equal(publicBrief?.rfp.roomsRequired, 55);
  assert.equal(publicBrief?.rfp.spaceRequirements.length, 4);
  assert.equal(publicBrief?.rfp.foodBeverageSpendCents, 3500000);
  const proposal = await repos.publicRfpResponse(invitation.publicToken, { contactName: "QA", contactEmail: "qa@example.com", quotedAmountCents: 15000, notes: "All included" });
  await repos.rfps.setResponseStatus(ctx, event.id, rfp.id, proposal.id, "accepted");
  const repeated = await repos.publicRfpResponse(invitation.publicToken, { notes: "Must not overwrite" });
  assert.equal(repeated.status, "accepted");
  assert.equal(repeated.notes, "All included");
  assert.equal((await repos.rfps.list(ctx, event.id))[0]?.responses.length, 1);
  await assert.rejects(() => repos.rfps.inviteVendor({ ...ctx, workspaceId: "unrelated-workspace" }, event.id, rfp.id, vendor.id));
  const message = await repos.vendorMessages.create(ctx, vendor.id, { content: "Can you confirm setup?", senderName: "QA organizer" });
  assert.ok(message.deliveredAt);
  const privateUrl = emailBodies.at(-1)!.text.match(/https?:\/\/\S+\/vendor-conversation\/[^\s]+/)?.[0];
  assert.ok(privateUrl);
  const token = privateUrl.split("/").at(-1)!;
  await repos.publicVendorReply(token, { content: "Setup confirmed." });
  assert.equal((await repos.vendorMessages.list(ctx, vendor.id)).at(-1)?.content, "Setup confirmed.");
  assert.equal((await repos.vendors.get(ctx, vendor.id))?.unreadCount, 1);
  assert.equal((await repos.vendorMessages.list({ ...ctx, workspaceId: "unrelated-workspace" }, vendor.id)).length, 0);
  rejectEmail = true;
  const failed = await repos.rfps.inviteVendor(ctx, event.id, rfp.id, vendor.id);
  assert.equal(failed.deliveredAt, null);
  assert.ok(failed.deliveryError);
  await repos.vendors.update(ctx, vendor.id, { contactEmail: "changed@example.com" });
  assert.equal(await repos.publicVendorConversation(token), null);
  assert.equal(await repos.publicRfp(invitation.publicToken), null);
  rejectEmail = false;
  const replacement = await repos.rfps.inviteVendor(ctx, event.id, rfp.id, vendor.id);
  assert.notEqual(replacement.publicToken, invitation.publicToken);
  await repos.rfps.update(ctx, event.id, rfp.id, { status: "closed" });
  assert.equal(await repos.publicRfp(replacement.publicToken), null);
  console.log("PASS: RFP persistence, proposal idempotency, tenancy, vendor replies, delivery failures and private-link revocation.");
} finally {
  globalThis.fetch = fetchBefore;
  await db.delete(s.workspaces).where(eq(s.workspaces.id, ctx.workspaceId));
  console.log("Removed only the disposable QA workspace and its fixture rows.");
}
