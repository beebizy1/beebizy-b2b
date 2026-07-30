import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { AuctionItem, AuctionItemInput, AuctionItemUpdate } from "./types";

function mapAuctionItem(eventId: string, snap: { id: string; data: () => DocumentData }): AuctionItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    title: d.title,
    description: d.description ?? null,
    imageUrl: d.imageUrl ?? null,
    startingBid: d.startingBid ?? null,
    currentBid: d.currentBid ?? null,
    winnerName: d.winnerName ?? null,
    donorName: d.donorName ?? null,
    paymentMethod: d.paymentMethod ?? null,
    paymentLink: d.paymentLink ?? null,
    fairMarketValue: d.fairMarketValue ?? null,
    paymentReceivedAt: d.paymentReceivedAt ?? null,
    status: d.status ?? "open",
    auctionType: d.auctionType ?? "silent",
    lotNumber: d.lotNumber ?? null,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

export const getListAuctionItemsQueryKey = (eventId: string) => ["auctionItems", "byEvent", eventId] as const;

export function useListAuctionItems(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListAuctionItemsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "auctionItems"), orderBy("createdAt", "asc")),
    (snap) => mapAuctionItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateAuctionItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: AuctionItemInput }, AuctionItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        title: data.title, description: data.description ?? null, imageUrl: data.imageUrl ?? null,
        startingBid: data.startingBid ?? null, currentBid: data.currentBid ?? null, winnerName: data.winnerName ?? null,
        donorName: data.donorName ?? null, paymentMethod: data.paymentMethod ?? null, paymentLink: data.paymentLink ?? null,
        fairMarketValue: data.fairMarketValue ?? null, paymentReceivedAt: data.paymentReceivedAt ?? null,
        status: data.status ?? "open", auctionType: data.auctionType ?? "silent", lotNumber: data.lotNumber ?? null,
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "auctionItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapAuctionItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(vars.id) }) },
  );
}

export function useUpdateAuctionItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: AuctionItemUpdate }, AuctionItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "auctionItems", itemId);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapAuctionItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(vars.id) }) },
  );
}

export function useDeleteAuctionItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "auctionItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListAuctionItemsQueryKey(vars.id) }) },
  );
}
