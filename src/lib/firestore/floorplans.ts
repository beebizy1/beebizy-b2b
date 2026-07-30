import { doc, getDoc, setDoc, serverTimestamp, type DocumentData } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFirestoreMutation, requireDb } from "./core";
import { tsToIso } from "./converters";
import type { Floorplan, SaveFloorplanInput } from "./types";

function mapFloorplan(eventId: string, snap: { data: () => DocumentData | undefined }): Floorplan | undefined {
  const d = snap.data();
  if (!d) return undefined;
  return {
    id: "current",
    eventId,
    name: d.name,
    layout: d.layout ?? {},
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

export const getGetEventFloorplanQueryKey = (eventId: string) => ["floorplan", eventId] as const;

export function useGetEventFloorplan(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery({
    queryKey: getGetEventFloorplanQueryKey(eventId),
    queryFn: async () => {
      const database = requireDb();
      const snap = await getDoc(doc(database, "events", eventId, "floorplan", "current"));
      return mapFloorplan(eventId, snap) ?? null;
    },
    enabled: (options?.query?.enabled ?? true) && !!eventId,
  });
}

export function useSaveEventFloorplan() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: SaveFloorplanInput }, Floorplan>(
    async ({ id: eventId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "floorplan", "current");
      const existing = await getDoc(ref);
      await setDoc(
        ref,
        { name: data.name, layout: data.layout, createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      );
      const snap = await getDoc(ref);
      return mapFloorplan(eventId, snap)!;
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetEventFloorplanQueryKey(vars.id) }) },
  );
}
