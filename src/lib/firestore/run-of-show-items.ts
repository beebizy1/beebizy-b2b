import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { RunOfShowItem, RunOfShowInput, RunOfShowUpdate } from "./types";

function mapRunOfShowItem(eventId: string, snap: { id: string; data: () => DocumentData }): RunOfShowItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    startTime: d.startTime,
    duration: d.duration ?? null,
    title: d.title,
    description: d.description ?? null,
    responsible: d.responsible ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListRunOfShowQueryKey = (eventId: string) => ["runOfShowItems", "byEvent", eventId] as const;

export function useListRunOfShow(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListRunOfShowQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "runOfShowItems"), orderBy("sortOrder", "asc")),
    (snap) => mapRunOfShowItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: RunOfShowInput }, RunOfShowItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps(stripUndefined({
        startTime: data.startTime, duration: data.duration ?? null, title: data.title,
        description: data.description ?? null, responsible: data.responsible ?? null, sortOrder: data.sortOrder ?? 0,
      }), "create");
      const ref = await addDoc(collection(db, "events", eventId, "runOfShowItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapRunOfShowItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRunOfShowQueryKey(vars.id) }) },
  );
}

export function useUpdateRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: RunOfShowUpdate }, RunOfShowItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "runOfShowItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapRunOfShowItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRunOfShowQueryKey(vars.id) }) },
  );
}

export function useDeleteRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "runOfShowItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRunOfShowQueryKey(vars.id) }) },
  );
}
