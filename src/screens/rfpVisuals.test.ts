import { describe, expect, it } from "vitest";
import { rfpSpaceColor } from "./rfpVisuals";

describe("RFP space colors", () => {
  it("gives core hotel spaces distinct visual categories", () => {
    expect(rfpSpaceColor("Registration")).toContain("info");
    expect(rfpSpaceColor("Breakfast")).toContain("warning");
    expect(rfpSpaceColor("Meeting")).toContain("primary");
    expect(rfpSpaceColor("Lunch")).toContain("success");
  });

  it("recognizes related labels and keeps unknown spaces neutral", () => {
    expect(rfpSpaceColor("Guest check-in")).toContain("info");
    expect(rfpSpaceColor("Board session")).toContain("primary");
    expect(rfpSpaceColor("Storage")).toContain("surface-sunken");
  });
});
