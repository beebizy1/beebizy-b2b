import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { MenuItem, MenuItemInput, MenuItemUpdate } from "./types";

function mapMenuItem(eventId: string, snap: { id: string; data: () => DocumentData }): MenuItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    name: d.name,
    description: d.description ?? null,
    course: d.course,
    dietaryTags: d.dietaryTags ?? null,
    price: d.price ?? null,
    serves: d.serves ?? null,
    notes: d.notes ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
    updatedAt: d.updatedAt ? tsToIso(d.updatedAt) : null,
  };
}

export const getListMenuItemsQueryKey = (eventId: string) => ["menuItems", "byEvent", eventId] as const;

export function useListMenuItems(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListMenuItemsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "menuItems"), orderBy("sortOrder", "asc")),
    (snap) => mapMenuItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: MenuItemInput }, MenuItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        name: data.name, description: data.description ?? null, course: data.course ?? "Main Course",
        dietaryTags: data.dietaryTags ?? null, price: data.price ?? null, serves: data.serves ?? null,
        notes: data.notes ?? null, sortOrder: data.sortOrder ?? 0,
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "menuItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapMenuItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListMenuItemsQueryKey(vars.id) }) },
  );
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: MenuItemUpdate }, MenuItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "menuItems", itemId);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapMenuItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListMenuItemsQueryKey(vars.id) }) },
  );
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "menuItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListMenuItemsQueryKey(vars.id) }) },
  );
}
