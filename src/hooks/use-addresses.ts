import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./use-auth";

const MAX_SAVED_ADDRESSES = 50;

export interface SavedAddress {
  address: string;
  city: string;
  state: string;
  country: string;
}

export function formatAddress(a: SavedAddress): string {
  return [a.address, a.city, a.state, a.country].filter((part) => part && part.trim()).join(", ");
}

// Same userSettings/{uid} doc as use-categories.ts (field: addresses), same optimistic-cache pattern.
let cache: SavedAddress[] = [];
let cacheUid: string | null = null;
let loadError: unknown = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

async function ensureLoaded(uid: string) {
  if (cacheUid === uid) return;
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "userSettings", uid));
    const data = snap.exists() ? snap.data() : undefined;
    cache = Array.isArray(data?.addresses) ? data.addresses : [];
    cacheUid = uid;
    loadError = null;
  } catch (err) {
    loadError = err;
  }
  notifyListeners();
}

function persist(uid: string) {
  if (!db) return;
  setDoc(doc(db, "userSettings", uid), { addresses: cache }, { merge: true }).catch((err) => console.error("Failed to save addresses:", err));
}

function writeAddresses(uid: string, addresses: SavedAddress[]) {
  cache = addresses;
  notifyListeners();
  persist(uid);
}

export function useAddresses() {
  const { user } = useAuth();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    ensureLoaded(user.uid);
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [user?.uid]);

  const addresses = user && cacheUid === user.uid ? cache : [];
  const error = user && cacheUid !== user.uid ? loadError : null;

  const saveAddress = (entry: SavedAddress) => {
    if (!entry.address?.trim() || !user) return;
    const formatted = formatAddress(entry);
    const withoutDuplicate = cache.filter((a) => formatAddress(a) !== formatted);
    writeAddresses(user.uid, [entry, ...withoutDuplicate].slice(0, MAX_SAVED_ADDRESSES));
  };

  const removeAddress = (entry: SavedAddress) => {
    if (!user) return;
    const formatted = formatAddress(entry);
    writeAddresses(user.uid, cache.filter((a) => formatAddress(a) !== formatted));
  };

  const findByFormatted = (formatted: string): SavedAddress | undefined =>
    addresses.find((a) => formatAddress(a) === formatted);

  return { addresses, error, saveAddress, removeAddress, findByFormatted, formatAddress };
}
