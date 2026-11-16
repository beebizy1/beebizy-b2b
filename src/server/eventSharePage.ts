import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Event } from "../data/entities.ts";
import { normalizeRegistrationPage } from "../data/registrationPage.ts";
import { PRIVATE_BETA_ORIGIN } from "../lib/privateBetaHost.ts";

type ShareEvent = Pick<Event, "title" | "imageUrl" | "registrationPage">;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function publicImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, PRIVATE_BETA_ORIGIN);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function eventShareHtml(shell: string, token: string, event?: ShareEvent): string {
  const settings = normalizeRegistrationPage(event?.registrationPage);
  const title = settings.headline || event?.title || "Event registration";
  const description = "View event details and RSVP.";
  const image = publicImageUrl(settings.heroImageUrl) ?? publicImageUrl(event?.imageUrl);
  const tag = (name: string, value: string, attribute = "property") =>
    `<meta ${attribute}="${name}" content="${escapeHtml(value)}" />`;
  const metadata = [
    `<title>${escapeHtml(title)}</title>`,
    tag("description", description, "name"),
    tag("og:title", title),
    tag("og:type", "website"),
    tag("og:description", description),
    ...(event ? [tag("og:url", `${PRIVATE_BETA_ORIGIN}/e/${encodeURIComponent(token)}`)] : []),
    ...(image ? [tag("og:image", image), tag("og:image:alt", `Invitation image for ${title}`)] : []),
    tag("twitter:card", image ? "summary_large_image" : "summary", "name"),
    tag("twitter:title", title, "name"),
    tag("twitter:description", description, "name"),
    ...(image ? [tag("twitter:image", image, "name")] : []),
  ];
  return shell.replace(/<!-- preview-metadata:start -->[\s\S]*?<!-- preview-metadata:end -->/, () => metadata.join("\n    "));
}

export async function renderEventSharePage(
  token: string,
  method: "GET" | "HEAD",
  findEvent: (token: string) => Promise<{ event: ShareEvent } | null>,
): Promise<Response> {
  const [shell, shared] = await Promise.all([
    readFile(join(process.cwd(), "dist", "index.html"), "utf8"),
    findEvent(token).catch(() => {
      // Guests can still load the RSVP app and retry the public data request.
      console.warn("[event share] Preview metadata lookup failed");
      return null;
    }),
  ]);
  return new Response(method === "HEAD" ? null : eventShareHtml(shell, token, shared?.event), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
