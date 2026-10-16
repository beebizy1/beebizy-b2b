import { degrees, PDFDocument, StandardFonts, rgb, type PDFDocument as PdfDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { createHash } from "node:crypto";
import type { Event, Floorplan, FloorplanItem, FloorplanPoint, RunOfShowItem } from "../data/entities.ts";
import { vendorPacketContentKey, vendorPacketFileSlug, type VendorEventPacketDraft } from "../data/vendorEventPackets.ts";
import { formatClockTime, timeZoneLabel } from "../lib/datetime.ts";
import type { EmailMessage } from "./notify.ts";

const ITEM_DEFAULTS: Record<FloorplanItem["shape"], { width: number; height: number }> = {
  "round-table": { width: 9, height: 12 }, "long-table": { width: 22, height: 7 }, stage: { width: 30, height: 9 },
  bar: { width: 8, height: 16 }, entrance: { width: 12, height: 6 }, dancefloor: { width: 24, height: 20 },
  booth: { width: 10, height: 10 }, av: { width: 9, height: 7 }, tree: { width: 7, height: 10 },
  chair: { width: 4, height: 6 }, "chair-row": { width: 24, height: 6 }, "custom-shape": { width: 18, height: 14 },
  image: { width: 18, height: 14 }, text: { width: 20, height: 7 },
};
const MAX_FLOORPLAN_OBJECTS = 2_000;
const MAX_UNIQUE_IMAGES = 50;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;

export function vendorPacketSnapshotFingerprint(input: {
  draft: VendorEventPacketDraft;
  event: Event;
  eventWhen: string;
  eventLocation: string;
  timeZone: string;
  cues: RunOfShowItem[];
  plans: Floorplan[];
}): string {
  const snapshot = {
    content: vendorPacketContentKey(input.draft),
    event: { title: input.event.title, date: input.event.date, endDate: input.event.endDate, when: input.eventWhen, location: input.eventLocation, timeZone: input.timeZone },
    cues: [...input.cues].sort((a, b) => a.id.localeCompare(b.id)).map((cue) => ({ ...cue })),
    plans: [...input.plans].sort((a, b) => a.id.localeCompare(b.id)).map((plan) => ({ id: plan.id, name: plan.name, room: plan.room ?? null, items: plan.items, updatedAt: plan.updatedAt })),
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export interface FloorplanPdfRenderObject {
  id: string;
  shape: FloorplanItem["shape"];
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points: FloorplanPoint[];
  customShapeMode: FloorplanItem["customShapeMode"];
  imageUrl: string | null;
}

export function floorplanPdfRenderModel(plan: Floorplan): { roomShape: NonNullable<Floorplan["room"]>["shape"]; roomPoints: FloorplanPoint[]; objects: FloorplanPdfRenderObject[] } {
  const roomShape = plan.room?.shape ?? "rectangle";
  const roomPoints = roomShape === "oval" ? [] : plan.room?.points?.map((point) => ({ ...point })) ?? [{ x: 2, y: 2 }, { x: 98, y: 2 }, { x: 98, y: 98 }, { x: 2, y: 98 }];
  return {
    roomShape,
    roomPoints,
    objects: plan.items.map((item) => ({
      id: item.id,
      shape: item.shape,
      label: item.label,
      x: item.x,
      y: item.y,
      width: item.width ?? ITEM_DEFAULTS[item.shape].width,
      height: item.height ?? ITEM_DEFAULTS[item.shape].height,
      rotation: item.rotation ?? 0,
      points: item.points?.map((point) => ({ ...point })) ?? [],
      customShapeMode: item.customShapeMode,
      imageUrl: item.imageUrl ?? null,
    })),
  };
}

const safePdfText = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");

function wrappedLines(text: string, maxCharacters: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of safePdfText(text).split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildRunOfShowPdf(input: { event: Event; cues: RunOfShowItem[]; timeZone: string }): Promise<string> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const cues = [...input.cues].sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder);
  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    page = document.addPage([612, 792]);
    y = 742;
    page.drawText(safePdfText(input.event.title), { x: 40, y, size: 20, font: bold, color: rgb(0.08, 0.08, 0.08) });
    y -= 26;
    page.drawText(`Run of show - ${timeZoneLabel(input.timeZone, new Date(input.event.date))}`, { x: 40, y, size: 10, font: regular, color: rgb(0.35, 0.35, 0.35) });
    y -= 28;
  };
  const ensureSpace = (height: number) => {
    if (y - height < 45) addPage();
  };
  addPage();
  let currentDay = 0;
  for (const cue of cues) {
    ensureSpace(70);
    if (cue.dayNumber !== currentDay) {
      currentDay = cue.dayNumber;
      page!.drawText(`Day ${currentDay}`, { x: 40, y, size: 14, font: bold, color: rgb(0.55, 0.42, 0) });
      y -= 22;
    }
    page!.drawText(formatClockTime(cue.startTime), { x: 40, y, size: 10, font: bold });
    const titleLines = wrappedLines(cue.title, 62);
    for (const [index, line] of titleLines.entries()) {
      if (index > 0) ensureSpace(14);
      page!.drawText(line, { x: 112, y, size: 11, font: bold });
      y -= 14;
    }
    if (cue.duration) page!.drawText(`${cue.duration} min`, { x: 515, y: y + titleLines.length * 14, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) });
    if (cue.responsible) {
      for (const line of wrappedLines(`Owner: ${cue.responsible}`, 76)) {
        ensureSpace(13);
        page!.drawText(line, { x: 112, y, size: 9, font: regular, color: rgb(0.25, 0.25, 0.25) });
        y -= 12;
      }
    }
    for (const line of cue.description ? wrappedLines(cue.description, 76) : []) {
      ensureSpace(13);
      page!.drawText(line, { x: 112, y, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) });
      y -= 12;
    }
    ensureSpace(16);
    page!.drawLine({ start: { x: 40, y: y - 4 }, end: { x: 572, y: y - 4 }, thickness: 0.5, color: rgb(0.88, 0.85, 0.75) });
    y -= 16;
  }
  if (cues.length === 0) page!.drawText("No run-of-show cues have been added yet.", { x: 40, y, size: 11, font: regular });
  return Buffer.from(await document.save()).toString("base64");
}

function rotatePoint(point: { x: number; y: number }, center: { x: number; y: number }, clockwiseDegrees: number) {
  const radians = (-clockwiseDegrees * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
}

function polygonPoint(point: FloorplanPoint, center: { x: number; y: number }, width: number, height: number, rotation: number) {
  return rotatePoint({ x: center.x + (point.x / 100 - 0.5) * width, y: center.y + (0.5 - point.y / 100) * height }, center, rotation);
}

async function readBoundedResponse(response: Response, limit: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error("Image too large");
  if (!response.body) throw new Error("Image body unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Image too large");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function embeddedImage(document: PdfDocument, url: string, cache: Map<string, PDFImage | null>, budget: { imageCount: number; totalBytes: number }): Promise<PDFImage | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.toLowerCase().endsWith(".blob.vercel-storage.com")) throw new Error("Untrusted image host");
    if (budget.imageCount >= MAX_UNIQUE_IMAGES) throw new Error("Too many images");
    const remainingTotal = MAX_TOTAL_IMAGE_BYTES - budget.totalBytes;
    if (remainingTotal <= 0) throw new Error("Image budget exhausted");
    budget.imageCount += 1;
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("Image unavailable");
    const bytes = await readBoundedResponse(response, Math.min(MAX_IMAGE_BYTES, remainingTotal));
    budget.totalBytes += bytes.byteLength;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const image = contentType.includes("png") ? await document.embedPng(bytes) : contentType.includes("jpeg") || contentType.includes("jpg") ? await document.embedJpg(bytes) : null;
    cache.set(url, image);
    return image;
  } catch {
    cache.set(url, null);
    return null;
  }
}

function drawClosedPolygon(page: PDFPage, points: Array<{ x: number; y: number }>, color = rgb(0.32, 0.48, 0.72), thickness = 1.2) {
  if (points.length < 2) return;
  for (let index = 0; index < points.length; index += 1) page.drawLine({ start: points[index]!, end: points[(index + 1) % points.length]!, thickness, color });
}

export async function buildFloorplansPdf(input: { event: Event; plans: Floorplan[] }): Promise<string> {
  if (input.plans.reduce((total, plan) => total + plan.items.length, 0) > MAX_FLOORPLAN_OBJECTS) throw new Error("Selected floorplans contain too many objects to export safely.");
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const imageCache = new Map<string, PDFImage | null>();
  const imageBudget = { imageCount: 0, totalBytes: 0 };
  for (const plan of input.plans) {
    const page = document.addPage([792, 612]);
    page.drawText(safePdfText(input.event.title), { x: 36, y: 570, size: 18, font: bold });
    page.drawText(safePdfText(plan.name), { x: 36, y: 545, size: 12, font: regular, color: rgb(0.35, 0.35, 0.35) });
    const canvas = { x: 36, y: 36, width: 720, height: 480 };
    const model = floorplanPdfRenderModel(plan);
    page.drawRectangle({ ...canvas, color: rgb(1, 0.99, 0.95) });
    if (model.roomShape === "oval") page.drawEllipse({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2, xScale: canvas.width * 0.48, yScale: canvas.height * 0.48, borderWidth: 2, borderColor: rgb(0.8, 0.65, 0) });
    else drawClosedPolygon(page, model.roomPoints.map((point) => ({ x: canvas.x + canvas.width * (point.x / 100), y: canvas.y + canvas.height * (1 - point.y / 100) })), rgb(0.8, 0.65, 0), 2);

    for (const item of model.objects) {
      const width = Math.max(12, canvas.width * (item.width / 100));
      const height = Math.max(12, canvas.height * (item.height / 100));
      const center = { x: canvas.x + canvas.width * (item.x / 100), y: canvas.y + canvas.height * (1 - item.y / 100) };
      const fill = item.shape === "stage" ? rgb(0.07, 0.1, 0.18) : item.shape === "bar" ? rgb(0.9, 0.96, 1) : item.shape === "text" ? rgb(1, 1, 1) : rgb(1, 0.97, 0.78);
      if (item.shape === "round-table" || item.shape === "tree") {
        page.drawEllipse({ x: center.x, y: center.y, xScale: width / 2, yScale: height / 2, color: fill, borderColor: rgb(0.45, 0.5, 0.58), borderWidth: 0.8 });
      } else if (item.shape === "custom-shape") {
        const points = item.points.length >= 3 ? item.points : [{ x: 8, y: 18 }, { x: 72, y: 6 }, { x: 94, y: 42 }, { x: 78, y: 92 }, { x: 18, y: 84 }];
        drawClosedPolygon(page, points.map((point) => polygonPoint(point, center, width, height, item.rotation)));
      } else if (item.shape === "image" && item.imageUrl) {
        const image = await embeddedImage(document, item.imageUrl, imageCache, imageBudget);
        const origin = rotatePoint({ x: center.x - width / 2, y: center.y - height / 2 }, center, item.rotation);
        if (image) page.drawImage(image, { x: origin.x, y: origin.y, width, height, rotate: degrees(-item.rotation) });
        else page.drawRectangle({ x: origin.x, y: origin.y, width, height, rotate: degrees(-item.rotation), color: rgb(0.94, 0.94, 0.94), borderColor: rgb(0.45, 0.5, 0.58), borderWidth: 0.8 });
      } else if (item.shape !== "text") {
        const origin = rotatePoint({ x: center.x - width / 2, y: center.y - height / 2 }, center, item.rotation);
        page.drawRectangle({ x: origin.x, y: origin.y, width, height, rotate: degrees(-item.rotation), color: fill, borderColor: rgb(0.45, 0.5, 0.58), borderWidth: 0.8 });
      }
      const label = safePdfText(item.label);
      const size = item.shape === "text" ? Math.min(16, Math.max(8, height * 0.3)) : Math.min(9, Math.max(5, width / Math.max(label.length, 1) * 1.3));
      const font = item.shape === "stage" || item.shape === "text" ? bold : regular;
      const labelWidth = font.widthOfTextAtSize(label, size);
      page.drawText(label, { x: center.x - labelWidth / 2, y: center.y - size / 3, size, font, color: item.shape === "stage" ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1), rotate: degrees(-item.rotation) });
    }
  }
  return Buffer.from(await document.save()).toString("base64");
}

export async function vendorPacketAttachments(event: Event, cues: RunOfShowItem[], plans: Floorplan[], includeRunOfShow: boolean, timeZone: string): Promise<NonNullable<EmailMessage["attachments"]>> {
  const slug = vendorPacketFileSlug(event.title);
  const attachments: NonNullable<EmailMessage["attachments"]> = [];
  if (includeRunOfShow && cues.length) attachments.push({ filename: `${slug}-run-of-show.pdf`, content: await buildRunOfShowPdf({ event, cues, timeZone }), content_type: "application/pdf" });
  if (plans.length) attachments.push({ filename: `${slug}-floorplans.pdf`, content: await buildFloorplansPdf({ event, plans }), content_type: "application/pdf" });
  return attachments;
}
