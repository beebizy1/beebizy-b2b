export const PRIVATE_BETA_ORIGIN = "https://beebizy-studio-preview.vercel.app";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isPrivateBetaHost(hostname: string): boolean {
  return hostname === "beebizy-studio-preview.vercel.app" || LOCAL_HOSTS.has(hostname);
}

export function privateBetaUrl(pathname = "/", search = "", hash = ""): string {
  return `${PRIVATE_BETA_ORIGIN}${pathname}${search}${hash}`;
}
