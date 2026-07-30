import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  type DocumentData,
} from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import { FirestoreOpError } from "./errors";
import type { RaffleItem, RaffleItemInput, RaffleItemUpdate, RaffleTicket, RaffleTicketInput } from "./types";

function mapRaffleItem(eventId: string, snap: { id: string; data: () => DocumentData }): RaffleItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    name: d.name,
    description: d.description ?? null,
    imageUrl: d.imageUrl ?? null,
    ticketPrice: d.ticketPrice ?? "0",
    totalTickets: d.totalTickets ?? 0,
    soldTickets: d.soldTickets ?? 0,
    winnerName: d.winnerName ?? null,
    winnerEmail: d.winnerEmail ?? null,
    winnerTicketId: d.winnerTicketId ?? null,
    drawnAt: d.drawnAt ?? null,
    status: d.status ?? "open",
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

function mapRaffleTicket(eventId: string, raffleItemId: string, snap: { id: string; data: () => DocumentData }): RaffleTicket {
  const d = snap.data();
  return {
    id: snap.id,
    raffleItemId,
    eventId,
    buyerName: d.buyerName,
    buyerEmail: d.buyerEmail,
    quantity: d.quantity ?? 1,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListRaffleItemsQueryKey = (eventId: string) => ["raffleItems", "byEvent", eventId] as const;

export function useListRaffleItems(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListRaffleItemsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "raffleItems"), orderBy("createdAt", "asc")),
    (snap) => mapRaffleItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateRaffleItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: RaffleItemInput }, RaffleItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        name: data.name, description: data.description ?? null, imageUrl: data.imageUrl ?? null,
        ticketPrice: data.ticketPrice ?? "5", totalTickets: data.totalTickets ?? 0, soldTickets: 0,
        winnerName: null, winnerEmail: null, winnerTicketId: null, drawnAt: null, status: data.status ?? "open",
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "raffleItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapRaffleItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(vars.id) }) },
  );
}

export function useUpdateRaffleItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: RaffleItemUpdate }, RaffleItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "raffleItems", itemId);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapRaffleItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(vars.id) }) },
  );
}

export function useDeleteRaffleItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      const ticketsSnap = await getDocs(collection(db, "events", eventId, "raffleItems", itemId, "raffleTickets"));
      await Promise.all(ticketsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "events", eventId, "raffleItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(vars.id) }) },
  );
}

export const getListRaffleTicketsQueryKey = (eventId: string, raffleItemId: string) => ["raffleTickets", eventId, raffleItemId] as const;

export function useListRaffleTickets(eventId: string, raffleItemId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListRaffleTicketsQueryKey(eventId, raffleItemId),
    (database) => query(collection(database, "events", eventId, "raffleItems", raffleItemId, "raffleTickets"), orderBy("createdAt", "desc")),
    (snap) => mapRaffleTicket(eventId, raffleItemId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId && !!raffleItemId },
  );
}

export function useCreateRaffleTicket() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: RaffleTicketInput }, RaffleTicket>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const quantity = data.quantity ?? 1;
      const itemRef = doc(db, "events", eventId, "raffleItems", itemId);
      const ticketRef = doc(collection(db, "events", eventId, "raffleItems", itemId, "raffleTickets"));
      await runTransaction(db, async (tx) => {
        const itemSnap = await tx.get(itemRef);
        if (!itemSnap.exists()) throw new FirestoreOpError("not-found", "Raffle prize not found");
        const item = itemSnap.data();
        const nextSold = (item.soldTickets ?? 0) + quantity;
        if (item.totalTickets > 0 && nextSold > item.totalTickets) {
          throw new FirestoreOpError("failed-precondition", "Not enough tickets remaining");
        }
        tx.set(ticketRef, withTimestamps({ buyerName: data.buyerName, buyerEmail: data.buyerEmail, quantity }, "create"));
        tx.update(itemRef, { soldTickets: nextSold });
      });
      const snap = await getDocOrThrow(ticketRef);
      return mapRaffleTicket(eventId, itemId, snap);
    },
    {
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: getListRaffleTicketsQueryKey(vars.id, vars.itemId) });
        qc.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(vars.id) });
      },
    },
  );
}

export function useDrawRaffleWinner() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, { winnerName: string; winnerEmail: string }>(
    async ({ id: eventId, itemId }, { db }) => {
      const ticketsSnap = await getDocs(collection(db, "events", eventId, "raffleItems", itemId, "raffleTickets"));
      const pool: { id: string; buyerName: string; buyerEmail: string }[] = [];
      ticketsSnap.docs.forEach((d) => {
        const t = d.data();
        for (let i = 0; i < (t.quantity ?? 1); i++) pool.push({ id: d.id, buyerName: t.buyerName, buyerEmail: t.buyerEmail });
      });
      if (pool.length === 0) throw new FirestoreOpError("failed-precondition", "No tickets sold yet");
      const winner = pool[Math.floor(Math.random() * pool.length)];
      const itemRef = doc(db, "events", eventId, "raffleItems", itemId);
      await updateDoc(itemRef, withTimestamps({
        status: "drawn", winnerName: winner.buyerName, winnerEmail: winner.buyerEmail,
        winnerTicketId: winner.id, drawnAt: new Date().toISOString(),
      }, "update"));
      return { winnerName: winner.buyerName, winnerEmail: winner.buyerEmail };
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListRaffleItemsQueryKey(vars.id) }) },
  );
}
