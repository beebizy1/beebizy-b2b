import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  type Firestore,
  type DocumentData,
} from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useDocQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { Location, LocationInput, LocationUpdate, ListLocationsParams } from "./types";

function mapLocation(snap: { id: string; data: () => DocumentData }): Location {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    name: d.name,
    corporationName: d.corporationName,
    address: d.address ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    country: d.country,
    phone: d.phone ?? null,
    eventCount: d.eventCount ?? 0,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

/** Used by events.ts to snapshot a Location onto an Event's denormalized `locationRecord`. */
export async function getLocationRecord(database: Firestore, id: string): Promise<Location | undefined> {
  const snap = await getDoc(doc(database, "locations", id));
  return snap.exists() ? mapLocation(snap) : undefined;
}

export const getListLocationsQueryKey = (params?: ListLocationsParams) => ["locations", "list", params ?? {}] as const;

export function useListLocations(params?: ListLocationsParams) {
  const { user } = useAuth();
  return useCollectionQuery(
    getListLocationsQueryKey(params),
    (database) => {
      let q = query(collection(database, "locations"), where("ownerId", "==", user!.uid));
      if (params?.corporationName) q = query(q, where("corporationName", "==", params.corporationName));
      return query(q, orderBy("name", "asc"));
    },
    mapLocation,
    { enabled: !!user },
  );
}

export const getGetLocationQueryKey = (id: string) => ["locations", "detail", id] as const;

export function useGetLocation(id: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useDocQuery(
    getGetLocationQueryKey(id),
    (database) => doc(database, "locations", id),
    (snap) => (snap.exists() ? mapLocation(snap) : undefined),
    { enabled: (options?.query?.enabled ?? true) && !!id },
  );
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: LocationInput }, Location>(
    async ({ data }, { uid, db }) => {
      const payload = withTimestamps(
        withOwner(
          {
            name: data.name,
            corporationName: data.corporationName,
            address: data.address ?? null,
            city: data.city ?? null,
            state: data.state ?? null,
            country: data.country ?? "",
            phone: data.phone ?? null,
            eventCount: 0,
          },
          uid,
        ),
        "create",
      );
      const ref = await addDoc(collection(db, "locations"), payload);
      const snap = await getDocOrThrow(ref);
      return mapLocation(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }) },
  );
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: LocationUpdate }, Location>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "locations", id);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapLocation(snap);
    },
    {
      onSuccess: (_result, vars) => {
        qc.invalidateQueries({ queryKey: ["locations"] });
        qc.invalidateQueries({ queryKey: getGetLocationQueryKey(vars.id) });
      },
    },
  );
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      await deleteDoc(doc(db, "locations", id));
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }) },
  );
}
