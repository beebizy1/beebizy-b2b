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

import { authorize, HttpError, type RequestContext } from "../src/server/auth.ts";
import * as repos from "../src/server/repos.ts";
import { eventByShareToken } from "../src/server/repos.ts";
import { continuePlanningChat, generatePlanningSuggestions } from "../src/server/planner.ts";
import { parseFloorplanDraft } from "../src/data/floorplan.ts";
import { PLANNING_LIMITS } from "../src/data/planner.ts";
import { fetchGoogleSheetCsv } from "../src/server/imports.ts";
import { z, ZodError } from "zod";

export const config = { runtime: "nodejs" };

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
  body?: unknown;
  on(event: string, listener: (chunk?: unknown) => void): void;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function toWebRequest(req: NodeRequest, rawBody: string): Request {
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
    body: method === "GET" || method === "HEAD" ? undefined : rawBody,
  });
}

async function readRawBody(req: NodeRequest): Promise<string> {
  // Vercel may have parsed the body already; if so, don't try to read a consumed stream.
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  return new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
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

const LEAD_FIELDS = ["name", "email", "company", "phone", "volume"] as const;
const LEAD_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function handleLead(request: Request): Promise<Response> {
  const body = await readBody(request);
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const lead = Object.fromEntries(
    LEAD_FIELDS.flatMap((field) => {
      const value = body[field];
      return typeof value === "string" && value.trim() ? [[field, value.trim().slice(0, 200)]] : [];
    }),
  ) as Partial<Record<(typeof LEAD_FIELDS)[number], string>>;

  const missing = (["name", "email", "company"] as const).filter((field) => !lead[field]);
  if (missing.length > 0) return json({ error: `Missing: ${missing.join(", ")}` }, 400);
  if (!LEAD_EMAIL.test(lead.email!)) return json({ error: "That email doesn't look right" }, 400);

  const record = { at: new Date().toISOString(), ...lead, userAgent: request.headers.get("user-agent") };
  console.log(`LEAD ${JSON.stringify(record)}`);

  if (!process.env.MAIL_TO || !process.env.RESEND_API_KEY) {
    console.error("LEAD_EMAIL_NOT_CONFIGURED");
    return json({ error: "Demo requests are temporarily unavailable. Please try again shortly." }, 503);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Beebizy <onboarding@resend.dev>",
      to: [process.env.MAIL_TO],
      reply_to: lead.email,
      subject: `New demo request - ${lead.company}`,
      text: [
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        `Company: ${lead.company}`,
        `Phone: ${lead.phone ?? "-"}`,
        `Events: ${lead.volume ?? "-"} per year`,
        `Received: ${record.at}`,
      ].join("\n"),
    }),
  });
  if (!response.ok) {
    console.error("LEAD_EMAIL_FAILED", response.status, await response.text());
    return json({ error: "We couldn’t send your demo request. Please try again." }, 502);
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

  // GET /api/public/events/:token
  if (segments[0] === "public" && segments[1] === "events" && segments[2] && method === "GET") {
    const shared = await eventByShareToken(segments[2]);
    if (!shared) return json({ error: "This link is no longer active." }, 404);

    const [agenda, tickets] = await Promise.all([
      repos.publicAgenda(shared.event.id),
      repos.publicTickets(shared.event.id),
    ]);
    // Only what the Share section promises is visible. Budgets, vendors, guest lists and
    // bids are not in this payload at all, rather than filtered out in the client. The
    // agenda and tickets ride along because the guest has no session to fetch them with.
    return json({ event: shared.event, agenda, tickets, timeZone: shared.timeZone });
  }

  /*
    Paid checkout and the Stripe webhook are not mounted yet. The Stripe Marketplace
    integration stops on a terms acceptance that has to happen in a browser, so there are
    no keys to talk to — and an endpoint that took an order without charging for it would
    be worse than no endpoint. `ticket_orders` and its unique `stripe_session_id` are
    already in the schema for it.
  */

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

async function handleAuthed(
  ctx: RequestContext,
  segments: string[],
  method: string,
  request: Request,
  url: URL,
): Promise<Response> {
  const [resource, a, b, c] = segments;
  const body = await readBody(request);

  switch (resource) {
    case "me":
      return json({ userId: ctx.userId, workspaceId: ctx.workspaceId, role: ctx.role, access: ctx.access });

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
      const memory = await repos.planningMemory.list(ctx, event);
      return json(await generatePlanningSuggestions(event, brief, ctx.userId, memory));
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

      // Event subcollections: /api/events/:id/<sub>[/:childId]
      if (a && b) {
        const child = eventChildren[b];
        if (child) {
          if (!c && method === "GET") return json(await child.list(ctx, a));
          if (!c && method === "POST") return json(await child.create(ctx, a, body), 201);
          if (c && method === "PATCH") return json(await child.update(ctx, a, c, body));
          if (c && method === "DELETE") {
            await child.remove(ctx, a, c);
            return json({ ok: true });
          }
        }

        if (b === "registrations" && !c && method === "GET") return json(await repos.registrations.listForEvent(ctx, a));
        if (b === "history" && !c && method === "GET") return json(await repos.history.list(ctx, a));
        if (b === "floorplans" && !c && method === "GET") return json(await repos.floorplan.list(ctx, a));
        if (b === "floorplans" && !c && method === "POST") {
          const draft = readFloorplanDraft(body);
          return json(await repos.floorplan.create(ctx, a, draft.name, draft.items), 201);
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
      if (!a && method === "POST") return json(await repos.locations.create(ctx, body), 201);
      if (a && method === "GET") return json(await repos.locations.get(ctx, a));
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

    /* -------------------------------------------------------------- floorplans */
    case "floorplans": {
      if (a && method === "PUT") {
        const draft = readFloorplanDraft(body);
        return json(await repos.floorplan.save(ctx, a, draft.name, draft.items));
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
      if (a && method === "PATCH") return json(await repos.registrations.update(ctx, a, body));
      if (a && method === "DELETE") {
        await repos.registrations.remove(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* ----------------------------------------------------------------- vendors */
    case "vendors": {
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
        // Stored, not yet delivered: Resend's integration is also gated on a browser terms
        // step. `vendor_messages.delivered_at` and `delivery_error` exist so the thread can
        // show what actually left the building, and the UI must not claim it was sent.
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
      if (!a && method === "GET") return json(await repos.canvases.list(ctx));
      if (!a && method === "POST") return json(await repos.canvases.create(ctx, body), 201);
      if (a && !b && method === "GET") return json(await repos.canvases.get(ctx, a));
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

    /* --------------------------------------------------------------- analytics */
    case "analytics": {
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
  "run-of-show": repos.runOfShow,
  budget: repos.budget,
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
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    // Log the detail, return the message. A stack trace is not the client's business, but
    // "Something went wrong" makes a permission failure indistinguishable from a bug.
    console.error("[api]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message }, 500);
  }
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const rawBody = await readRawBody(req);
  const response = await handleRequest(toWebRequest(req, rawBody));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}
