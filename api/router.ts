/**
 * The API.
 *
 * One Vercel Function with a small router rather than forty files: the surface is uniform
 * (`/api/<resource>/<id>/<sub>`), so forty near-identical route files would be forty
 * places for the authorization check to be forgotten. Here it happens once, at the top,
 * and no handler can run without a resolved workspace.
 *
 * Runs on Node (not edge) because Clerk token verification and the Neon driver both want
 * it, and because 300s is plenty for a request that should take 50ms.
 */

import { authorize, HttpError, requireBeebizyOperator, type RequestContext } from "../src/server/auth.ts";
import { accountExperienceForEmail, canSwitchAccountExperience } from "../src/data/accountExperience.ts";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage } from "../src/data/registrationPage.ts";
import * as repos from "../src/server/repos.ts";
import { eventByShareToken } from "../src/server/repos.ts";
import { continuePlanningChat, generatePlanningSuggestions } from "../src/server/planner.ts";
import { parseFloorplanDraft } from "../src/data/floorplan.ts";
import { PLANNING_LIMITS } from "../src/data/planner.ts";
import { fetchGoogleSheetCsv } from "../src/server/imports.ts";
import { feedbackDraftSchema, feedbackValidationMessage } from "../src/data/feedback.ts";
import { isBeebizyOperator } from "../src/lib/internalAccess.ts";
import { effectivePlan, planHasCapability, type PlanCapability } from "../src/data/plans.ts";
import { createCheckoutSession, createPortalSession, handleStripeWebhook } from "../src/server/billing.ts";
import {
  createPublicTicketCheckout,
  createBidderWalletSetup,
  createStripeConnectOnboarding,
  getStripeConnectStatus,
  listTicketOrders,
  refundTicketOrder,
  closeAuctionItem,
  offerAuctionSecondChance,
  settleDueAuctionItems,
  listAuctionOrders,
  refundAuctionOrder,
  getPublicTicketOrderStatus,
  buildBidderBills,
  sendBidderBills,
  publicBidderBill,
  createBidderBillCheckout,
  refundBidderBill,
  publicFundraisingReceipt,
  createDonationCheckout,
  publicDonationStatus,
  sendDueBidderBillReminders,
} from "../src/server/commercePayments.ts";
import { listTicketInvitations, openTicketInvitation, sendTicketInvitations } from "../src/server/ticketInvitations.ts";
import { z, ZodError } from "zod";
import { put } from "@vercel/blob";
import { rfpDraftPatchSchema, rfpDraftSchema, rfpResponseSchema, publicProposalSchema } from "../src/data/rfp.ts";
import {
  createAuctionCategory,
  extendAuctionItem,
  reopenAuctionItem,
  fundraisingDashboard,
  getFundraisingOrganizationProfile,
  listAuctionCategories,
  listItemSubmissions,
  publicItemIntake,
  submitPublicItem,
  updateFundraisingOrganizationProfile,
  updateItemSubmission,
  publicBidderProfile,
  toggleAuctionWatch,
  createPublicPledge,
  createDonationCampaign,
  listDonationCampaigns,
  publicDonationCampaign,
  fundraisingReports,
  previewFundraisingBroadcast,
  sendFundraisingBroadcast,
  sendDueClosingAlerts,
  sendAllDueClosingAlerts,
  recordLiveAuctionSale,
  undoLiveAuctionSale,
  buyNowAuctionItem,
} from "../src/server/fundraisingUx.ts";

export const config = { runtime: "nodejs", api: { bodyParser: false } };

/* ------------------------------------------------------------------- bridge */

/**
 * Vercel's Node runtime hands this file a Node `IncomingMessage`, not a Web `Request` —
 * which is why an earlier version died on `new URL(request.url)`: `req.url` is a path
 * (`/api/events`), and `URL` needs an origin.
 *
 * The router below is written against Web `Request`/`Response` so it stays portable and
 * can be exercised with plain objects in a test. This converts at the edge of the file
 * and nowhere else.
 */
interface NodeRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (chunk?: unknown) => void): void;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function toWebRequest(req: NodeRequest, rawBody: Uint8Array): Request {
  const host = (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) ?? "localhost";
  const proto = (Array.isArray(req.headers["x-forwarded-proto"]) ? req.headers["x-forwarded-proto"][0] : req.headers["x-forwarded-proto"]) ?? "http";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.from(rawBody),
  });
}

async function readRawBody(req: NodeRequest): Promise<Uint8Array> {
  // Do not touch Vercel's lazy `req.body` helper. Accessing it parses JSON and destroys
  // the exact byte sequence Stripe signed. Reading the stream preserves that signature.
  return new Promise<Uint8Array>((resolve) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => {
      if (chunk instanceof Uint8Array) chunks.push(chunk);
      else if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(new Uint8Array()));
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // The API is same-origin only; nothing here is meant to be embedded elsewhere.
      "cache-control": "no-store",
    },
  });

const notFound = () => json({ error: "No such endpoint." }, 404);

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
}

/* --------------------------------------------------------------- public routes */

const LEAD_FIELDS = ["name", "email", "company", "phone", "volume", "plan", "notes"] as const;
const LEAD_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/*
 * What the enquirer wrote is the most useful part of the message, and 200 characters
 * cuts it off mid-sentence. Everything else is a short identifying field.
 */
const LEAD_MAX_LENGTH: Partial<Record<(typeof LEAD_FIELDS)[number], number>> = { notes: 2_000 };

async function handleLead(request: Request): Promise<Response> {
  const body = await readBody(request);
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const lead = Object.fromEntries(
    LEAD_FIELDS.flatMap((field) => {
      const value = body[field];
      const limit = LEAD_MAX_LENGTH[field] ?? 200;
      return typeof value === "string" && value.trim() ? [[field, value.trim().slice(0, limit)]] : [];
    }),
  ) as Partial<Record<(typeof LEAD_FIELDS)[number], string>>;

  const missing = (["name", "email", "company"] as const).filter((field) => !lead[field]);
  if (missing.length > 0) return json({ error: `Missing: ${missing.join(", ")}` }, 400);
  if (!LEAD_EMAIL.test(lead.email!)) return json({ error: "That email doesn't look right" }, 400);

  const record = { at: new Date().toISOString(), ...lead, userAgent: request.headers.get("user-agent") };
  console.log(`LEAD ${JSON.stringify(record)}`);

  if (!process.env.MAIL_TO?.trim() || !process.env.RESEND_API_KEY?.trim()) {
    console.error("LEAD_EMAIL_NOT_CONFIGURED");
    /* Nothing the sender does will configure the mail provider, so "try again shortly"
     * only costs them their typing twice. Give them the address instead. */
    return json(
      { error: "We couldn’t send that automatically. Please email hello@beebizy.com and we will pick it up right away." },
      503,
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      /*
       * `??` only catches an unset variable. A blank one - which is what saving the
       * dashboard field empty leaves behind - is a string, so it passed straight through
       * and Resend was asked to send from "".
       */
      from: process.env.MAIL_FROM?.trim() || "Beebizy <onboarding@resend.dev>",
      to: [process.env.MAIL_TO],
      reply_to: lead.email,
      subject: lead.plan ? `${lead.plan} enquiry - ${lead.company}` : `New demo request - ${lead.company}`,
      text: [
        `Plan: ${lead.plan ?? "-"}`,
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        `Company: ${lead.company}`,
        `Phone: ${lead.phone ?? "-"}`,
        `Events: ${lead.volume ?? "-"} per year`,
        "",
        "What they are planning:",
        lead.notes ?? "-",
        "",
        `Received: ${record.at}`,
      ].join("\n"),
    }),
  });
  if (!response.ok) {
    /*
     * The detail matters here: "API key is invalid" and "domain not verified" are both
     * silent 502s to the caller, and both are fixed in a dashboard rather than by the
     * person filling in the form. Logging the provider's own words is what turned a
     * "mail is down" guess into a one-line cause.
     */
    console.error("LEAD_EMAIL_FAILED", response.status, await response.text());
    /*
     * Telling someone to try again invites them to retype everything for a second
     * failure, because nothing they can do affects a misconfigured mail provider. They
     * get the address instead, so the enquiry still reaches Beebizy.
     */
    return json(
      /* The published contact address, not MAIL_TO - the destination may be an internal
       * inbox, and a 502 body is public. */
      { error: "We couldn’t send that automatically. Please email hello@beebizy.com and we will pick it up right away." },
      502,
    );
  }

  return json({ ok: true });
}

/**
 * Routes a guest can reach with no session. Deliberately tiny, and each one takes the
 * share token as the only credential — which is why the token is a random UUID rather
 * than something guessable.
 */
async function handlePublic(segments: string[], method: string, request: Request): Promise<Response | null> {
  if (segments[0] === "lead") {
    if (method !== "POST") return json({ error: "Method not allowed" }, 405);
    return handleLead(request);
  }

  if (segments[0] === "fundraising" && segments[1] === "maintenance") {
    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return json({ error: "Fundraising maintenance is not configured." }, 503);
    if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
    const [eventsChecked, reminders] = await Promise.all([sendAllDueClosingAlerts(), sendDueBidderBillReminders()]);
    return json({ ok: true, eventsChecked, reminders });
  }

  if (segments[0] === "billing" && segments[1] === "webhook") {
    if (method !== "POST") return json({ error: "Method not allowed" }, 405);
    return json(await handleStripeWebhook(request));
  }

  // Public event read and share-link registration actions.
  if (segments[0] === "public" && segments[1] === "events" && segments[2] && method === "POST") {
    if (segments[3] === "registrations") return json(await repos.publicRegistration(segments[2], await readBody(request)), 201);
    if (segments[3] === "volunteers") return json(await repos.publicVolunteerSignup(segments[2], await readBody(request)), 201);
    if (segments[3] === "tickets" && segments[4] === "checkout") {
      const input = z.object({
        ticketTypeId: z.string().min(1).max(100),
        buyerName: z.string().trim().min(1).max(160),
        buyerEmail: z.string().trim().email().max(320),
        buyerPhone: z.string().trim().min(10).max(40),
        gradeTags: z.array(z.enum(["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Alumni", "Faculty/Staff", "Friend of school"])).max(5).default([]),
        quantity: z.number().int().min(1).max(100),
        guestNames: z.array(z.string().trim().min(1).max(160)).max(100),
        donationAddOnCents: z.number().int().min(0).max(10_000_000).default(0),
        benefitsDeclined: z.boolean().default(false),
        autoChargeOptIn: z.boolean().default(false),
      }).parse(await readBody(request));
      return json(await createPublicTicketCheckout(segments[2], input, request), 201);
    }
  }
  if (segments[0] === "public" && segments[1] === "events" && segments[2] && method === "GET" && !segments[3]) {
    const shared = await eventByShareToken(segments[2]);
    if (!shared) return json({ error: "This link is no longer active." }, 404);
    const page = normalizeRegistrationPage(shared.event.registrationPage);

    const [agenda, tickets, volunteerNeeds] = await Promise.all([
      page.showAgenda ? repos.publicAgenda(shared.event.id) : Promise.resolve([]),
      repos.publicTickets(shared.event.id),
      page.showVolunteerSignup ? repos.publicVolunteerNeeds(shared.event.id) : Promise.resolve([]),
    ]);
    // Only what the Share section promises is visible. Budgets, vendors, guest lists and
    // bids are not in this payload at all, rather than filtered out in the client. The
    // agenda and tickets ride along because the guest has no session to fetch them with.
    return json({ event: shared.event, agenda, tickets, volunteerNeeds, timeZone: shared.timeZone });
  }
  if (
    segments[0] === "public" && segments[1] === "events" && segments[2] &&
    segments[3] === "ticket-orders" && segments[4] && method === "GET"
  ) {
    const status = await getPublicTicketOrderStatus(segments[2], segments[4]);
    return status ? json(status) : json({ error: "This ticket order is not available." }, 404);
  }

  if (segments[0] === "public" && segments[1] === "attendance" && segments[2] && segments.length === 3) {
    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    const dashboard = await repos.publicAttendanceDashboard(segments[2]);
    return dashboard ? json(dashboard) : json({ error: "This attendance dashboard link is no longer active." }, 404);
  }

  if (segments[0] === "public" && segments[1] === "auctions" && segments[2]) {
    if (segments[3] === "intake" && segments.length === 4 && method === "GET") {
      const intake = await publicItemIntake(segments[2]);
      return intake ? json(intake) : json({ error: "This donation link is no longer active." }, 404);
    }
    if (segments[3] === "intake" && segments.length === 4 && method === "POST") {
      return json(await submitPublicItem(segments[2], await readBody(request) as never), 201);
    }
    if (segments[3] === "intake" && segments[4] === "upload" && segments.length === 5 && method === "POST") {
      if (!await publicItemIntake(segments[2])) return json({ error: "This donation link is no longer active." }, 404);
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "Auction image storage is not configured yet.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
      if (!file.type.startsWith("image/")) throw new HttpError(400, "Auction photos must be image files.");
      if (file.size > 4_000_000) throw new HttpError(400, "Auction photos must be smaller than 4 MB each.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "auction-image";
      const blob = await put(`auction/intake/${segments[2]}/${safeName}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
      return json({ url: blob.url });
    }
    if (method === "GET" && segments.length === 3) {
      await sendDueClosingAlerts(segments[2]);
      await settleDueAuctionItems(segments[2], request);
      const auction = await repos.publicAuction(segments[2]);
      return auction ? json(auction) : json({ error: "This auction link is no longer active." }, 404);
    }
    if (method === "POST" && segments[3] === "bidders" && segments.length === 4) {
      return json(await repos.registerPublicAuctionBidder(segments[2], await readBody(request)), 201);
    }
    if (segments[3] === "bidders" && segments[4] && segments.length === 5 && method === "GET") {
      const bidder = await publicBidderProfile(segments[2], segments[4]);
      return bidder ? json(bidder) : json({ error: "This bidder registration is not available." }, 404);
    }
    if (segments[3] === "bidders" && segments[4] && segments[5] === "wallet" && segments.length === 6 && method === "POST") {
      return json(await createBidderWalletSetup(segments[2], segments[4], request), 201);
    }
    if (segments[3] === "bidders" && segments[4] && segments[5] === "watches" && segments[6] && segments.length === 7 && method === "POST") {
      const body = await readBody(request);
      return json(await toggleAuctionWatch(segments[2], segments[4], segments[6], body.watched !== false));
    }
    if (segments[3] === "bidders" && segments[4] && segments[5] === "pledges" && segments.length === 6 && method === "POST") {
      const body = await readBody(request);
      return json(await createPublicPledge(
        segments[2], segments[4], Number(body.amountCents ?? 0), body.channel === "in_room" ? "in_room" : "remote",
      ), 201);
    }
    if (
      method === "POST" && segments[3] === "bidders" && segments[4] &&
      segments[5] === "items" && segments[6] && segments[7] === "bids" && segments.length === 8
    ) {
      const body = await readBody(request);
      if (typeof body.maximumAmountCents !== "number") throw new HttpError(400, "maximumAmountCents is required.");
      return json(await repos.placePublicAuctionBid(
        segments[2],
        segments[4],
        segments[6],
        body.maximumAmountCents,
      ), 201);
    }
    if (method === "POST" && segments[3] === "bidders" && segments[4] && segments[5] === "items" && segments[6] && segments[7] === "buy-now" && segments.length === 8) {
      return json(await buyNowAuctionItem(segments[2], segments[4], segments[6]), 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (segments[0] === "public" && segments[1] === "auction-donors" && segments[2]) {
    const donor = await repos.publicAuctionDonor(segments[2]);
    if (!donor) return json({ error: "This donation link is no longer active." }, 404);
    if (method === "GET" && segments.length === 3) return json(donor);
    if (method === "POST" && segments[3] === "donations" && segments.length === 4) {
      return json(await repos.submitPublicAuctionDonation(segments[2], await readBody(request)), 201);
    }
    if (method === "POST" && segments[3] === "upload" && segments.length === 4) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "Auction image storage is not configured yet.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
      if (!file.type.startsWith("image/")) throw new HttpError(400, "Auction photos must be image files.");
      if (file.size > 4_000_000) throw new HttpError(400, "Auction photos must be smaller than 4 MB.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "auction-image";
      const blob = await put(`auction/donors/${segments[2]}/${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
      });
      return json({ url: blob.url });
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (segments[0] === "public" && segments[1] === "ticket-invitations" && segments[2] && segments.length === 3) {
    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    const location = await openTicketInvitation(segments[2]);
    return location
      ? Response.redirect(new URL(location, request.url), 302)
      : json({ error: "This invitation link is no longer active." }, 404);
  }

  if (segments[0] === "public" && segments[1] === "bills" && segments[2]) {
    if (method === "GET" && segments.length === 3) {
      const bill = await publicBidderBill(segments[2]);
      return bill ? json(bill) : json({ error: "This bidder bill is not available." }, 404);
    }
    if (method === "POST" && segments[3] === "checkout" && segments.length === 4) {
      const body = await readBody(request);
      return json(await createBidderBillCheckout(segments[2], body.coverFees === true, request), 201);
    }
  }
  if (segments[0] === "public" && segments[1] === "receipts" && segments[2] && segments.length === 3 && method === "GET") {
    const receipt = await publicFundraisingReceipt(segments[2]);
    return receipt ? json(receipt) : json({ error: "This receipt is not available." }, 404);
  }
  if (segments[0] === "public" && segments[1] === "donations" && segments[2]) {
    if (method === "GET" && segments.length === 3) {
      const campaign = await publicDonationCampaign(segments[2]);
      return campaign ? json(campaign) : json({ error: "This donation campaign is not active." }, 404);
    }
    if (method === "POST" && segments[3] === "checkout" && segments.length === 4) {
      return json(await createDonationCheckout(segments[2], await readBody(request) as never, request), 201);
    }
    if (method === "GET" && segments[3] === "status" && segments[4] && segments.length === 5) {
      const status = await publicDonationStatus(segments[2], segments[4]);
      return status ? json(status) : json({ error: "This donation is not available." }, 404);
    }
  }

  if (segments[0] === "public" && segments[1] === "assignments" && segments[2]) {
    if (method === "GET" && !segments[3]) {
      const assignment = await repos.publicAssignment(segments[2]);
      return assignment ? json(assignment) : json({ error: "This assignment link is no longer active." }, 404);
    }
    if (method === "POST" && segments[3] === "complete" && segments.length === 4) {
      const assignment = await repos.completePublicAssignment(segments[2]);
      return assignment ? json(assignment) : json({ error: "This assignment link is no longer active." }, 404);
    }
    if (method === "POST" && segments[3] === "reopen" && segments.length === 4) {
      const assignment = await repos.reopenPublicAssignment(segments[2]);
      return assignment ? json(assignment) : json({ error: "This assignment link is no longer active." }, 404);
    }
    if (method === "GET" && segments[3] === "check-in" && segments.length === 4) {
      const station = await repos.publicCheckInStation(segments[2]);
      return station ? json(station) : json({ error: "This check-in link is no longer active." }, 404);
    }
    if (method === "POST" && segments[3] === "check-in" && segments[4] === "walk-ins" && segments.length === 5) {
      const body = await readBody(request);
      if (typeof body.name !== "string") return json({ error: "name is required." }, 400);
      const guest = await repos.createPublicWalkIn(segments[2], body.name);
      return guest ? json(guest, 201) : json({ error: "This check-in link or counter is no longer active." }, 404);
    }
    if (method === "DELETE" && segments[3] === "check-in" && segments[4] === "walk-ins" && segments[5] && segments.length === 6) {
      const removed = await repos.removePublicWalkIn(segments[2], segments[5]);
      return removed ? json({ removed: true }) : json({ error: "Only walk-ins can be removed from this check-in desk." }, 404);
    }
    if (method === "POST" && segments[3] === "check-in" && segments[4] && segments.length === 5) {
      const body = await readBody(request);
      if (typeof body.checkedIn !== "boolean") return json({ error: "checkedIn must be true or false." }, 400);
      const guest = await repos.setPublicCheckIn(segments[2], segments[4], body.checkedIn);
      return guest ? json(guest) : json({ error: "This guest is not available at this check-in station." }, 404);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (segments[0] === "public" && segments[1] === "rfps" && segments[2]) {
    if (method === "GET" && !segments[3]) {
      const payload = await repos.publicRfp(segments[2]);
      return payload ? json(payload) : json({ error: "This proposal link is no longer active." }, 404);
    }
    if (method === "POST" && segments[3] === "responses") {
      return json(await repos.publicRfpResponse(segments[2], publicProposalSchema.parse(await readBody(request))), 201);
    }
  }

  if (segments[0] === "public" && segments[1] === "vendor-conversations" && segments[2] && segments.length === 3) {
    if (method === "GET") {
      const conversation = await repos.publicVendorConversation(segments[2]);
      return conversation ? json(conversation) : json({ error: "This conversation link is no longer active." }, 404);
    }
    if (method === "POST") {
      await repos.publicVendorReply(segments[2], await readBody(request));
      return json({ ok: true }, 201);
    }
  }

  return null;
}

/* ------------------------------------------------------------- authed routes */

/** Validation errors from the floorplan schema, reported as a readable 400 rather than a 500. */
function readFloorplanDraft(body: Record<string, unknown>) {
  try {
    return parseFloorplanDraft(body);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const details = error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "floorplan"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, details);
  }
}

function requireCapability(ctx: RequestContext, capability: PlanCapability): void {
  if (!planHasCapability(effectivePlan(ctx.access), capability)) {
    throw new HttpError(403, "Your workspace plan does not include this feature.");
  }
}

/**
 * Event collaborators use the regular event workspace, but they are not workspace
 * members in the broad sense. This guard keeps portfolio, billing, templates and other
 * events out of reach even when someone edits the URL or calls the API directly.
 */
export function requireScopedRoute(
  ctx: RequestContext,
  segments: string[],
  method: string,
  body: Record<string, unknown>,
  url: URL,
): void {
  const eventId = ctx.eventScopeId;
  if (!eventId) return;

  const [resource, resourceId, subresource] = segments;
  if (["me", "feedback", "imports"].includes(resource)) return;
  // Event pages need workspace display preferences, but a collaborator cannot change
  // workspace-wide currency, time zone or branding.
  if (resource === "settings" && method === "GET") return;
  if (resource === "members" && method === "GET") return;

  if (resource === "events") {
    if (!resourceId && method === "GET") return;
    if (!resourceId) throw new HttpError(403, "This account is limited to its assigned event.");
    if (resourceId !== eventId) throw new HttpError(404, "That event no longer exists.");
    if (method === "DELETE" || subresource === "save-as-template") {
      throw new HttpError(403, "This account cannot remove or copy the assigned event.");
    }
    return;
  }

  if (resource === "assistant") {
    if (body.eventId !== eventId) throw new HttpError(404, "That event no longer exists.");
    return;
  }

  // These support tabs inside the assigned event. Their repositories apply the event
  // scope to every row-level read and write where the event id is not present in the URL.
  if (["guests", "registrations", "floorplans"].includes(resource)) return;
  if (resource === "locations" && method === "GET") return;
  if (resource === "vendors") {
    if (method === "GET") return;
    // A scoped collaborator may continue an event vendor conversation, but cannot edit
    // the workspace-wide vendor directory. The repository verifies the vendor belongs
    // to the assigned event before sending or marking anything read.
    if (resourceId && ["messages", "read"].includes(subresource ?? "") && method === "POST") return;
  }

  if (resource === "analytics" && resourceId === "health" && method === "GET") {
    const requested = (url.searchParams.get("eventIds") ?? eventId).split(",").filter(Boolean);
    if (requested.some((id) => id !== eventId)) throw new HttpError(404, "That event no longer exists.");
    return;
  }

  throw new HttpError(403, "This account is limited to its assigned event.");
}

async function handleAuthed(
  ctx: RequestContext,
  segments: string[],
  method: string,
  request: Request,
  url: URL,
): Promise<Response> {
  const [resource, a, b, c] = segments;
  const body = resource === "uploads" ? {} : await readBody(request);
  requireScopedRoute(ctx, segments, method, body, url);

  switch (resource) {
    case "me":
      {
        const scopedEvent = ctx.eventScopeId ? await repos.events.get(ctx, ctx.eventScopeId) : null;
      return json({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        role: ctx.role,
        canReviewFeedback: isBeebizyOperator(ctx.email),
        experience: accountExperienceForEmail(ctx.email),
        canSwitchExperience: canSwitchAccountExperience(ctx.email),
        eventScope: ctx.eventScopeId
          ? { id: ctx.eventScopeId, title: scopedEvent?.title ?? "Assigned event" }
          : null,
        access: ctx.access,
      });
      }

    case "uploads": {
      if (a !== "auction-image" || method !== "POST") return notFound();
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "Auction image storage is not configured yet.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
      if (!file.type.startsWith("image/")) throw new HttpError(400, "Auction photos must be image files.");
      if (file.size > 4_000_000) throw new HttpError(400, "Auction photos must be smaller than 4 MB.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "auction-image";
      const blob = await put(`auction/${ctx.workspaceId}/${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
      });
      return json({ url: blob.url });
    }

    /* ---------------------------------------------------------------- billing */
    case "billing": {
      if (a === "checkout" && method === "POST") {
        if (body.interval !== "month") throw new HttpError(400, "Solo is billed monthly.");
        return json(await createCheckoutSession(ctx, "month", request));
      }
      if (a === "portal" && method === "POST") return json(await createPortalSession(ctx, request));
      if (a === "connect" && method === "GET") return json(await getStripeConnectStatus(ctx));
      if (a === "connect" && b === "onboarding" && method === "POST") {
        return json(await createStripeConnectOnboarding(ctx, request));
      }
      return notFound();
    }

    case "fundraising": {
      if (a === "profile" && method === "GET") return json(await getFundraisingOrganizationProfile(ctx));
      if (a === "profile" && method === "PATCH") return json(await updateFundraisingOrganizationProfile(ctx, body as never));
      if (a === "categories" && method === "GET") return json(await listAuctionCategories(ctx.workspaceId));
      if (a === "categories" && method === "POST") return json(await createAuctionCategory(ctx, String(body.name ?? "")), 201);
      if (a === "campaigns" && method === "GET") return json(await listDonationCampaigns(ctx, typeof url.searchParams.get("eventId") === "string" ? url.searchParams.get("eventId")! : undefined));
      if (a === "campaigns" && method === "POST") return json(await createDonationCampaign(ctx, body as never), 201);
      return notFound();
    }

    /* -------------------------------------------------------------- assistant */
    case "assistant": {
      if (a === "chat" && method === "POST") {
        const input = z
          .object({
            eventId: z.string().min(1).max(100),
            messages: z
              .array(
                z.object({
                  role: z.enum(["user", "assistant"]),
                  content: z.string().trim().min(1).max(2_000),
                }),
              )
              // Bounded so one tab cannot grow a transcript into an unbounded prompt.
              .max(40),
          })
          .parse(body);
        return json(await continuePlanningChat(input.messages, ctx.userId));
      }
      if (a === "preview" && method === "POST") {
        const input = z.object({
          title: z.string().trim().min(1).max(160),
          category: z.string().trim().min(1).max(80),
          date: z.string().datetime(),
          endDate: z.string().datetime().nullable().optional(),
          location: z.string().trim().max(200).nullable().optional(),
          experience: z.enum(["standard", "santa-clara"]).optional(),
          headcount: z.number().int().min(PLANNING_LIMITS.minHeadcount).max(PLANNING_LIMITS.maxHeadcount),
          totalBudgetCents: z.number().int().min(PLANNING_LIMITS.minBudgetCents).max(PLANNING_LIMITS.maxBudgetCents),
          theme: z.string().trim().max(PLANNING_LIMITS.maxThemeLength),
        }).parse(body);
        const event = {
          id: "preview",
          ownerId: ctx.workspaceId,
          experience: ctx.canSwitchExperience ? input.experience ?? ctx.experience ?? "standard" : ctx.experience ?? "standard",
          title: input.title,
          description: null,
          date: input.date,
          endDate: input.endDate ?? null,
          location: input.location ?? null,
          locationId: null,
          locationRecord: null,
          capacity: input.headcount,
          status: "draft" as const,
          category: input.category,
          imageUrl: null,
          registrationCount: 0,
          shareToken: null,
          registrationPage: { ...DEFAULT_REGISTRATION_PAGE },
          createdAt: new Date().toISOString(),
        };
        const [memory, settings] = await Promise.all([
          repos.planningMemory.list(ctx, event),
          repos.settings.get(ctx),
        ]);
        return json(await generatePlanningSuggestions(
          event,
          { eventId: event.id, headcount: input.headcount, totalBudgetCents: input.totalBudgetCents, theme: input.theme },
          ctx.userId,
          memory,
          settings.timeZone,
        ));
      }
      if (a !== "plan" || method !== "POST") return notFound();
      const brief = z
        .object({
          eventId: z.string().min(1).max(100),
          headcount: z.number().int().min(PLANNING_LIMITS.minHeadcount).max(PLANNING_LIMITS.maxHeadcount),
          totalBudgetCents: z.number().int().min(PLANNING_LIMITS.minBudgetCents).max(PLANNING_LIMITS.maxBudgetCents),
          theme: z.string().trim().max(PLANNING_LIMITS.maxThemeLength),
        })
        .parse(body);
      const event = await repos.events.get(ctx, brief.eventId);
      if (!event) throw new HttpError(404, "This event no longer exists.");
      const [memory, settings] = await Promise.all([
        repos.planningMemory.list(ctx, event),
        repos.settings.get(ctx),
      ]);
      return json(await generatePlanningSuggestions(event, brief, ctx.userId, memory, settings.timeZone));
    }

    /* --------------------------------------------------------------- imports */
    case "imports": {
      if (a !== "google-sheet" || method !== "POST") return notFound();
      const input = z.object({ url: z.string().trim().min(1).max(2_000) }).parse(body);
      try {
        return json(await fetchGoogleSheetCsv(input.url));
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "The Google Sheet could not be imported.");
      }
    }

    /* ------------------------------------------------------------------ events */
    case "events": {
      if (!a && method === "GET") {
        const filter = {
          experience: url.searchParams.get("experience") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
          category: url.searchParams.get("category") ?? undefined,
          locationId: url.searchParams.get("locationId") ?? undefined,
          search: url.searchParams.get("search") ?? undefined,
        };
        return json(await repos.events.list(ctx, filter));
      }
      if (!a && method === "POST") return json(await repos.events.create(ctx, body), 201);
      if (a && !b && method === "GET") return json(await repos.events.get(ctx, a));
      if (a && !b && method === "PATCH") return json(await repos.events.update(ctx, a, body));
      if (a && !b && method === "DELETE") {
        await repos.events.remove(ctx, a);
        return json({ ok: true });
      }
      if (a && b === "share" && method === "POST") return json(await repos.events.share(ctx, a));
      if (a && b === "save-as-template" && method === "POST") return json(await repos.events.saveAsTemplate(ctx, a, body), 201);
      if (a && b === "assignment-summaries" && method === "POST") {
        return json(await repos.events.sendAssignmentSummaries(ctx, a));
      }

      // Event subcollections: /api/events/:id/<sub>[/:childId]
      if (a && b) {
        if (b === "auction-donors") {
          if (!c && method === "GET") return json(await repos.auctionDonors.list(ctx, a));
          if (!c && method === "POST") return json(await repos.auctionDonors.create(ctx, a, body), 201);
          if (c && segments[4] === "thank-you" && method === "POST") {
            return json(await repos.auctionManagement.sendDonorThankYou(ctx, a, c));
          }
          if (c && method === "PATCH") return json(await repos.auctionDonors.update(ctx, a, c, body));
          if (c && method === "DELETE") {
            await repos.auctionDonors.remove(ctx, a, c);
            return json({ ok: true });
          }
          return notFound();
        }
        if (b === "auction-share" && !c && method === "POST") {
          return json(await repos.auctionManagement.share(ctx, a));
        }
        if (b === "auction-settings" && !c && method === "PATCH") {
          return json(await repos.auctionManagement.updateSettings(ctx, a, body as never));
        }
        if (b === "auction-bidders" && !c && method === "GET") {
          return json(await repos.auctionManagement.listBidders(ctx, a));
        }
        if (b === "auction-bids" && !c && method === "GET") {
          return json(await repos.auctionManagement.listBids(ctx, a));
        }
        if (b === "auction-orders") {
          if (!c && method === "GET") return json(await listAuctionOrders(ctx, a));
          if (c && segments[4] === "refund" && method === "POST") {
            return json(await refundAuctionOrder(ctx, a, c));
          }
          return notFound();
        }
        if (b === "item-submissions") {
          if (!c && method === "GET") return json(await listItemSubmissions(ctx, a));
          if (c && method === "PATCH") {
            return json(await updateItemSubmission(ctx, a, c, {
              status: String(body.status ?? "submitted") as never,
              requestedChanges: typeof body.requestedChanges === "string" ? body.requestedChanges : null,
            }));
          }
          return notFound();
        }
        if (b === "fundraising-dashboard" && !c && method === "GET") {
          return json(await fundraisingDashboard(ctx, a));
        }
        if (b === "fundraising-reports" && !c && method === "GET") {
          return json(await fundraisingReports(ctx, a));
        }
        if (b === "fundraising-broadcasts") {
          if (c === "preview" && method === "POST") return json(await previewFundraisingBroadcast(ctx, a, {
            audience: String(body.audience ?? "all"),
            itemIds: Array.isArray(body.itemIds) ? body.itemIds.filter((value): value is string => typeof value === "string") : [],
          }));
          if (c === "send" && method === "POST") return json(await sendFundraisingBroadcast(ctx, a, {
            audience: String(body.audience ?? "all"),
            itemIds: Array.isArray(body.itemIds) ? body.itemIds.filter((value): value is string => typeof value === "string") : [],
            channels: Array.isArray(body.channels) ? body.channels.filter((value): value is string => typeof value === "string") : ["email"],
            message: String(body.message ?? ""),
          }));
          return notFound();
        }
        if (b === "bidder-bills") {
          if (!c && method === "GET") return json(await buildBidderBills(ctx, a));
          if (c === "build" && method === "POST") return json(await buildBidderBills(ctx, a));
          if (c === "send" && method === "POST") return json(await sendBidderBills(ctx, a));
          if (c && segments[4] === "refund" && method === "POST") return json(await refundBidderBill(ctx, a, c));
          return notFound();
        }
        if (b === "auction" && c && segments[4] === "publish" && method === "POST") {
          return json(await repos.auctionManagement.publishItem(ctx, a, c, body.published !== false));
        }
        if (b === "auction" && c && segments[4] === "close" && method === "POST") {
          return json(await closeAuctionItem(ctx, a, c, request));
        }
        if (b === "auction" && c && segments[4] === "second-chance" && method === "POST") {
          return json(await offerAuctionSecondChance(ctx, a, c, request));
        }
        if (b === "auction" && c && segments[4] === "extend" && method === "POST") {
          return json(await extendAuctionItem(ctx, a, c, Number(body.minutes ?? 0)));
        }
        if (b === "auction" && c && segments[4] === "reopen" && method === "POST") {
          return json(await reopenAuctionItem(ctx, a, c, Number(body.minutes ?? 5)));
        }
        if (b === "auction" && c && segments[4] === "live-sale" && method === "POST") {
          return json(await recordLiveAuctionSale(
            ctx,
            a,
            c,
            Array.isArray(body.paddleNumbers) ? body.paddleNumbers.map(Number) : [],
            Number(body.amountCents ?? 0),
          ));
        }
        if (b === "auction" && c && segments[4] === "undo-sale" && method === "POST") {
          return json(await undoLiveAuctionSale(ctx, a, c));
        }
        if (b === "ticket-orders") {
          if (!c && method === "GET") return json(await listTicketOrders(ctx, a));
          if (c && segments[4] === "refund" && method === "POST") {
            return json(await refundTicketOrder(ctx, a, c));
          }
          return notFound();
        }
        if (b === "ticket-invitations") {
          if (!c && method === "GET") return json(await listTicketInvitations(ctx, a));
          if (!c && method === "POST") {
            const input = z.object({
              recipients: z.array(z.object({
                name: z.string().trim().min(1).max(160),
                email: z.string().trim().email().max(320),
              })).min(1).max(500),
              consentConfirmed: z.boolean(),
            }).parse(body);
            return json(await sendTicketInvitations(ctx, a, input.recipients, input.consentConfirmed, request), 201);
          }
          return notFound();
        }
        if (b === "rfps") {
          requireCapability(ctx, "vendorManagement");
          const action = segments[4];
          const nestedId = segments[5];
          if (!c && method === "GET") return json(await repos.rfps.list(ctx, a));
          if (!c && method === "POST") return json(await repos.rfps.create(ctx, a, rfpDraftSchema.parse(body)), 201);
          if (c && !action && method === "PATCH") return json(await repos.rfps.update(ctx, a, c, rfpDraftPatchSchema.parse(body)));
          if (c && !action && method === "DELETE") {
            await repos.rfps.remove(ctx, a, c);
            return json({ ok: true });
          }
          if (c && action === "responses" && !nestedId && method === "POST") {
            return json(await repos.rfps.addResponse(ctx, a, c, rfpResponseSchema.parse(body)), 201);
          }
          if (c && action === "responses" && nestedId && method === "PATCH") {
            return json(await repos.rfps.setResponseStatus(ctx, a, c, nestedId, String(body.status ?? "")));
          }
          if (c && action === "responses" && nestedId && method === "DELETE") {
            await repos.rfps.removeResponse(ctx, a, c, nestedId);
            return json({ ok: true });
          }
          if (c && action === "invitations" && method === "POST") {
            return json(await repos.rfps.inviteVendor(ctx, a, c, String(body.vendorId ?? "")), 201);
          }
          return notFound();
        }

        const child = eventChildren[b];
        if (child) {
          if (b === "vendors") requireCapability(ctx, "vendorManagement");
          if (b === "mood-board") requireCapability(ctx, "inspirationBoards");
          if (!c && method === "GET") return json(await child.list(ctx, a));
          if (!c && method === "POST") return json(await child.create(ctx, a, body), 201);
          if (c && method === "PATCH") return json(await child.update(ctx, a, c, body));
          if (c && method === "DELETE") {
            await child.remove(ctx, a, c);
            return json({ ok: true });
          }
        }

        if (b === "registrations" && !c && method === "GET") return json(await repos.registrations.listForEvent(ctx, a));
        if (b === "walk-ins" && !c && method === "POST") return json(await repos.registrations.createWalkIn(ctx, a, body), 201);
        if (b === "history" && !c && method === "GET") return json(await repos.history.list(ctx, a));
        if (b === "updates" && !c && method === "GET") return json(await repos.teamUpdates.list(ctx, a));
        if (b === "updates" && !c && method === "POST") return json(await repos.teamUpdates.create(ctx, a, body), 201);
        if (b === "floorplans" && !c && method === "GET") return json(await repos.floorplan.list(ctx, a));
        if (b === "floorplans" && !c && method === "POST") {
          const draft = readFloorplanDraft(body);
          return json(await repos.floorplan.create(ctx, a, draft), 201);
        }
        if (b === "roi" && method === "GET") return json(await repos.roi.get(ctx, a));
        if (b === "roi" && method === "PUT") return json(await repos.roi.save(ctx, a, body));

        if (b === "raffle" && c && segments[4] === "tickets" && method === "GET") {
          return json(await repos.raffle.listTickets(ctx, a, c));
        }
        if (b === "raffle" && c && segments[4] === "tickets" && method === "POST") {
          return json(await repos.raffle.sellTickets(ctx, a, c, body), 201);
        }
        if (b === "raffle" && c && segments[4] === "draw" && method === "POST") {
          return json(await repos.raffle.draw(ctx, a, c));
        }
      }
      return notFound();
    }

    /* --------------------------------------------------------------- locations */
    case "locations": {
      if (!a && method === "GET") return json(await repos.locations.list(ctx));
      if (a && method === "GET") return json(await repos.locations.get(ctx, a));
      requireCapability(ctx, "multiLocation");
      if (!a && method === "POST") return json(await repos.locations.create(ctx, body), 201);
      if (a && method === "PATCH") return json(await repos.locations.update(ctx, a, body));
      if (a && method === "DELETE") {
        await repos.locations.remove(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* --------------------------------------------------------------- guests */
    case "guests": {
      if (!a && method === "GET") return json(await repos.guests.list(ctx));
      if (!a && method === "POST") return json(await repos.guests.create(ctx, body), 201);
      if (a && method === "PATCH") return json(await repos.guests.update(ctx, a, body));
      if (a && method === "DELETE") {
        await repos.guests.remove(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* ----------------------------------------------------------------- members */
    case "invites": {
      requireCapability(ctx, "collaboration");
      if (!a && method === "POST") {
        return json(
          await repos.members.invite(
            ctx,
            String(body.email ?? ""),
            String(body.role ?? "member"),
            typeof body.eventId === "string" ? body.eventId : null,
          ),
          201,
        );
      }
      if (a && method === "DELETE") {
        await repos.members.revokeInvite(ctx, decodeURIComponent(a));
        return new Response(null, { status: 204 });
      }
      return notFound();
    }

    case "members": {
      if (!a && method === "GET") return json(await repos.members.list(ctx));
      requireCapability(ctx, "collaboration");
      if (a && method === "PATCH") return json(await repos.members.setRole(ctx, a, String(body.role ?? "")));
      if (a && method === "DELETE") {
        await repos.members.remove(ctx, a);
        return new Response(null, { status: 204 });
      }
      return notFound();
    }

    /* -------------------------------------------------------------- floorplans */
    case "floorplans": {
      if (a && method === "PUT") {
        const draft = readFloorplanDraft(body);
        return json(await repos.floorplan.save(ctx, a, draft));
      }
      if (a && method === "DELETE") {
        await repos.floorplan.remove(ctx, a);
        return new Response(null, { status: 204 });
      }
      return notFound();
    }

    /* ----------------------------------------------------------- registrations */
    case "registrations": {
      if (!a && method === "GET") return json(await repos.registrations.list(ctx));
      if (!a && method === "POST") return json(await repos.registrations.create(ctx, body), 201);
      if (a === "import" && !b && method === "POST") return json(await repos.registrations.importGuests(ctx, body), 201);
      if (a && method === "PATCH") return json(await repos.registrations.update(ctx, a, body));
      if (a && method === "DELETE") {
        await repos.registrations.remove(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* ----------------------------------------------------------------- vendors */
    case "vendors": {
      requireCapability(ctx, "vendorManagement");
      if (!a && method === "GET") return json(await repos.vendors.list(ctx));
      if (!a && method === "POST") return json(await repos.vendors.create(ctx, body), 201);
      if (a && !b && method === "GET") return json(await repos.vendors.get(ctx, a));
      if (a && !b && method === "PATCH") return json(await repos.vendors.update(ctx, a, body));
      if (a && !b && method === "DELETE") {
        await repos.vendors.remove(ctx, a);
        return json({ ok: true });
      }
      if (a && b === "messages" && method === "GET") return json(await repos.vendorMessages.list(ctx, a));
      if (a && b === "messages" && method === "POST") {
        return json(await repos.vendorMessages.create(ctx, a, body), 201);
      }
      if (a && b === "read" && method === "POST") {
        await repos.vendorMessages.markThreadRead(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* --------------------------------------------------------------- templates */
    case "templates": {
      if (!a && method === "GET") return json(await repos.templates.list(ctx));
      if (!a && method === "POST") return json(await repos.templates.create(ctx, body), 201);
      if (a && !b && method === "GET") return json(await repos.templates.get(ctx, a));
      if (a && !b && method === "PATCH") return json(await repos.templates.update(ctx, a, body));
      if (a && !b && method === "DELETE") {
        await repos.templates.remove(ctx, a);
        return json({ ok: true });
      }
      if (a && b === "contents" && method === "PUT") {
        return json(await repos.templates.replaceContents(ctx, a, body as never));
      }
      if (a && b === "events" && method === "POST") {
        return json(await repos.events.createFromTemplate(ctx, a, body), 201);
      }
      return notFound();
    }

    /* ------------------------------------------------------------------ boards */
    case "boards": {
      requireCapability(ctx, "inspirationBoards");
      if (!a && method === "GET") return json(await repos.canvases.list(ctx));
      if (a && !b && method === "GET") return json(await repos.canvases.get(ctx, a));
      if (!a && method === "POST") return json(await repos.canvases.create(ctx, body), 201);
      if (a && !b && method === "PATCH") return json(await repos.canvases.update(ctx, a, body));
      if (a && !b && method === "DELETE") {
        await repos.canvases.remove(ctx, a);
        return json({ ok: true });
      }
      if (a && b === "cards" && method === "PUT") {
        const cards = Array.isArray(body.cards) ? body.cards : [];
        return json(await repos.canvases.replaceCards(ctx, a, cards as never));
      }
      return notFound();
    }

    /* ----------------------------------------------------------------- tickets */
    case "tickets": {
      if (!a && method === "GET") return json(await repos.tickets.listAll(ctx));
      return notFound();
    }

    /* ---------------------------------------------------------------- settings */
    case "settings": {
      if (method === "GET") return json(await repos.settings.get(ctx));
      if (method === "PATCH") return json(await repos.settings.update(ctx, body));
      return notFound();
    }

    /* ---------------------------------------------------------- product feedback */
    case "feedback": {
      if (a === "inbox" && method === "GET") {
        requireBeebizyOperator(ctx.email);
        return json(await repos.feedback.listInbox(ctx));
      }
      if (a && b === "notify" && method === "POST") {
        requireBeebizyOperator(ctx.email);
        return json(await repos.feedback.notify(ctx, a));
      }
      if (!a && method === "GET") return json(await repos.feedback.list(ctx));
      if (!a && method === "POST") {
        const parsed = feedbackDraftSchema.safeParse(body);
        if (!parsed.success) {
          throw new HttpError(400, feedbackValidationMessage(parsed.error));
        }
        return json(await repos.feedback.create(ctx, parsed.data), 201);
      }
      return notFound();
    }

    /* --------------------------------------------------------------- analytics */
    case "analytics": {
      if (a === "custom-report" && method === "GET") {
        requireCapability(ctx, "customReporting");
        return json(await repos.analytics.customReport(ctx));
      }
      if (a === "portfolio" && method === "GET") return json(await repos.analytics.portfolio(ctx));
      if (a === "attention" && method === "GET") return json(await repos.analytics.attention(ctx));
      if (a === "open-tasks" && method === "GET") return json(await repos.analytics.openTasks(ctx));
      if (a === "health" && method === "GET") {
        const ids = url.searchParams.get("eventIds");
        return json(await repos.analytics.health(ctx, ids ? ids.split(",").filter(Boolean) : undefined));
      }
      return notFound();
    }

    default:
      return notFound();
  }
}

/** The event subcollections that share one CRUD shape. */
const eventChildren: Record<
  string,
  {
    list: (ctx: RequestContext, eventId: string) => Promise<unknown>;
    create: (ctx: RequestContext, eventId: string, body: Record<string, unknown>) => Promise<unknown>;
    update: (ctx: RequestContext, eventId: string, id: string, body: Record<string, unknown>) => Promise<unknown>;
    remove: (ctx: RequestContext, eventId: string, id: string) => Promise<void>;
  }
> = {
  checklist: repos.checklist,
  "check-in-stations": repos.checkInStations,
  "run-of-show": repos.runOfShow,
  "volunteer-needs": repos.volunteerNeeds,
  volunteers: repos.volunteers,
  budget: repos.budget,
  deposits: repos.deposits,
  menu: repos.menu,
  "mood-board": repos.moodBoard,
  auction: repos.auction,
  sponsorships: repos.sponsorships,
  vendors: repos.eventVendors,
  "ticket-types": repos.tickets,
  raffle: repos.raffle,
};

/** The router. Web in, web out — the bridge above is the only Node-aware code here. */
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // `__path` is set by the rewrite in vercel.json; the pathname fallback keeps direct hits
  // and tests working.
  const rawPath = url.searchParams.get("__path") ?? url.pathname.replace(/^\/api\/?/, "");
  const segments = rawPath.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    const publicResponse = await handlePublic(segments, method, request);
    if (publicResponse) return publicResponse;

    const ctx = await authorize(request);
    return await handleAuthed(ctx, segments, method, request, url);
  } catch (error) {
    // An HttpError is a message someone wrote for a person to read, so it is returned as
    // written. Anything else is a bug, and its message is written for us, not for them.
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, 400);

    /*
     * Never return the raw error. A failed database write reports itself as the entire
     * SQL statement plus its parameters, and that went straight to the screen: a user
     * adding a duplicate email saw an insert statement, their workspace id and the
     * address they had typed. The detail belongs in the log, where we can read it.
     */
    console.error("[api]", error);
    return json({ error: "Something went wrong on our end. Try again, or tell us if it keeps happening." }, 500);
  }
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const rawBody = await readRawBody(req);
  const response = await handleRequest(toWebRequest(req, rawBody));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}
