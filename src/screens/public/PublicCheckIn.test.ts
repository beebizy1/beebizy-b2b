import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicCheckInGuest } from "@/data/entities";
import { PublicCheckInGuestActions } from "./PublicCheckIn";
import { printBadgeBeforeCompletion } from "./printBadgeFlow";
import { publicCheckInArrivalAction } from "./publicCheckInPolicy";

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
    onEditBadge: vi.fn(),
    onSetCheckedIn: vi.fn(),
    onRemove: vi.fn(),
  }));
}

describe("PublicCheckInGuestActions", () => {
  it("keeps founder badge printing optional and separate from check-in", () => {
    const html = render(founder);

    expect(publicCheckInArrivalAction(founder)).toMatchObject({ label: "Check in", kind: "check-in" });
    expect(html).toContain("Check in");
    expect(html).toContain("Print badge");
    expect(html).toContain("Edit badge");
    expect(html).not.toContain("Print badge &amp; check in");
  });

  it("keeps badge printing attached to check-in for guests without pre-printed badges", () => {
    const guest = { ...founder, registrationId: "reg-guest", segment: "General" };
    const html = render(guest);

    expect(publicCheckInArrivalAction(guest)).toMatchObject({
      label: "Print badge & check in",
      kind: "badge-editor",
    });
    expect(html).toContain("Print badge &amp; check in");
    expect(html).toContain("Edit badge");
  });

  it("keeps undo and reprint available after a founder is checked in", () => {
    const html = render({ ...founder, checkedInAt: "2026-10-09T16:00:00.000Z" });

    expect(html).toContain("Reprint badge");
    expect(html).toContain("Undo");
  });
});

describe("printBadgeBeforeCompletion", () => {
  it("opens the browser print flow before waiting for check-in persistence", async () => {
    const order: string[] = [];

    await printBadgeBeforeCompletion(
      () => order.push("print"),
      async () => { order.push("check-in"); },
    );

    expect(order).toEqual(["print", "check-in"]);
  });
});
