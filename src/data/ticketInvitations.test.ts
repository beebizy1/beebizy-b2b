import { describe, expect, it } from "vitest";
import { eventInvitationRecipients, parseTicketInvitationRecipients, ticketInvitationRsvpPath } from "./ticketInvitations";

describe("ticket invitation recipient input", () => {
  it("routes RSVP-only invitations to registration instead of an empty ticket page", () => {
    expect(ticketInvitationRsvpPath("share token", { hasTickets: false, invitationToken: "invite/token" }))
      .toBe("/e/share%20token?invite=invite%2Ftoken");
    expect(ticketInvitationRsvpPath("share-token", { hasTickets: true, invitationToken: "invite-token" }))
      .toBe("/e/share-token/tickets?invite=invite-token");
    expect(ticketInvitationRsvpPath("share-token", { hasTickets: false, preview: true }))
      .toBe("/e/share-token?preview=1");
  });
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

  it("reuses active event guests while excluding cancelled and duplicate contacts", () => {
    const row = (id: string, eventId: string, status: "confirmed" | "cancelled", name: string, contact: string) => ({ id, eventId, status, guest: { id: `guest-${id}`, name, contact } }) as never;
    expect(eventInvitationRecipients([
      row("1", "event-one", "confirmed", "Ada Lovelace", "ADA@example.com"),
      row("2", "event-one", "confirmed", "Ada Updated", "ada@example.com"),
      row("3", "event-one", "cancelled", "Cancelled Guest", "cancelled@example.com"),
      row("4", "event-two", "confirmed", "Other Event", "other@example.com"),
    ], "event-one")).toEqual([{ name: "Ada Updated", email: "ada@example.com" }]);
  });
});
