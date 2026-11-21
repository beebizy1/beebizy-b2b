const changed = "beebizy-workspace-selection";
const key = (userId: string) => `beebizy:workspace:${userId}`;

export function selectedWorkspaceId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try { return sessionStorage.getItem(key(userId)) || null; } catch { return null; }
}
export function selectWorkspace(userId: string, workspaceId: string | null): void {
  if (workspaceId) sessionStorage.setItem(key(userId), workspaceId);
  else sessionStorage.removeItem(key(userId));
  window.dispatchEvent(new Event(changed));
}
export function subscribeWorkspaceSelection(onChange: () => void): () => void {
  window.addEventListener(changed,onChange);
  return () => window.removeEventListener(changed,onChange);
}
