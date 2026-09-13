const AUTH_REDIRECT_ORIGIN = "https://beebizy.local";

/** Accept only Beebizy product and pricing paths, never an external post-auth redirect. */
export function authReturnTo(search: string, fallback = "/app"): string {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(requested, AUTH_REDIRECT_ORIGIN);
    if (parsed.origin !== AUTH_REDIRECT_ORIGIN) return fallback;
    const destination = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (parsed.pathname === "/pricing" || parsed.pathname === "/app" || parsed.pathname.startsWith("/app/")) {
      return destination;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
