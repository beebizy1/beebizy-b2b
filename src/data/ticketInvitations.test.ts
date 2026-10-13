import { describe, expect, it } from "vitest";
import { parseTicketInvitationRecipients } from "./ticketInvitations";

describe("ticket invitation recipient input", () => {
  it("accepts an email without requiring a separate name", () => {
    expect(parseTicketInvitationRecipients("laila@beebizy.com")).toEqual([
      { name: "Laila", email: "laila@beebizy.com" },
    ]);
  });

  it("accepts named rows and sends duplicate emails once", () => {
    expect(parseTicketInvitationRecipients("Laila Marshall, laila@beebizy.com\nNew Name, LAILA@beebizy.com\nPoorvi Shukla, poorvi@example.com"))
      .toEqual([
        { name: "New Name", email: "laila@beebizy.com" },
        { name: "Poorvi Shukla", email: "poorvi@example.com" },
      ]);
  });

  it("ignores malformed lines", () => {
    expect(parseTicketInvitationRecipients("not-an-email\nName only,")).toEqual([]);
  });
});
