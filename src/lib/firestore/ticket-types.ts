import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { TicketType, TicketTypeInput, TicketTypeUpdate } from "./types";

function mapTicketType(eventId: string, snap: { id: string; data: () => DocumentData }): TicketType {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    name: d.name,
    description: d.description ?? null,
    price: d.price ?? "0",
    quantityTotal: d.quantityTotal ?? 0,
    quantitySold: d.quantitySold ?? 0,
    isActive: d.isActive ?? true,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt) ?? null,
  };
}

export const getListTicketTypesQueryKey = (eventId: string) => ["ticketTypes", "byEvent", eventId] as const;

export function useListTicketTypes(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListTicketTypesQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "ticketTypes"), orderBy("sortOrder", "asc")),
    (snap) => mapTicketType(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateTicketType() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: TicketTypeInput }, TicketType>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        name: data.name, description: data.description ?? null, price: data.price,
        quantityTotal: data.quantityTotal ?? 0, quantitySold: data.quantitySold ?? 0,
        isActive: data.isActive ?? true, sortOrder: data.sortOrder ?? 0,
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "ticketTypes"), payload);
      const snap = await getDocOrThrow(ref);
      return mapTicketType(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListTicketTypesQueryKey(vars.id) }) },
  );
}

export function useUpdateTicketType() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; typeId: string; data: TicketTypeUpdate }, TicketType>(
    async ({ id: eventId, typeId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "ticketTypes", typeId);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapTicketType(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListTicketTypesQueryKey(vars.id) }) },
  );
}

export function useDeleteTicketType() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; typeId: string }, void>(
    async ({ id: eventId, typeId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "ticketTypes", typeId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListTicketTypesQueryKey(vars.id) }) },
  );
}
