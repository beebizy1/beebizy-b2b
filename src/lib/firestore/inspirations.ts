import { collection, doc, addDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { EventInspiration, AddInspirationInput } from "./types";

function mapInspiration(eventId: string, snap: { id: string; data: () => DocumentData }): EventInspiration {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    url: d.url,
    caption: d.caption ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListEventInspirationsQueryKey = (eventId: string) => ["eventInspirations", "byEvent", eventId] as const;

export function useListEventInspirations(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListEventInspirationsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "eventInspirations"), orderBy("sortOrder", "asc")),
    (snap) => mapInspiration(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useAddEventInspiration() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: AddInspirationInput }, EventInspiration>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({ url: data.url, caption: data.caption ?? null, sortOrder: 0 }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "eventInspirations"), payload);
      const snap = await getDocOrThrow(ref);
      return mapInspiration(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListEventInspirationsQueryKey(vars.id) }) },
  );
}

export function useDeleteEventInspiration() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "eventInspirations", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListEventInspirationsQueryKey(vars.id) }) },
  );
}
