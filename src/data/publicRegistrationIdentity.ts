/** Keep the guest's chosen name boundaries instead of guessing from a full name. */
export function publicRegistrationIdentity(input: { name?: unknown; firstName?: unknown; lastName?: unknown }) {
  const separateNames = input.firstName !== undefined || input.lastName !== undefined;
  if (!separateNames) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 241) throw new Error("Enter your name (241 characters or fewer).");
    return { name, fields: [] as Array<{ label: string; value: string }> };
  }
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  if (!firstName || firstName.length > 120) throw new Error("Enter your first name (120 characters or fewer).");
  if (!lastName || lastName.length > 120) throw new Error("Enter your last name (120 characters or fewer).");
  return {
    name: `${firstName} ${lastName}`,
    fields: [{ label: "First Name", value: firstName }, { label: "Last Name", value: lastName }],
  };
}

export interface PublicRsvpFormDraft {
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  answers: Record<string, string>;
  previousFullName?: string;
}

/** Recover old drafts without making assumptions about compound names. */
export function recoverPublicRsvpDraft(value: unknown): PublicRsvpFormDraft {
  const cached = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const legacyName = typeof cached.name === "string" ? cached.name : "";
  const answers = cached.answers && typeof cached.answers === "object" && !Array.isArray(cached.answers)
    ? Object.fromEntries(Object.entries(cached.answers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  return {
    firstName: typeof cached.firstName === "string" ? cached.firstName : legacyName,
    lastName: typeof cached.lastName === "string" ? cached.lastName : "",
    email: typeof cached.email === "string" ? cached.email : "",
    organization: typeof cached.organization === "string" ? cached.organization : "",
    answers,
    ...(typeof cached.previousFullName === "string" ? { previousFullName: cached.previousFullName } : legacyName ? { previousFullName: legacyName } : {}),
  };
}
