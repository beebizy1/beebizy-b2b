import { beforeEach, describe, expect, it } from "vitest";

import { memoryAdapter, resetMemoryStore } from "./memory/adapter";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage, registrationInvitationHtml } from "./registrationPage";

// Regression: ISSUE-001 - Santa Clara view must not inherit unrelated workspace events.
// Found by /qa on 2026-09-25
// Report: .gstack/qa-reports/qa-report-beebizy-studio-preview-vercel-app-2026-09-25.md
describe("founder feedback regressions", () => {
  beforeEach(() => resetMemoryStore());

  it("partitions event lists by customer experience", async () => {
    const santaClara = await memoryAdapter.events.create({
      experience: "santa-clara",
      title: "SCU Demo Day",
      date: "2026-10-08T17:00:00.000Z",
      status: "draft",
      category: "School Event",
    });

    const focused = await memoryAdapter.events.list({ experience: "santa-clara" });
    const standard = await memoryAdapter.events.list({ experience: "standard" });

    expect(focused.map((event) => event.id)).toEqual([santaClara.id]);
    expect(standard.some((event) => event.id === santaClara.id)).toBe(false);
  });

  // Regression: ISSUE-002 - front-door AI planning must use the planning engine, not fixed UI rows.
  // Found by /qa on 2026-09-25
  // Report: .gstack/qa-reports/qa-report-beebizy-studio-preview-vercel-app-2026-09-25.md
  it("previews a category-specific plan without creating an event", async () => {
    await memoryAdapter.events.create({
      experience: "santa-clara",
      title: "Past SCU Demo Day",
      date: "2025-10-08T17:30:00.000Z",
      status: "completed",
      category: "School Event",
      capacity: 700,
    });
    const before = await memoryAdapter.events.list();
    const plan = await memoryAdapter.assistant.preview({
      title: "SCU Community Demo Day",
      category: "School Event",
      date: "2026-10-08T17:30:00.000Z",
      location: "Santa Clara",
      experience: "santa-clara",
      headcount: 900,
      totalBudgetCents: 7_500_000,
      theme: "Community celebration",
    });

    expect(plan.checklist.length).toBeGreaterThanOrEqual(6);
    expect(plan.runOfShow.length).toBeGreaterThanOrEqual(6);
    expect(plan.summary).toContain("SCU Community Demo Day");
    expect(plan.learning?.eventCount).toBeGreaterThan(0);
    expect(await memoryAdapter.events.list()).toHaveLength(before.length);
  });

  // Regression: ISSUE-004 - paid-event handoff must remain external and the invitation branded.
  // Found by /qa on 2026-09-25
  // Report: .gstack/qa-reports/qa-report-beebizy-studio-preview-vercel-app-2026-09-25.md
  it("keeps only HTTPS payment links and includes them in the Beebizy invitation", () => {
    const safe = normalizeRegistrationPage({
      ...DEFAULT_REGISTRATION_PAGE,
      paymentUrl: "https://payments.example.com/scu-demo-day",
    });
    const unsafe = normalizeRegistrationPage({ ...DEFAULT_REGISTRATION_PAGE, paymentUrl: "javascript:alert(1)" });
    const html = registrationInvitationHtml(safe, "SCU Demo Day", null, "https://beebizy.example/e/demo");

    expect(safe.paymentUrl).toBe("https://payments.example.com/scu-demo-day");
    expect(unsafe.paymentUrl).toBeNull();
    expect(html).toContain("Continue to payment");
    expect(html).toContain("Powered by Beebizy");
  });
});
