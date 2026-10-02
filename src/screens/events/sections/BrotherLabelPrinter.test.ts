import { describe, expect, it, vi } from "vitest";
import {
  BROTHER_BADGE_LENGTH_DOTS,
  BROTHER_BADGE_WIDTH_DOTS,
  printBrotherNameLabel,
  renderBrotherNameLabel,
} from "./BrotherLabelPrinter";

describe("renderBrotherNameLabel", () => {
  it("renders one normalized full name in the exact center of a DK-22251 label", () => {
    const fillRect = vi.fn();
    const fillText = vi.fn();
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray(BROTHER_BADGE_WIDTH_DOTS * BROTHER_BADGE_LENGTH_DOTS * 4),
      width: BROTHER_BADGE_WIDTH_DOTS,
      height: BROTHER_BADGE_LENGTH_DOTS,
      colorSpace: "srgb" as PredefinedColorSpace,
    }) as ImageData);
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "start" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      fillRect,
      fillText,
      getImageData,
      measureText: vi.fn((value: string) => ({ width: value.length * 48 })),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };

    const image = renderBrotherNameLabel("  Tarang   Goyal  ", () => canvas);

    expect(canvas.width).toBe(BROTHER_BADGE_WIDTH_DOTS);
    expect(canvas.height).toBe(BROTHER_BADGE_LENGTH_DOTS);
    expect(fillRect).toHaveBeenCalledWith(0, 0, BROTHER_BADGE_WIDTH_DOTS, BROTHER_BADGE_LENGTH_DOTS);
    expect(fillText).toHaveBeenCalledOnce();
    expect(fillText).toHaveBeenCalledWith("Tarang Goyal", BROTHER_BADGE_WIDTH_DOTS / 2, BROTHER_BADGE_LENGTH_DOTS / 2);
    expect(context.textAlign).toBe("center");
    expect(context.textBaseline).toBe("middle");
    expect(context.fillStyle).toBe("#000000");
    expect(image).toMatchObject({ width: BROTHER_BADGE_WIDTH_DOTS, height: BROTHER_BADGE_LENGTH_DOTS });
    expect(image.data).toBeInstanceOf(Uint8Array);
  });

  it("rejects an empty name instead of printing a blank label", () => {
    expect(() => renderBrotherNameLabel("   ")).toThrow("Enter a full name before printing.");
  });

  it("stops waiting when the printer USB transfer never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          font: "",
          textAlign: "start",
          textBaseline: "alphabetic",
          fillRect: vi.fn(),
          fillText: vi.fn(),
          measureText: () => ({ width: 200 }),
          getImageData: () => ({
            data: new Uint8ClampedArray(BROTHER_BADGE_WIDTH_DOTS * BROTHER_BADGE_LENGTH_DOTS * 4),
            width: BROTHER_BADGE_WIDTH_DOTS,
            height: BROTHER_BADGE_LENGTH_DOTS,
          }),
        }),
      }),
    });
    const printer = {
      connected: true,
      write: vi.fn(() => new Promise<void>(() => undefined)),
      close: vi.fn(() => Promise.resolve()),
    };

    const result = printBrotherNameLabel(printer as never, "Diego", { timeoutMs: 100 })
      .then(() => "printed", (error: unknown) => error instanceof Error ? error.message : "unknown error");
    await vi.advanceTimersByTimeAsync(101);

    await expect(Promise.race([result, Promise.resolve("still pending")]))
      .resolves.toBe("The Brother printer stopped responding. Turn it off and on, then reconnect it.");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
