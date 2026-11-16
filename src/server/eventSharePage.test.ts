import { describe, expect, it } from "vitest";
import { normalizeRegistrationPage } from "../data/registrationPage.ts";
import { eventShareHtml } from "./eventSharePage.ts";

const shell = `<!doctype html><head><!-- preview-metadata:start -->
<meta property="og:title" content="Beebizy homepage" />
<meta property="og:image" content="/opengraph.jpg" />
<!-- preview-metadata:end -->
<script src="/assets/app.js" type="module"></script></head><div id="root"></div>`;

describe("public RSVP link previews", () => {
  it("replaces homepage metadata with the saved invitation and preserves the app shell", () => {
    const html = eventShareHtml(shell, "event-token", {
      title: "Event name",
      imageUrl: "https://example.com/fallback.jpg",
      registrationPage: normalizeRegistrationPage({
        headline: "Ava's \"Party\" <2026>",
        heroImageUrl: "/photos/party.jpg",
        welcomeMessage: "Organizer's full welcome text",
      }),
    });
    expect(html).toContain('property="og:title" content="Ava&#39;s &quot;Party&quot; &lt;2026&gt;"');
    expect(html).toContain('property="og:image" content="https://beebizy-studio-preview.vercel.app/photos/party.jpg"');
    expect(html).toContain('property="og:url" content="https://beebizy-studio-preview.vercel.app/e/event-token"');
    expect(html).toContain('<script src="/assets/app.js" type="module"></script>');
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toMatch(/Beebizy homepage|opengraph\.jpg|fallback\.jpg|welcome text/);
  });

  it("serves a neutral preview when the event or its artwork is unavailable", () => {
    expect(eventShareHtml(shell, "missing")).toContain('property="og:title" content="Event registration"');
    const html = eventShareHtml(shell, "event-token", {
      title: "Event name",
      imageUrl: "javascript:invalid",
      registrationPage: normalizeRegistrationPage(null),
    });
    expect(html).toContain('property="og:title" content="Event name"');
    expect(html).not.toMatch(/og:image|twitter:image|javascript:/);
  });
});
