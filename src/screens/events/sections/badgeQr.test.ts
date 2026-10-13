import { describe, expect, it } from "vitest";
import { badgeQrMatrix, badgeQrSvgDataUrl } from "./badgeQr";

describe("connected bidder badge QR", () => {
  it("builds a non-empty QR matrix and printable SVG data URL", () => {
    const value = "https://beebizy.test/auction/gala?bidder=private";
    const matrix = badgeQrMatrix(value);
    expect(matrix.size).toBeGreaterThan(20);
    expect(Array.from({ length: matrix.size * matrix.size }, (_, index) => matrix.dark(Math.floor(index / matrix.size), index % matrix.size)).some(Boolean)).toBe(true);
    expect(decodeURIComponent(badgeQrSvgDataUrl(value))).toContain("<svg");
  });
});
