import { publicRegistrationIdentity } from "./publicRegistrationIdentity.ts";
import { registrationAnswerFields, type RegistrationPageSettings } from "./registrationPage.ts";

export interface PublicRsvpPerson { name: string; email: string | null; fields: Array<{ label: string; value: string }> }
export function preparePublicRsvpParty(page: RegistrationPageSettings, input: Record<string, unknown>): PublicRsvpPerson[] {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const validEmail = (value: string) => value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  const primary = publicRegistrationIdentity(input);
  const people: PublicRsvpPerson[] = [{ name: primary.name, email, fields: [...primary.fields, ...registrationAnswerFields(page.questions, input.answers)] }];
  if (input.additionalGuests === undefined) return people;
  if (!Array.isArray(input.additionalGuests)) throw new Error("Check your additional guest list.");
  if (input.additionalGuests.length && !page.maxAdditionalGuests) throw new Error("This event does not allow additional guests.");
  if (input.additionalGuests.length > page.maxAdditionalGuests) throw new Error(`You can add up to ${page.maxAdditionalGuests} guest${page.maxAdditionalGuests === 1 ? "" : "s"} for this event.`);
  const emails = new Set([email]);
  for (const [index, raw] of input.additionalGuests.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Check guest ${index + 1}'s details.`);
    const guest = raw as Record<string, unknown>;
    try {
      const identity = publicRegistrationIdentity({ firstName: guest.firstName, lastName: guest.lastName });
      const contact = typeof guest.email === "string" ? guest.email.trim().toLowerCase() : "";
      if (contact && !validEmail(contact)) throw new Error("Enter a valid guest email, or leave it blank.");
      if (contact && emails.has(contact)) throw new Error("Use a different email for each person, or leave the guest email blank.");
      if (contact) emails.add(contact);
      people.push({ name: identity.name, email: contact || null, fields: [...identity.fields, ...registrationAnswerFields(page.questions, guest.answers, "guests")] });
    } catch (error) { throw new Error(`Guest ${index + 1}: ${error instanceof Error ? error.message : "Check these details."}`); }
  }
  return people;
}
