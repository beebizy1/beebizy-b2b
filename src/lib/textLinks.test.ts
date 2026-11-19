import { describe, expect, it } from "vitest";
import { textLinks, linkedTextHtml } from "./textLinks";

describe("safe description links", () => {
  it("makes the room-block URL a link and preserves surrounding text", () => {
    const url = "https://bookings.omnihotels.com/event/houston/carlins-birthday-party-room-block";
    expect(textLinks(`Book by November 30.\nBOOK HERE: ${url}`)).toContainEqual({ text: url, href: url });
  });
  it("handles www links and punctuation without swallowing the next sentence", () => {
    expect(textLinks("See (https://example.com/room). Or www.example.com!" )).toEqual([
      { text: "See (" }, { text: "https://example.com/room", href: "https://example.com/room" },
      { text: "). Or " }, { text: "www.example.com", href: "https://www.example.com/" }, { text: "!" },
    ]);
  });
  it("escapes markup and never creates executable links", () => {
    const html = linkedTextHtml('<script>alert(1)</script> javascript:alert(1)\nhttps://example.com/?x=1&y=2');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://example.com/?x=1&amp;y=2"');
    expect(html).toContain("<br />");
  });
});
