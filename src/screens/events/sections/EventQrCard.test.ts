import { describe, expect, it } from "vitest";

import { eventQrFilename } from "@/data/eventQr";

describe("event QR downloads", () => {
  it("uses a stable readable registration filename", () => {
    expect(eventQrFilename("Annual Partner Gala & Fundraiser")).toBe("annual-partner-gala-fundraiser-registration-qr.png");
    expect(eventQrFilename("!!!")).toBe("event-registration-qr.png");
  });
});
