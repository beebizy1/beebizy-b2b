import { describe, expect, it } from "vitest";
import { centsFromInput, centsToInput, formatMoney, parseMoney, percentOf, serializeMoney, sumCents } from "./money";

describe("parseMoney", () => {
  it("reads the legacy string shapes Firestore documents actually contain", () => {
    expect(parseMoney("1500")).toBe(150_000);
    expect(parseMoney("1500.50")).toBe(150_050);
    expect(parseMoney("$1,500.50")).toBe(150_050);
    expect(parseMoney("1,500")).toBe(150_000);
    expect(parseMoney(1500)).toBe(150_000);
  });

  it("distinguishes absent from zero", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("not money")).toBeNull();
    expect(parseMoney("0")).toBe(0);
  });

  it("rounds to whole cents rather than carrying float error", () => {
    expect(parseMoney("0.005")).toBe(1);
    expect(parseMoney("19.999")).toBe(2000);
  });

  it("survives a round trip through the legacy string format", () => {
    for (const cents of [0, 1, 99, 100, 150_050, 6_400_000]) {
      expect(parseMoney(serializeMoney(cents))).toBe(cents);
    }
  });
});

describe("comparison", () => {
  it("orders amounts numerically — the bug string bids had", () => {
    // "90" > "100" is true for strings, which is how a $90 bid used to beat $100.
    expect("90" > "100").toBe(true);
    expect(parseMoney("90")! > parseMoney("100")!).toBe(false);
  });
});

describe("sumCents", () => {
  it("ignores absent amounts instead of producing NaN", () => {
    expect(sumCents([100, null, 250, undefined])).toBe(350);
    expect(sumCents([])).toBe(0);
  });

  it("does not drift on amounts that break float addition", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 100 }, () => 1))).toBe(100);
  });
});

describe("formatMoney", () => {
  it("trims .00 on whole amounts but keeps real cents", () => {
    expect(formatMoney(150_000)).toBe("$1,500");
    expect(formatMoney(150_050)).toBe("$1,500.50");
  });

  it("renders absent amounts as an em dash, not $0", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(0)).toBe("$0");
  });

  it("compacts large amounts", () => {
    expect(formatMoney(35_470_000, { compact: true })).toBe("$354.7K");
  });
});

describe("form field helpers", () => {
  it("round-trips through an input value", () => {
    expect(centsToInput(120_050)).toBe("1200.50");
    expect(centsFromInput("1200.50")).toBe(120_050);
    expect(centsToInput(null)).toBe("");
    expect(centsFromInput("")).toBeNull();
  });
});

describe("percentOf", () => {
  it("returns null rather than dividing by zero", () => {
    expect(percentOf(500, 0)).toBeNull();
    expect(percentOf(500, -1)).toBeNull();
    expect(percentOf(250, 1000)).toBe(25);
  });
});
