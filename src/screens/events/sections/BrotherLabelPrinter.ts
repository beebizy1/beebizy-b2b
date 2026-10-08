import {
  encodeJobForEngine,
  findDevice,
  findMedia,
  flipHorizontal,
  renderMultiPlaneImage,
  type BrotherQLMedia,
  type RawImageData,
} from "@thermal-label/brother-ql-core";
import { normalizeBadgeName, suggestBadgeNameLayout, type BadgeNameLayout } from "./badgeNameLayout";

export const BROTHER_BADGE_WIDTH_DOTS = 696;
export const BROTHER_BADGE_LENGTH_DOTS = 1063;
const BROTHER_QL800_VENDOR_ID = 0x04f9;
const BROTHER_QL800_PRODUCT_ID = 0x209b;
const DK_22251_MEDIA_ID = 251;
const MAX_NAME_WIDTH_DOTS = BROTHER_BADGE_WIDTH_DOTS - 80;
const USB_INTERFACE_NUMBER = 0;
const USB_CONFIGURATION_VALUE = 1;
const DEFAULT_PRINT_TIMEOUT_MS = 8_000;

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

export interface BrotherQl800Printer {
  readonly connected: boolean;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface PrintOptions {
  timeoutMs?: number;
}

interface BrotherUsbDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly configuration?: {
    readonly configurationValue: number;
    readonly interfaces: ReadonlyArray<{
      readonly interfaceNumber: number;
      readonly alternate: {
        readonly endpoints: ReadonlyArray<{ readonly direction: string; readonly endpointNumber: number }>;
      };
    }>;
  };
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ readonly status: string; readonly bytesWritten: number }>;
}

interface NavigatorWithUsb extends Navigator {
  readonly usb: {
    getDevices(): Promise<BrotherUsbDevice[]>;
    requestDevice(options: { filters: Array<{ vendorId: number; productId: number }> }): Promise<BrotherUsbDevice>;
  };
}

function normalizeLayout(nameOrLayout: string | BadgeNameLayout): BadgeNameLayout {
  const layout = typeof nameOrLayout === "string" ? suggestBadgeNameLayout(nameOrLayout) : nameOrLayout;
  const normalized = normalizeBadgeName(`${layout.line1} ${layout.line2}`);
  if (!normalized) throw new Error("Enter a full name before printing.");
  return {
    line1: normalizeBadgeName(layout.line1),
    line2: normalizeBadgeName(layout.line2),
  };
}

export function renderBrotherNameLabel(
  nameOrLayout: string | BadgeNameLayout,
  createCanvas: CanvasFactory = () => document.createElement("canvas") as unknown as BadgeCanvas,
): RawImageData {
  const layout = normalizeLayout(nameOrLayout);
  const lines = [layout.line1, layout.line2].filter(Boolean);
  const canvas = createCanvas();
  canvas.width = BROTHER_BADGE_WIDTH_DOTS;
  canvas.height = BROTHER_BADGE_LENGTH_DOTS;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not prepare the badge label.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";

  let fontSize = lines.length === 2 ? 112 : 128;
  do {
    context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
    if (Math.max(...lines.map((line) => context.measureText(line).width)) <= MAX_NAME_WIDTH_DOTS || fontSize === 48) break;
    fontSize = Math.max(48, fontSize - 4);
  } while (fontSize >= 48);

  context.fillStyle = "#000000";
  const lineOffset = fontSize * 0.625;
  lines.forEach((line, index) => {
    const y = lines.length === 1
      ? canvas.height / 2
      : canvas.height / 2 + (index === 0 ? -lineOffset : lineOffset);
    context.fillText(line, canvas.width / 2, y);
  });
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

function ql800Device(device: BrotherUsbDevice): boolean {
  return device.vendorId === BROTHER_QL800_VENDOR_ID && device.productId === BROTHER_QL800_PRODUCT_ID;
}

async function closeUsbDevice(device: BrotherUsbDevice): Promise<void> {
  if (!device.opened) return;
  try {
    await device.releaseInterface(USB_INTERFACE_NUMBER);
  } catch {
    // A disconnected or timed-out device may already have released the interface.
  }
  try {
    await device.close();
  } catch {
    // Closing is best-effort after a USB failure.
  }
}

async function openBrotherQl800(device: BrotherUsbDevice): Promise<BrotherQl800Printer> {
  if (!device.opened) await device.open();
  if (device.configuration?.configurationValue !== USB_CONFIGURATION_VALUE) {
    await device.selectConfiguration(USB_CONFIGURATION_VALUE);
  }
  await device.claimInterface(USB_INTERFACE_NUMBER);
  const usbInterface = device.configuration?.interfaces.find((entry) => entry.interfaceNumber === USB_INTERFACE_NUMBER);
  const endpointOut = usbInterface?.alternate.endpoints.find((endpoint) => endpoint.direction === "out")?.endpointNumber;
  if (endpointOut === undefined) {
    await closeUsbDevice(device);
    throw new Error("The Brother QL-800 USB output could not be opened.");
  }

  return {
    get connected() {
      return device.opened;
    },
    async write(data) {
      const payload = new Uint8Array(data.byteLength);
      payload.set(data);
      const result = await device.transferOut(endpointOut, payload);
      if (result.status !== "ok" || result.bytesWritten !== payload.byteLength) {
        throw new Error("The Brother QL-800 did not accept the complete badge.");
      }
    },
    close: () => closeUsbDevice(device),
  };
}

export async function connectBrotherQl800(): Promise<BrotherQl800Printer> {
  if (!supportsBrotherWebUsb()) {
    throw new Error("Direct Brother printing requires Chrome or Edge on the secure Beebizy website.");
  }
  const usb = (navigator as NavigatorWithUsb).usb;
  const pairedDevices = await usb.getDevices();
  const device = pairedDevices.find(ql800Device) ?? await usb.requestDevice({
    filters: [{ vendorId: BROTHER_QL800_VENDOR_ID, productId: BROTHER_QL800_PRODUCT_ID }],
  });
  return openBrotherQl800(device);
}

function encodeBrotherNameLabel(nameOrLayout: string | BadgeNameLayout): Uint8Array {
  const media = findMedia(DK_22251_MEDIA_ID) as BrotherQLMedia | undefined;
  if (!media) throw new Error("The Brother DK-22251 label format is unavailable.");
  const device = findDevice(BROTHER_QL800_VENDOR_ID, BROTHER_QL800_PRODUCT_ID);
  const engine = device?.engines[0];
  if (!device || !engine) throw new Error("The Brother QL-800 print format is unavailable.");
  const { black, red } = renderMultiPlaneImage(renderBrotherNameLabel(nameOrLayout), {
    palette: media.palette ?? [],
    rotate: 0,
  });
  return encodeJobForEngine([
    {
      bitmap: flipHorizontal(black),
      redBitmap: flipHorizontal(red),
      media,
      options: { compress: true },
    },
  ], {}, engine, device.name);
}

async function withPrintTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("The Brother printer stopped responding. Turn it off and on, then reconnect it."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function printBrotherNameLabel(
  printer: BrotherQl800Printer,
  nameOrLayout: string | BadgeNameLayout,
  options: PrintOptions = {},
): Promise<void> {
  await withPrintTimeout(printer.write(encodeBrotherNameLabel(nameOrLayout)), options.timeoutMs ?? DEFAULT_PRINT_TIMEOUT_MS);
}
