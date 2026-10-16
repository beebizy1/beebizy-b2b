import { describe, expect, it } from "vitest";
import { auctionStateForSubmissionStatus, submissionStatusPublishesCatalog } from "./fundraising";
import { fundraisingReportCell, fundraisingReportColumnLabel } from "./fundraisingReports";

describe("fundraising school-facing regressions", () => {
  it("shows monetary report columns as dollars rather than raw cents", () => {
    expect(fundraisingReportColumnLabel("estimatedValueCents")).toBe("Estimated value");
    expect(fundraisingReportColumnLabel("fairMarketValueCents")).toBe("Fair market value");
    expect(fundraisingReportCell("estimatedValueCents", 280_000)).toBe("$2,800");
    expect(fundraisingReportCell("fairMarketValueCents", 230_000)).toBe("$2,300");
    expect(fundraisingReportCell("startingBidCents", 112_000)).toBe("$1,120");
    expect(fundraisingReportCell("bidCount", 3)).toBe("3");
  });

  it("publishes the linked auction item when a donation is approved", () => {
    expect(auctionStateForSubmissionStatus("approved")).toEqual({ readinessStatus: "published", isPublished: true });
    expect(auctionStateForSubmissionStatus("in_catalog")).toEqual({ readinessStatus: "published", isPublished: true });
    expect(auctionStateForSubmissionStatus("needs_info")).toEqual({ readinessStatus: "incomplete", isPublished: false });
    expect(submissionStatusPublishesCatalog("approved")).toBe(true);
    expect(submissionStatusPublishesCatalog("in_catalog")).toBe(true);
    expect(submissionStatusPublishesCatalog("needs_info")).toBe(false);
  });
});
