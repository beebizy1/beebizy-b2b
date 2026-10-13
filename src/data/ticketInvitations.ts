export interface TicketInvitationRecipientDraft {
  name: string;
  email: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Guest";
  const words = local.split(/[._+-]+/).map((word) => word.trim()).filter(Boolean);
  if (words.length === 0) return "Guest";
  return words.map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`).join(" ").slice(0, 160);
}

/** Accepts either `email` or `Full name, email`, one guest per line. */
export function parseTicketInvitationRecipients(value: string): TicketInvitationRecipientDraft[] {
  const byEmail = new Map<string, TicketInvitationRecipientDraft>();
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
    const email = (parts.length === 1 ? parts[0] : parts.at(-1))?.toLowerCase() ?? "";
    if (!EMAIL.test(email)) continue;
    const suppliedName = parts.length > 1 ? parts.slice(0, -1).join(", ").trim() : "";
    byEmail.set(email, { name: suppliedName || nameFromEmail(email), email });
  }
  return [...byEmail.values()];
}
