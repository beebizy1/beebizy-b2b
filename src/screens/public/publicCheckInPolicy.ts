import type { PublicCheckInGuest } from "@/data/entities";

export function publicCheckInArrivalAction(guest: PublicCheckInGuest) {
  const badgeIsPreprinted = guest.segment?.trim().toLocaleLowerCase() === "founder";
  return badgeIsPreprinted
    ? { label: "Check in", printAfter: false, icon: "check-in" as const }
    : { label: "Print badge & check in", printAfter: true, icon: "print" as const };
}
