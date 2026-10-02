import { findMedia, type RawImageData } from "@thermal-label/brother-ql-core";
import { requestPrinter, type WebBrotherQLPrinter } from "@thermal-label/brother-ql-web";

export const BROTHER_BADGE_WIDTH_DOTS = 696;
export const BROTHER_BADGE_LENGTH_DOTS = 1063;
const BROTHER_QL800_VENDOR_ID = 0x04f9;
const BROTHER_QL800_PRODUCT_ID = 0x209b;
const DK_22251_MEDIA_ID = 251;
const MAX_NAME_WIDTH_DOTS = BROTHER_BADGE_WIDTH_DOTS - 80;

interface BadgeCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  measureText(text: string): Pick<TextMetrics, "width">;
}

interface BadgeCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d", options?: CanvasRenderingContext2DSettings): BadgeCanvasContext | null;
}

type CanvasFactory = () => BadgeCanvas;

export type BrotherQl800Printer = WebBrotherQLPrinter;

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Enter a full name before printing.");
  return normalized;
}

export function renderBrotherNameLabel(
  name: string,
  createCanvas: CanvasFactory = () => document.createElement("canvas") as unknown as BadgeCanvas,
): RawImageData {
  const normalizedName = normalizeName(name);
  const canvas = createCanvas();
  canvas.width = BROTHER_BADGE_WIDTH_DOTS;
  canvas.height = BROTHER_BADGE_LENGTH_DOTS;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not prepare the badge label.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";

  let fontSize = 128;
  do {
    context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
    if (context.measureText(normalizedName).width <= MAX_NAME_WIDTH_DOTS || fontSize === 48) break;
    fontSize = Math.max(48, fontSize - 4);
  } while (fontSize >= 48);

  context.fillStyle = "#000000";
  context.fillText(normalizedName, canvas.width / 2, canvas.height / 2);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: image.width,
    height: image.height,
    data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
  };
}

export function supportsBrotherWebUsb(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && "usb" in navigator && window.isSecureContext;
}

export async function connectBrotherQl800(): Promise<BrotherQl800Printer> {
  if (!supportsBrotherWebUsb()) {
    throw new Error("Direct Brother printing requires Chrome or Edge on the secure Beebizy website.");
  }
  return requestPrinter({
    filters: [{ vendorId: BROTHER_QL800_VENDOR_ID, productId: BROTHER_QL800_PRODUCT_ID }],
  });
}

export async function printBrotherNameLabel(printer: BrotherQl800Printer, name: string): Promise<void> {
  const media = findMedia(DK_22251_MEDIA_ID);
  if (!media) throw new Error("The Brother DK-22251 label format is unavailable.");
  await printer.print(renderBrotherNameLabel(name), media, { rotate: 0 });
}
