/** Call only with the payload returned by Clerk's cryptographic token verifier. */
export function verifiedClerkOrganizationId(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const value = claims as { org_id?: unknown; o?: { id?: unknown } };
  const id = typeof value.org_id === "string" ? value.org_id : value.o?.id;
  return typeof id === "string" && /^org_[a-zA-Z0-9]+$/.test(id) ? id : null;
}
