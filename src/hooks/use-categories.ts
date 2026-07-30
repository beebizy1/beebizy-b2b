import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./use-auth";

export const DEFAULT_EVENT_CATEGORIES = [
  "Conference",
  "Meetup",
  "Workshop",
  "Webinar",
  "Social",
  "In Store Activation",
  "Holiday Event",
];

// Module-level cache backed by Firestore (userSettings/{uid}.categories), keyed by uid,
// so every call site keeps the synchronous validate-then-write interface it had under
// localStorage — writes are optimistic locally and persisted to Firestore in the background.
let cache: string[] = DEFAULT_EVENT_CATEGORIES;
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
    const categories = Array.isArray(data?.categories) && data.categories.length > 0 ? data.categories : DEFAULT_EVENT_CATEGORIES;
    cache = categories;
    cacheUid = uid;
    loadError = null;
  } catch (err) {
    loadError = err;
  }
  notifyListeners();
}

function persist(uid: string) {
  if (!db) return;
  setDoc(doc(db, "userSettings", uid), { categories: cache }, { merge: true }).catch((err) => console.error("Failed to save categories:", err));
}

function writeCategories(uid: string, categories: string[]) {
  cache = categories;
  notifyListeners();
  persist(uid);
}

export function useCategories() {
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

  const categories = user && cacheUid === user.uid ? cache : DEFAULT_EVENT_CATEGORIES;
  const error = user && cacheUid !== user.uid ? loadError : null;

  const addCategory = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return "Category name is required.";
    if (!user) return "You must be signed in.";
    if (cache.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      return "That category already exists.";
    }
    writeCategories(user.uid, [...cache, trimmed]);
    return null;
  };

  const renameCategory = (oldName: string, newName: string): string | null => {
    const trimmed = newName.trim();
    if (!trimmed) return "Category name is required.";
    if (!user) return "You must be signed in.";
    if (cache.some((c) => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName)) {
      return "That category already exists.";
    }
    writeCategories(user.uid, cache.map((c) => (c === oldName ? trimmed : c)));
    return null;
  };

  const removeCategory = (name: string) => {
    if (!user) return;
    writeCategories(user.uid, cache.filter((c) => c !== name));
  };

  const resetToDefaults = () => {
    if (!user) return;
    writeCategories(user.uid, DEFAULT_EVENT_CATEGORIES);
  };

  return { categories, error, addCategory, renameCategory, removeCategory, resetToDefaults };
}
