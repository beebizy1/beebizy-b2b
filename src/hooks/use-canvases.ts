import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, where, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./use-auth";

const CANVAS_W = 820;
const CANVAS_H = 540;

export type ShapeType = "circle" | "rect";

export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  shape: ShapeType;
  seats?: number;
}

export interface CanvasLayout {
  elements: CanvasElement[];
  roomWidth: number;
  roomHeight: number;
  roomLabel: string;
}

export interface Canvas {
  id: string;
  name: string;
  description: string;
  layout: CanvasLayout;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CANVAS_LAYOUT: CanvasLayout = {
  elements: [],
  roomWidth: CANVAS_W,
  roomHeight: CANVAS_H,
  roomLabel: "Main Room",
};

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Same optimistic Firestore-cache pattern as use-checklists.ts, backed by the `canvases` collection.
let cache: Canvas[] = [];
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
    const snap = await getDocs(query(collection(db, "canvases"), where("ownerId", "==", uid)));
    cache = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Canvas, "id">) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    cacheUid = uid;
    loadError = null;
  } catch (err) {
    loadError = err;
  }
  notifyListeners();
}

function persistUpsert(uid: string, canvas: Canvas) {
  if (!db) return;
  // Firestore rejects writes containing `undefined` anywhere in the document (even nested
  // inside array items, e.g. an optional `seats` on a non-table CanvasElement) — JSON
  // round-tripping drops those keys entirely as a defensive stripUndefined.
  const sanitized = JSON.parse(JSON.stringify({ ...canvas, ownerId: uid }));
  setDoc(doc(db, "canvases", canvas.id), sanitized).catch((err) => console.error("Failed to save canvas:", err));
}

function persistDelete(id: string) {
  if (!db) return;
  deleteDoc(doc(db, "canvases", id)).catch((err) => console.error("Failed to delete canvas:", err));
}

function useCanvasesSync(): Canvas[] {
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

export function useCanvases() {
  const { user } = useAuth();
  const canvases = useCanvasesSync();
  const error = user && cacheUid !== user.uid ? loadError : null;

  const createCanvas = (name: string, description = ""): string => {
    const id = genId();
    const now = new Date().toISOString();
    const next: Canvas = {
      id,
      name: name.trim(),
      description: description.trim(),
      layout: { ...DEFAULT_CANVAS_LAYOUT, roomLabel: name.trim() || "Main Room" },
      createdAt: now,
      updatedAt: now,
    };
    cache = [next, ...cache];
    notifyListeners();
    if (user) persistUpsert(user.uid, next);
    return id;
  };

  const deleteCanvas = (id: string) => {
    cache = cache.filter((c) => c.id !== id);
    notifyListeners();
    persistDelete(id);
  };

  const renameCanvas = (id: string, name: string) => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    cache = cache.map((c) => (c.id === id ? { ...c, name: name.trim(), updatedAt: now } : c));
    notifyListeners();
    const updated = cache.find((c) => c.id === id);
    if (user && updated) persistUpsert(user.uid, updated);
  };

  return { canvases, error, createCanvas, deleteCanvas, renameCanvas };
}

export function useCanvas(id: string) {
  const { user } = useAuth();
  const canvases = useCanvasesSync();
  const canvas = canvases.find((c) => c.id === id);

  const saveLayout = (layout: CanvasLayout) => {
    const now = new Date().toISOString();
    cache = cache.map((c) => (c.id === id ? { ...c, layout, updatedAt: now } : c));
    notifyListeners();
    const updated = cache.find((c) => c.id === id);
    if (user && updated) persistUpsert(user.uid, updated);
  };

  return { canvas, saveLayout };
}
