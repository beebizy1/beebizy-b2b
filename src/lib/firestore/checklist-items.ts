import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { ChecklistItem, ChecklistInput, ChecklistUpdate } from "./types";

function mapChecklistItem(eventId: string, snap: { id: string; data: () => DocumentData }): ChecklistItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    title: d.title,
    description: d.description ?? null,
    completed: d.completed ?? false,
    dueDate: d.dueDate ?? null,
    assignedTo: d.assignedTo ?? null,
    category: d.category,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListChecklistQueryKey = (eventId: string) => ["checklistItems", "byEvent", eventId] as const;

export function useListChecklist(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListChecklistQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "checklistItems"), orderBy("sortOrder", "asc")),
    (snap) => mapChecklistItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: ChecklistInput }, ChecklistItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        title: data.title, description: data.description ?? null, completed: data.completed ?? false,
        dueDate: data.dueDate ?? null, assignedTo: data.assignedTo ?? null,
        category: data.category ?? "General", sortOrder: data.sortOrder ?? 0,
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "checklistItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapChecklistItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListChecklistQueryKey(vars.id) }) },
  );
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: ChecklistUpdate }, ChecklistItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "checklistItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapChecklistItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListChecklistQueryKey(vars.id) }) },
  );
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "checklistItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListChecklistQueryKey(vars.id) }) },
  );
}
