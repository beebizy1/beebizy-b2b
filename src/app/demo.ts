const DEMO_SESSION_KEY = "beebizy:product-demo";

export function startDemoSession(): void {
  window.sessionStorage.setItem(DEMO_SESSION_KEY, "true");
}

export function isDemoSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "true" ||
    (import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1");
}

export function endDemoSession(): void {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
}
