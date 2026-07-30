import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, where, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./use-auth";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface ChecklistCategory {
  id: string;
  name: string;
  items: ChecklistItem[];
}

export interface Checklist {
  id: string;
  name: string;
  description: string;
  categories: ChecklistCategory[];
  createdAt: string;
  updatedAt: string;
}

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Module-level cache backed by the Firestore `checklists` collection (ownerId == uid),
// keyed by uid. Mutations update the cache optimistically (so createChecklist can keep
// returning the new id synchronously, matching the old localStorage-hook interface) and
// persist to Firestore in the background.
let cache: Checklist[] = [];
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
    const snap = await getDocs(query(collection(db, "checklists"), where("ownerId", "==", uid)));
    cache = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Checklist, "id">) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    cacheUid = uid;
    loadError = null;
  } catch (err) {
    loadError = err;
  }
  notifyListeners();
}

function persistUpsert(uid: string, checklist: Checklist) {
  if (!db) return;
  setDoc(doc(db, "checklists", checklist.id), { ...checklist, ownerId: uid }).catch((err) => console.error("Failed to save checklist:", err));
}

function persistDelete(id: string) {
  if (!db) return;
  deleteDoc(doc(db, "checklists", id)).catch((err) => console.error("Failed to delete checklist:", err));
}

function useChecklistsSync(): Checklist[] {
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

  return user && cacheUid === user.uid ? cache : [];
}

export function useChecklists() {
  const { user } = useAuth();
  const checklists = useChecklistsSync();
  const error = user && cacheUid !== user.uid ? loadError : null;

  const createChecklist = (name: string, description = ""): string => {
    const id = genId();
    const now = new Date().toISOString();
    const next: Checklist = { id, name: name.trim(), description: description.trim(), categories: [], createdAt: now, updatedAt: now };
    cache = [next, ...cache];
    notifyListeners();
    if (user) persistUpsert(user.uid, next);
    return id;
  };

  const deleteChecklist = (id: string) => {
    cache = cache.filter((c) => c.id !== id);
    notifyListeners();
    persistDelete(id);
  };

  const renameChecklist = (id: string, name: string) => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    cache = cache.map((c) => (c.id === id ? { ...c, name: name.trim(), updatedAt: now } : c));
    notifyListeners();
    const updated = cache.find((c) => c.id === id);
    if (user && updated) persistUpsert(user.uid, updated);
  };

  return { checklists, error, createChecklist, deleteChecklist, renameChecklist };
}

export function useChecklist(id: string) {
  const { user } = useAuth();
  const checklists = useChecklistsSync();
  const checklist = checklists.find((c) => c.id === id);

  const update = (updater: (c: Checklist) => Checklist) => {
    const now = new Date().toISOString();
    cache = cache.map((c) => (c.id === id ? { ...updater(c), updatedAt: now } : c));
    notifyListeners();
    const updated = cache.find((c) => c.id === id);
    if (user && updated) persistUpsert(user.uid, updated);
  };

  const addCategory = (name: string) => {
    if (!name.trim()) return;
    update((c) => ({ ...c, categories: [...c.categories, { id: genId(), name: name.trim(), items: [] }] }));
  };

  const renameCategory = (categoryId: string, name: string) => {
    if (!name.trim()) return;
    update((c) => ({
      ...c,
      categories: c.categories.map((cat) => (cat.id === categoryId ? { ...cat, name: name.trim() } : cat)),
    }));
  };

  const removeCategory = (categoryId: string) => {
    update((c) => ({ ...c, categories: c.categories.filter((cat) => cat.id !== categoryId) }));
  };

  const addItem = (categoryId: string, text: string) => {
    if (!text.trim()) return;
    update((c) => ({
      ...c,
      categories: c.categories.map((cat) =>
        cat.id === categoryId ? { ...cat, items: [...cat.items, { id: genId(), text: text.trim(), completed: false }] } : cat
      ),
    }));
  };

  const toggleItem = (categoryId: string, itemId: string) => {
    update((c) => ({
      ...c,
      categories: c.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, items: cat.items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)) }
          : cat
      ),
    }));
  };

  const renameItem = (categoryId: string, itemId: string, text: string) => {
    if (!text.trim()) return;
    update((c) => ({
      ...c,
      categories: c.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, items: cat.items.map((item) => (item.id === itemId ? { ...item, text: text.trim() } : item)) }
          : cat
      ),
    }));
  };

  const removeItem = (categoryId: string, itemId: string) => {
    update((c) => ({
      ...c,
      categories: c.categories.map((cat) =>
        cat.id === categoryId ? { ...cat, items: cat.items.filter((item) => item.id !== itemId) } : cat
      ),
    }));
  };

  return { checklist, addCategory, renameCategory, removeCategory, addItem, toggleItem, renameItem, removeItem };
}
