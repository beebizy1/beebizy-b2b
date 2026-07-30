import { collection, doc, setDoc, query, where, serverTimestamp } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useFirestoreMutation } from "./core";
import { tsToIso } from "./converters";
import type { EventRoi } from "./types";

export const getListEventRoiQueryKey = () => ["eventRoi"] as const;

export function useListEventRoi() {
  const { user } = useAuth();
  return useCollectionQuery(
    getListEventRoiQueryKey(),
    (database) => query(collection(database, "eventRoi"), where("ownerId", "==", user!.uid)),
    (snap): EventRoi => {
      const d = snap.data();
      return {
        eventId: snap.id,
        eventCost: d.eventCost ?? 0,
        unitsSold: d.unitsSold ?? 0,
        avgItemPrice: d.avgItemPrice ?? 0,
        notes: d.notes ?? "",
        updatedAt: tsToIso(d.updatedAt),
      };
    },
    { enabled: !!user },
  );
}

export function useUpdateEventRoi() {
  const qc = useQueryClient();
  return useFirestoreMutation<
    { eventId: string; eventCost: number; unitsSold: number; avgItemPrice: number; notes: string },
    void
  >(
    async ({ eventId, ...data }, { uid, db }) => {
      await setDoc(
        doc(db, "eventRoi", eventId),
        { ownerId: uid, eventCost: data.eventCost, unitsSold: data.unitsSold, avgItemPrice: data.avgItemPrice, notes: data.notes, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: getListEventRoiQueryKey() }) },
  );
}
