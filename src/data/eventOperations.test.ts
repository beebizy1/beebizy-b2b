import { describe, expect, it } from "vitest";
import { apparelQuestion, apparelReport, emptyEventOperations, eventOperationsSchema, operationsCurrencyTotals, pageAtApparelCutoff, placeRegistration, preparationMilestones } from "./eventOperations";
import { normalizeRegistrationPage, registrationAnswerFields } from "./registrationPage";
import type { RegistrationWithGuest } from "./entities";
import { bizyVendorScheduleSchema } from "./bizyLink";

const registration = (id: string, patch: Partial<RegistrationWithGuest> = {}) => ({ id, guestId: id, status: "confirmed", registeredAt: "2027-02-01T12:00:00Z", quantity: 1, guest: { name: id }, importedFields: [], ...patch }) as RegistrationWithGuest;
describe("event operations", () => {
  it("builds the requested March 21 preparation roadmap across the year boundary", () => {
    expect(preparationMilestones("2027-03-21T16:00:00Z").map(row => row.dueAt?.slice(0, 10))).toEqual(["2026-12-01", "2026-12-15", "2027-02-15", "2027-03-07", "2027-03-21", "2027-03-24"]);
  });
  it("keeps vendor schedule values compatible with Run of Show time inputs", () => {
    const schedule = { arrivalTime: "08:00", serviceTime: "09:30", departureTime: "15:00", notes: "Serve until 2 PM" };
    expect(bizyVendorScheduleSchema.parse(schedule)).toEqual(schedule);
    expect(() => bizyVendorScheduleSchema.parse({ ...schedule, serviceTime: "9:30 AM - 2 PM" })).toThrow("HH:mm");
  });
  it("allows one table and one foursome, moves atomically and enforces capacities", () => {
    const document = emptyEventOperations();
    document.groups = [
      { id: "table", kind: "table", name: "Table 1", capacity: 1, location: "Main", time: "", floorplanItemId: null },
      { id: "golf", kind: "golf", name: "Foursome 1", capacity: 4, location: "Hole 1", time: "8:30", floorplanItemId: null },
    ];
    const placed = placeRegistration(placeRegistration(document, "Alex", "table", "table"), "Alex", "golf", "golf");
    expect(placed.assignments).toHaveLength(2);
    expect(() => placeRegistration(placed, "Sam", "table", "table")).toThrow("full");
    expect(placed.assignments).toHaveLength(2);
    expect(placeRegistration(placed, "Alex", null, "table").assignments).toEqual([{ registrationId: "Alex", groupId: "golf" }]);
    expect(() => eventOperationsSchema.parse({ ...document, groups: [{ ...document.groups[1], capacity: 5 }] })).toThrow("four");
    expect(() => eventOperationsSchema.parse({ ...placed, assignments: [...placed.assignments, placed.assignments[0]] })).toThrow("one table");
  });
  it("closes only sizing questions at the cutoff, comparing timestamp offsets", () => {
    const page = normalizeRegistrationPage({ questions: [apparelQuestion("shirt", "shirt"), { id: "diet", label: "Dietary needs", type: "text", required: true }] });
    const apparel = { questionIds: ["shirt"], cutoffAt: "2027-02-01T12:00:00-08:00" };
    expect(pageAtApparelCutoff(page, apparel, new Date("2027-02-01T19:59:59Z")).questions).toHaveLength(2);
    expect(pageAtApparelCutoff(page, apparel, new Date("2027-02-01T20:00:00Z")).questions.map(item => item.id)).toEqual(["diet"]);
  });
  it("keeps stable question identities after labels change and supports legacy aliases", () => {
    const old = apparelQuestion("shirt", "shirt");
    const answer = registrationAnswerFields([old], { shirt: "M" });
    const page = normalizeRegistrationPage({ questions: [{ ...old, label: "Event polo size" }] });
    const document = emptyEventOperations(); document.apparel.questionIds = ["shirt"];
    document.apparel.questionLabels = { shirt: ["Shirt size"] };
    const result = apparelReport([registration("Alex", { importedFields: answer }), registration("Sam", { importedFields: [{ label: "Shirt size", value: "L" }] })], page, document);
    expect(result.quantities.map(item => [item.item, item.size, item.requested])).toEqual([["Event polo size", "L", 1], ["Event polo size", "M", 1]]);
  });
  it("deduplicates people, excludes cancellations and late orders, and reconciles inventory", () => {
    const document = emptyEventOperations(); document.apparel.questionIds = ["shirt"];
    document.apparel.cutoffAt = "2027-02-01T12:00:00-08:00";
    document.apparel.received = [{ questionId: "shirt", size: "M", quantity: 3 }]; document.apparel.handedOutRegistrationIds = ["Alex"];
    const fields = [{ label: "Shirt size", value: "M" }];
    const result = apparelReport([
      registration("Alex", { importedFields: fields, registeredAt: "2027-02-01T19:00:00Z", quantity: 2 }),
      registration("old", { guestId: "Alex", importedFields: [{ label: "Shirt size", value: "S" }] }),
      registration("late", { importedFields: fields, registeredAt: "2027-02-01T21:00:00Z" }),
      registration("cancelled", { status: "cancelled", importedFields: fields }),
    ], normalizeRegistrationPage({ questions: [apparelQuestion("shirt", "shirt")] }), document);
    expect(result.quantities).toEqual([{ questionId: "shirt", item: "Shirt size", size: "M", requested: 1, received: 3, handedOut: 1 }]);
    expect(result.unnamedExtraGuests).toBe(1);
  });
  it("never combines different currencies or counts bill-paid auction amounts twice", () => {
    const result = operationsCurrencyTotals([{ currency: "USD", amount: 500 }], [{ currency: "EUR", amount: 700 }], [{ currency: "usd", amount: 100 }], [{ currency: "USD", amount: 200 }]);
    expect(result.map(row => [row.currency, row.collectedCents])).toEqual([["EUR", 700], ["USD", 800]]);
  });
  it("keeps physical handouts in inventory when production closes before a registration", () => {
    const document = emptyEventOperations(); document.apparel.questionIds = ["shirt"];
    document.apparel.cutoffAt = "2027-01-01T12:00:00Z";
    document.apparel.received = [{ questionId: "shirt", size: "M", quantity: 3 }];
    document.apparel.handedOutRegistrationIds = ["late"];
    const report = apparelReport([registration("late", { importedFields: [{ label: "Shirt size", value: "M" }] })], normalizeRegistrationPage({ questions: [apparelQuestion("shirt", "shirt")] }), document);
    expect(report.quantities).toEqual([{ questionId: "shirt", item: "Shirt size", size: "M", requested: 0, received: 3, handedOut: 1 }]);
  });
  it("retains recorded handouts after cancellation without counting a new production order", () => {
    const document = emptyEventOperations(); document.apparel.questionIds = ["shirt"];
    document.apparel.handedOutRegistrationIds = ["cancelled"];
    const report = apparelReport([registration("cancelled", { status: "cancelled", importedFields: [{ label: "Shirt size", value: "L" }] })], normalizeRegistrationPage({ questions: [apparelQuestion("shirt", "shirt")] }), document);
    expect(report.quantities).toEqual([{ questionId: "shirt", item: "Shirt size", size: "L", requested: 0, received: 0, handedOut: 1 }]);
    expect(report.individual[0]?.registrationStatus).toBe("cancelled");
  });
});
