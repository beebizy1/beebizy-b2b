export interface RunOfShowSortOrderPatch {
  id: string;
  sortOrder: number;
}

export function validRunOfShowOrder(currentIds: string[], requestedIds: string[]): boolean {
  if (currentIds.length !== requestedIds.length || new Set(requestedIds).size !== requestedIds.length) return false;
  const current = new Set(currentIds);
  return requestedIds.every((id) => current.has(id));
}

export function moveRunOfShowCue(
  currentIds: string[],
  activeId: string,
  overId: string,
): RunOfShowSortOrderPatch[] {
  const from = currentIds.indexOf(activeId);
  const to = currentIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) {
    return currentIds.map((id, index) => ({ id, sortOrder: index + 1 }));
  }
  const next = currentIds.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.map((id, index) => ({ id, sortOrder: index + 1 }));
}
