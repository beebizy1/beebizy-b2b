import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicCheckInGuest } from "@/data/entities";
import { PublicCheckInGuestActions } from "./PublicCheckIn";

const founder = {
  registrationId: "reg-founder",
  name: "Ada Lovelace",
  organization: null,
  segment: "Founder",
  status: "confirmed",
  checkedInAt: null,
  checkInStation: null,
  removable: false,
} satisfies PublicCheckInGuest;

function render(guest: PublicCheckInGuest) {
  return renderToStaticMarkup(createElement(PublicCheckInGuestActions, {
    guest,
    savingId: null,
    removingId: null,
    onPrint: vi.fn(),
    onSetCheckedIn: vi.fn(),
    onRemove: vi.fn(),
  }));
}

describe("PublicCheckInGuestActions", () => {
  it("lets a founder check in without offering to print their pre-printed badge", () => {
    const html = render(founder);

    expect(html).toContain("Check in");
    expect(html).not.toContain("Print badge &amp; check in");
  });

  it("keeps badge printing attached to check-in for guests without pre-printed badges", () => {
    const html = render({ ...founder, registrationId: "reg-guest", segment: "General" });

    expect(html).toContain("Print badge &amp; check in");
  });

  it("keeps undo and reprint available after a founder is checked in", () => {
    const html = render({ ...founder, checkedInAt: "2026-10-09T16:00:00.000Z" });

    expect(html).toContain("Reprint badge");
    expect(html).toContain("Undo");
  });
});
