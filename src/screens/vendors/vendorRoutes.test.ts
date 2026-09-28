import { describe, expect, it } from "vitest";
import { vendorEditHref } from "./vendorRoutes";

describe("vendor routes", () => {
  it("builds a dedicated edit destination for an existing vendor", () => {
    expect(vendorEditHref("ven/apex")).toBe("/app/vendors/ven%2Fapex/edit");
  });
});
