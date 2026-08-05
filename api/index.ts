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

import { authorize, HttpError, type RequestContext } from "../src/server/auth";
import * as repos from "../src/server/repos";
import { eventByShareToken } from "../src/server/repos";

export const config = { runtime: "nodejs" };

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

/**
 * Routes a guest can reach with no session. Deliberately tiny, and each one takes the
 * share token as the only credential — which is why the token is a random UUID rather
 * than something guessable.
 */
async function handlePublic(segments: string[], method: string): Promise<Response | null> {
  // GET /api/public/events/:token
  if (segments[0] === "public" && segments[1] === "events" && segments[2] && method === "GET") {
    const event = await eventByShareToken(segments[2]);
    if (!event) return json({ error: "This link is no longer active." }, 404);

    const [agenda, tickets] = await Promise.all([
      repos.publicAgenda(event.id),
      repos.publicTickets(event.id),
    ]);
    // Only what the Share section promises is visible. Budgets, vendors, guest lists and
    // bids are not in this payload at all, rather than filtered out in the client.
    return json({ event, agenda, tickets });
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
      return json({ userId: ctx.userId, workspaceId: ctx.workspaceId, role: ctx.role });

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
        if (b === "floorplan" && method === "GET") return json(await repos.floorplan.get(ctx, a));
        if (b === "floorplan" && method === "PUT") {
          const items = Array.isArray(body.items) ? body.items : [];
          return json(await repos.floorplan.save(ctx, a, String(body.name ?? "Room layout"), items as never));
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

    /* --------------------------------------------------------------- attendees */
    case "attendees": {
      if (!a && method === "GET") return json(await repos.attendees.list(ctx));
      if (!a && method === "POST") return json(await repos.attendees.create(ctx, body), 201);
      if (a && method === "PATCH") return json(await repos.attendees.update(ctx, a, body));
      if (a && method === "DELETE") {
        await repos.attendees.remove(ctx, a);
        return json({ ok: true });
      }
      return notFound();
    }

    /* ----------------------------------------------------------- registrations */
    case "registrations": {
      if (!a && method === "GET") return json(await repos.registrations.list(ctx));
      if (!a && method === "POST") return json(await repos.registrations.create(ctx, body), 201);
      if (a && method === "PATCH") return json(await repos.registrations.setStatus(ctx, a, String(body.status ?? "pending")));
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
  inspirations: repos.inspirations,
  auction: repos.auction,
  sponsorships: repos.sponsorships,
  vendors: repos.eventVendors,
  "ticket-types": repos.tickets,
  raffle: repos.raffle,
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    const publicResponse = await handlePublic(segments, method);
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
