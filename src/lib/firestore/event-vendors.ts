import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, type DocumentData } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFirestoreMutation, withTimestamps, stripUndefined, requireDb, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { EventVendor, EventVendorInput, EventVendorUpdate, Vendor } from "./types";

function mapVendor(snap: { id: string; data: () => DocumentData }): Vendor {
  const d = snap.data();
  return {
    id: snap.id, ownerId: d.ownerId, name: d.name, category: d.category,
    description: d.description ?? null, contactEmail: d.contactEmail ?? null, contactPhone: d.contactPhone ?? null,
    website: d.website ?? null, logoUrl: d.logoUrl ?? null, rating: d.rating ?? null,
    city: d.city ?? null, state: d.state ?? null, country: d.country ?? null,
    createdAt: tsToIso(d.createdAt),
  };
}

function mapEventVendor(eventId: string, vendor: Vendor | undefined, snap: { id: string; data: () => DocumentData }): EventVendor {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    vendorId: snap.id,
    notes: d.notes ?? null,
    status: d.status ?? "pending",
    fee: d.fee ?? null,
    vendor,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListEventVendorsQueryKey = (eventId: string) => ["eventVendors", "byEvent", eventId] as const;

/** Joins each events/{eventId}/eventVendors/{vendorId} doc with its vendors/{vendorId} record. */
export function useListEventVendors(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery({
    queryKey: getListEventVendorsQueryKey(eventId),
    queryFn: async (): Promise<EventVendor[]> => {
      const database = requireDb();
      const snap = await getDocs(collection(database, "events", eventId, "eventVendors"));
      const vendors = await Promise.all(
        snap.docs.map((d) => getDoc(doc(database, "vendors", d.id))),
      );
      return snap.docs.map((d, i) => {
        const vendorSnap = vendors[i];
        const vendor = vendorSnap.exists() ? mapVendor(vendorSnap) : undefined;
        return mapEventVendor(eventId, vendor, d);
      });
    },
    enabled: (options?.query?.enabled ?? true) && !!eventId,
  });
}

export function useAddEventVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: EventVendorInput }, EventVendor>(
    async ({ id: eventId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "eventVendors", data.vendorId);
      await setDoc(ref, withTimestamps({ notes: data.notes ?? null, status: data.status ?? "pending", fee: data.fee ?? null }, "create"));
      const vendorSnap = await getDoc(doc(db, "vendors", data.vendorId));
      const snap = await getDocOrThrow(ref);
      return mapEventVendor(eventId, vendorSnap.exists() ? mapVendor(vendorSnap) : undefined, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListEventVendorsQueryKey(vars.id) }) },
  );
}

export function useUpdateEventVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; vendorId: string; data: EventVendorUpdate }, void>(
    async ({ id: eventId, vendorId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "eventVendors", vendorId);
      await updateDoc(ref, stripUndefined({ ...data }));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListEventVendorsQueryKey(vars.id) }) },
  );
}

export function useRemoveEventVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; vendorId: string }, void>(
    async ({ id: eventId, vendorId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "eventVendors", vendorId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListEventVendorsQueryKey(vars.id) }) },
  );
}
