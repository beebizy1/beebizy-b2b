const DEMO_SESSION_KEY = "beebizy:product-demo";

export function startDemoSession(): void {
  window.sessionStorage.setItem(DEMO_SESSION_KEY, "true");
}

export function isDemoSession(): boolean {
  return typeof window !== "undefined" && window.sessionStorage.getItem(DEMO_SESSION_KEY) === "true";
}

export function endDemoSession(): void {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
}
