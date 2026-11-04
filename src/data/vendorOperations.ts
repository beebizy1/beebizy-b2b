/** Vendors with a time appear chronologically; untimed vendors retain the manual vendor order. */
export function orderVendorOperations<T extends { arrivalTime: string | null; sortOrder: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    (a.arrivalTime ?? "99:99").localeCompare(b.arrivalTime ?? "99:99") || a.sortOrder - b.sortOrder,
  );
}
