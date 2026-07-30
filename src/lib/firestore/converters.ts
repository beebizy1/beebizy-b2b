import { Timestamp } from "firebase/firestore";

/** Firestore Timestamp (createdAt/updatedAt etc, set via serverTimestamp()) -> ISO string. */
export function tsToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function tsToIsoOptional(value: unknown): string | undefined {
  if (value == null) return undefined;
  return tsToIso(value);
}
