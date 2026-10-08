import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Event, RegistrationWithGuest } from "@/data/entities";
import { CheckInPrintSheet, type CheckInPrintJob } from "./CheckInPrintSheet";
import { NameBadgePrintSheet } from "./NameBadgePrintSheet";
import { suggestBadgeNameLayout } from "./badgeNameLayout";

const event = {
  id: "evt-print-test",
  title: "Santa Clara Demo Day",
  date: "2026-10-08T17:00:00.000Z",
  location: "Santa Clara University",
} as Event;

const row = {
  id: "reg-print-test",
  organization: "Bronco Ventures",
  segment: "Investor",
  guest: { name: "Tarang Goyal", contact: "tarang@beebizy.com" },
} as RegistrationWithGuest;

function render(job: CheckInPrintJob) {
  return renderToStaticMarkup(createElement(CheckInPrintSheet, {
    event,
    job,
    rows: [row],
    formatDate: () => "Oct 8",
    timeZoneLabel: "PDT",
  }));
}

describe("CheckInPrintSheet badge labels", () => {
  it("suggests a clean two-line layout without splitting a hyphenated last name", () => {
    expect(suggestBadgeNameLayout("Shantik Azima-Taylor")).toEqual({
      line1: "Shantik",
      line2: "Azima-Taylor",
    });
  });

  it("prints the volunteer's exact two-line badge layout", () => {
    const html = renderToStaticMarkup(createElement(NameBadgePrintSheet, {
      name: null,
      layout: { line1: "Shantik", line2: "Azima-Taylor" },
    }));

    expect(html).toContain('<span class="check-in-badge-line">Shantik</span>');
    expect(html).toContain('<span class="check-in-badge-line">Azima-Taylor</span>');
  });

  it("prints one existing guest's full name and no badge design content", () => {
    const html = render({ kind: "badge", row });

    expect(html).toContain("Tarang Goyal");
    expect(html).not.toContain(event.title);
    expect(html).not.toContain(row.organization);
    expect(html).not.toContain(row.segment);
    expect(html).not.toContain("beebizy");
  });

  it("prints only the entered full name for a printer test", () => {
    const html = render({ kind: "printer-test", name: "Poorvi Shukla" });

    expect(html).toContain("Poorvi Shukla");
    expect(html).toContain("@page { size: 62mm 100mm; margin: 0; }");
    expect(html).not.toContain("@page { size: landscape; margin: 0; }");
    expect(html).not.toContain("@page { size: 100mm 62mm; margin: 0; }");
    expect(html).not.toContain(event.title);
    expect(html).not.toContain("Printer test");
  });
});
