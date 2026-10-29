import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public auction bidder status on mobile", () => {
  it("keeps the paddle status compact and defers payment until bid intent", () => {
    const source = readFileSync(new URL("./PublicAuction.tsx", import.meta.url), "utf8");

    expect(source).toContain(
      'className="grid gap-3 rounded-xl border border-success/20 bg-success-tint px-4 py-3 text-sm text-success-text sm:flex sm:flex-wrap sm:items-center"',
    );
    expect(source).toContain('className="flex items-center gap-3 sm:contents"');
    expect(source).toContain('className="min-w-0 leading-5 sm:flex-1"');
    expect(source).toContain("Browse freely. We’ll ask for secure payment when you place a bid.");
    expect(source).toContain("Continue to secure bidding");
    expect(source.match(/className="w-full sm:w-auto"/g)).toHaveLength(1);
  });

  it("lets people browse before a three-field bidder setup", () => {
    const source = readFileSync(new URL("./PublicAuction.tsx", import.meta.url), "utf8");
    const setupSource = readFileSync(new URL("./BidderSetupSheet.tsx", import.meta.url), "utf8");

    expect(source).toContain("Browse first. Register only when you bid.");
    expect(source).toContain("openBidderSetup(item.id)");
    expect(source).not.toContain("Family grade(s)");
    expect(source).not.toContain("Charge my saved card automatically");
    expect(setupSource).toContain("Get your bidder number");
    expect(setupSource).toContain("Already registered? Email my private link");
  });

  it("lets a bidder set a private maximum and clearly reports outbid status", () => {
    const source = readFileSync(new URL("./PublicAuction.tsx", import.meta.url), "utf8");

    expect(source).toContain("maximumAmountCents");
    expect(source).toContain("Set max bid");
    expect(source).toContain("We'll bid the minimum needed");
    expect(source).toContain('outbid ? <Pill tone="danger">Outbid</Pill>');
    expect(source).toContain("outbidItemIds");
  });
});
