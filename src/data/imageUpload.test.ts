import { describe, expect, it, vi } from "vitest";

import { fitImageDimensions, prepareImageForUpload } from "./imageUpload";

describe("image upload preparation", () => {
  it("keeps ordinary images unchanged", async () => {
    const file = new File([new Uint8Array(500_000)], "photo.jpg", { type: "image/jpeg" });
    const transcode = vi.fn();

    expect(await prepareImageForUpload(file, transcode)).toBe(file);
    expect(transcode).not.toHaveBeenCalled();
  });

  it("compresses phone images before the 4 MB request limit", async () => {
    const file = new File([new Uint8Array(5_000_000)], "phone-photo.jpg", { type: "image/jpeg" });
    const compressed = new File([new Uint8Array(3_200_000)], "phone-photo.webp", { type: "image/webp" });
    const transcode = vi.fn().mockResolvedValue(compressed);

    const result = await prepareImageForUpload(file, transcode);

    expect(transcode).toHaveBeenCalledWith(file);
    expect(result).toBe(compressed);
    expect(result.size).toBeLessThan(4_000_000);
  });

  it("fits large dimensions inside the upload canvas without cropping", () => {
    expect(fitImageDimensions(6000, 4000)).toEqual({ width: 2400, height: 1600 });
    expect(fitImageDimensions(1200, 1800)).toEqual({ width: 1200, height: 1800 });
  });
});
