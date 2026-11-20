import { beforeEach, describe, expect, it } from "vitest";
import { emptyEventOperations, planSizeQuestion } from "./eventOperations";
import { normalizeRegistrationPage } from "./registrationPage";
import { operationsSectionFromSearch } from "./operationsGuide";
import { memoryAdapter as adapter, resetMemoryStore } from "./memory/adapter";

describe("guided event setup", () => {
  it("adds one optional size question without changing other questions or their audiences", () => {
    const page = normalizeRegistrationPage({ questions: [{ id: "food", label: "Meal choice", type: "text", required: true, audience: "primary" }] });
    const document = emptyEventOperations(); document.apparel.vendorNotes = "Keep the existing packing note";
    const result = planSizeQuestion("event", "shirt", page, document);
    expect(result.questions[0]).toEqual(page.questions[0]);
    expect(result.questions[1]).toMatchObject({ label: "Shirt size", type: "select", required: false, audience: "both" });
    expect(result.document.apparel.questionIds).toEqual([result.questions[1]!.id]);
    expect(result.document.apparel.vendorNotes).toBe(document.apparel.vendorNotes);
    expect(page.questions).toHaveLength(1); expect(document.apparel.questionIds).toEqual([]);
  });
  it("reuses customized and legacy shirt questions instead of duplicating them", () => {
    const page = normalizeRegistrationPage({ questions: [{ id: "legacy", label: "T-shirt size", type: "select", options: ["Small", "Large"], required: true, audience: "primary" }] });
    const first = planSizeQuestion("event", "shirt", page, emptyEventOperations());
    const next = planSizeQuestion("event", "shirt", normalizeRegistrationPage({ questions: first.questions }), first.document);
    expect(next.questions).toEqual(page.questions); expect(next.document.apparel.questionIds).toEqual(["legacy"]);
  });
  it("keeps question identity after a rename and bounds generated IDs", () => {
    const eventId = "x".repeat(200); const first = planSizeQuestion(eventId, "gift", normalizeRegistrationPage(null), emptyEventOperations());
    first.questions[0]!.label = "Choose your gift pack";
    const again = planSizeQuestion(eventId, "gift", normalizeRegistrationPage({ questions: first.questions }), first.document);
    expect(again.questions).toHaveLength(1); expect(again.questions[0]!.id.length).toBeLessThanOrEqual(80);
  });
  it("does not erase questions to make room when a form is full", () => {
    const page = normalizeRegistrationPage({ questions: Array.from({ length: 12 }, (_, i) => ({ id: `question-${i}`, label: `Question ${i}`, type: "text" })) });
    expect(() => planSizeQuestion("event", "pants", page, emptyEventOperations())).toThrow("12 questions");
    expect(page.questions).toHaveLength(12);
  });
  it("restores the chosen tool from a link and sends unknown tools to Start here", () => {
    expect(operationsSectionFromSearch("?day=2&tool=links")).toBe("Bizy Link");
    expect(operationsSectionFromSearch("?tool=sizes")).toBe("Apparel & gear");
    expect(operationsSectionFromSearch("?tool=unknown")).toBe("Start here");
  });
});

describe("guided setup through the data adapter", () => {
  beforeEach(resetMemoryStore);
  it("publishes the size question and packing selection together, with a previous saved copy", async () => {
    const first = await adapter.eventOperations.addSizeQuestion("evt-cab", "shirt", 0);
    const shared = await adapter.events.share("evt-cab");
    const payload = await adapter.events.getByShareToken(shared.shareToken);
    expect(payload?.event.registrationPage?.questions).toEqual(first.questions);
    expect(payload?.apparelSettings?.questionIds).toEqual(first.snapshot.document.apparel.questionIds);
    const second = await adapter.eventOperations.addSizeQuestion("evt-cab", "pants", first.snapshot.revision);
    expect(second.snapshot.previous?.document).toEqual(first.snapshot.document);
    expect((await adapter.eventOperations.get("evt-cab")).document.apparel.questionIds).toHaveLength(2);
  });
  it("rejects an old setup request without adding or losing questions", async () => {
    const first = await adapter.eventOperations.addSizeQuestion("evt-cab", "shirt", 0);
    await expect(adapter.eventOperations.addSizeQuestion("evt-cab", "pants", 0)).rejects.toMatchObject({ code: "conflict" });
    expect((await adapter.events.get("evt-cab"))?.registrationPage?.questions).toEqual(first.questions);
    resetMemoryStore(); expect((await adapter.eventOperations.get("evt-cab")).revision).toBe(0);
  });
});
