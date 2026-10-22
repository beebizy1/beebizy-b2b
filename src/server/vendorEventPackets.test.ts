import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Event, Floorplan, RunOfShowItem } from "../data/entities";
import { buildFloorplansPdf, buildRunOfShowPdf, floorplanPdfRenderModel, vendorPacketSnapshotFingerprint } from "./vendorPacketPdfs";

const event: Event = {
  id: "event-1", ownerId: "owner-1", title: "Demo Day", description: null,
  date: "2026-10-20T00:00:00.000Z", endDate: null, location: "Mission Gardens",
  locationId: null, locationRecord: null, capacity: 200, status: "published", category: "Gala",
  imageUrl: null, registrationCount: 0, shareToken: null, registrationPage: {
    template: "warm", headline: "", welcomeMessage: "", accentColor: "#FFD700", heroImageUrl: null, aboutImageUrl: null, agendaImageUrl: null,
    paymentUrl: null, showAgenda: true, showSpeakers: true, showSponsors: true, showVolunteerSignup: true, speakers: [], registrationTypes: ["General"], collectOrganization: true,
  }, createdAt: "2026-10-01T00:00:00.000Z",
};

const cue: RunOfShowItem = {
  id: "cue-1", eventId: event.id, dayNumber: 1, startTime: "17:30", duration: 30,
  title: "Vendor load-in", description: "Use the west entrance and check in with the event lead.",
  responsible: "Operations", assignedEmail: null, completed: false, sortOrder: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const plan: Floorplan = {
  id: "plan-1", eventId: event.id, name: "Main ballroom", updatedAt: "2026-10-14T00:00:00.000Z",
  items: [
    { id: "stage", shape: "stage", label: "Main stage", x: 50, y: 12, seats: null, width: 42, height: 10 },
    { id: "table", shape: "round-table", label: "Table 1", x: 40, y: 55, seats: 10, width: 12, height: 12 },
  ],
};

describe("vendor event packet PDFs", () => {
  it("creates a readable run-of-show PDF", async () => {
    const encoded = await buildRunOfShowPdf({ event, cues: [cue], timeZone: "America/Los_Angeles" });
    const pdf = await PDFDocument.load(Buffer.from(encoded, "base64"));
    expect(pdf.getPageCount()).toBe(1);
  });

  it("creates one floorplan page per selected room", async () => {
    const encoded = await buildFloorplansPdf({ event, plans: [plan, { ...plan, id: "plan-2", name: "Terrace" }] });
    const pdf = await PDFDocument.load(Buffer.from(encoded, "base64"));
    expect(pdf.getPageCount()).toBe(2);
  });

  it("preserves room outlines, rotation, custom points, text, and uploaded images in the render model", () => {
    const detailed: Floorplan = {
      ...plan,
      room: { shape: "custom", widthFeet: 90, lengthFeet: 60, points: [{ x: 5, y: 8 }, { x: 95, y: 4 }, { x: 80, y: 92 }] },
      items: [
        { id: "custom", shape: "custom-shape", label: "Curved lounge", x: 20, y: 30, seats: null, width: 24, height: 18, rotation: 37, customShapeMode: "freehand", points: [{ x: 4, y: 10 }, { x: 90, y: 22 }, { x: 72, y: 96 }] },
        { id: "text", shape: "text", label: "VIP SECTION", x: 50, y: 50, seats: null, rotation: 12 },
        { id: "image", shape: "image", label: "Sponsor logo", x: 70, y: 60, seats: null, imageUrl: "https://example.com/logo.png", rotation: 90 },
      ],
    };
    const model = floorplanPdfRenderModel(detailed);
    expect(model.roomShape).toBe("custom");
    expect(model.roomPoints).toEqual(detailed.room?.points);
    expect(model.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "custom", rotation: 37, customShapeMode: "freehand", points: detailed.items[0]?.points }),
      expect.objectContaining({ id: "text", label: "VIP SECTION", rotation: 12 }),
      expect.objectContaining({ id: "image", imageUrl: "https://example.com/logo.png", rotation: 90 }),
    ]));
  });

  it("paginates instead of truncating long run-of-show descriptions", async () => {
    const encoded = await buildRunOfShowPdf({ event, cues: [{ ...cue, description: "Detailed vendor instruction ".repeat(500) }], timeZone: "America/Los_Angeles" });
    const pdf = await PDFDocument.load(Buffer.from(encoded, "base64"));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("invalidates an exact test when event details or attachment source data changes", () => {
    const draft = { vendorIds: [], subject: "Final details", message: "Please review", includeRunOfShow: true, floorplanIds: [plan.id], requestId: "request-1", consentConfirmed: false };
    const fingerprint = (overrides: Partial<Parameters<typeof vendorPacketSnapshotFingerprint>[0]> = {}) => vendorPacketSnapshotFingerprint({
      draft, event, eventWhen: "Tue, Oct 20, 2026, 5:00 PM", eventLocation: "Mission Gardens",
      timeZone: "America/Los_Angeles", cues: [cue], plans: [plan], ...overrides,
    });
    const original = fingerprint();
    expect(fingerprint({ eventLocation: "New ballroom" })).not.toBe(original);
    expect(fingerprint({ cues: [{ ...cue, description: "Changed load-in details" }] })).not.toBe(original);
    expect(fingerprint({ plans: [{ ...plan, items: [{ ...plan.items[0]!, rotation: 45 }] }] })).not.toBe(original);
  });

  it("rejects an unsafe number of floorplan objects before rendering", async () => {
    const crowded = { ...plan, items: Array.from({ length: 2_001 }, (_, index) => ({ ...plan.items[0]!, id: `item-${index}` })) };
    await expect(buildFloorplansPdf({ event, plans: [crowded] })).rejects.toThrow(/too many objects/i);
  });
});
