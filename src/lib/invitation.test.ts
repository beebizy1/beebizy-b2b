import { describe, expect, it } from "vitest";
import { invitationAcceptanceUrl, isInvitationAcceptance } from "./invitation";

describe("workspace invitation acceptance", () => {
  it("sends Clerk invitations to the dedicated acceptance page", () => {
    expect(invitationAcceptanceUrl("https://beebizy-studio-preview.vercel.app")).toBe(
      "https://beebizy-studio-preview.vercel.app/accept-invitation",
    );
  });

  it("opens account creation only when Clerk supplied an invitation ticket", () => {
    expect(isInvitationAcceptance("?__clerk_ticket=pilot-ticket")).toBe(true);
    expect(isInvitationAcceptance("?utm_source=email")).toBe(false);
    expect(isInvitationAcceptance("")).toBe(false);
  });
});
