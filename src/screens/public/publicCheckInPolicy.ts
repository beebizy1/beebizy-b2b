import type { PublicCheckInGuest } from "@/data/entities";

export function publicCheckInArrivalAction(guest: PublicCheckInGuest) {
  const badgeIsPreprinted = guest.segment?.trim().toLocaleLowerCase() === "founder";
  return badgeIsPreprinted
    ? { label: "Check in", kind: "check-in" as const, icon: "check-in" as const }
    : { label: "Print badge & check in", kind: "badge-editor" as const, icon: "print" as const };
}
