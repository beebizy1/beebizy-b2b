import { describe, expect, it } from "vitest";
import { orderVendorOperations } from "./vendorOperations";

describe("orderVendorOperations", () => {
  it("sorts timed vendors chronologically and leaves untimed vendors in manual order", () => {
    const rows = [
      { id: "bella", arrivalTime: null, sortOrder: 2 },
      { id: "julio", arrivalTime: "11:45", sortOrder: 1 },
      { id: "dcla", arrivalTime: "11:30", sortOrder: 3 },
      { id: "photo", arrivalTime: null, sortOrder: 1 },
    ];

    expect(orderVendorOperations(rows).map((row) => row.id)).toEqual(["dcla", "julio", "photo", "bella"]);
    expect(rows.map((row) => row.id)).toEqual(["bella", "julio", "dcla", "photo"]);
  });
});
