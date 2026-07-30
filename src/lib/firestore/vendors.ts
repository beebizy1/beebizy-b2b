import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useDocQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { Vendor, VendorInput, VendorUpdate, ListVendorsParams } from "./types";

function mapVendor(snap: { id: string; data: () => DocumentData }): Vendor {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    name: d.name,
    category: d.category,
    description: d.description ?? null,
    contactEmail: d.contactEmail ?? null,
    contactPhone: d.contactPhone ?? null,
    website: d.website ?? null,
    logoUrl: d.logoUrl ?? null,
    rating: d.rating ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    country: d.country ?? null,
    lastMessage: d.lastMessage ?? null,
    lastMessageAt: tsToIsoOptional(d.lastMessageAt) ?? null,
    lastDirection: d.lastDirection ?? null,
    unreadCount: d.unreadCount ?? 0,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

export const getListVendorsQueryKey = (params?: ListVendorsParams) => ["vendors", "list", params ?? {}] as const;

export function useListVendors(params?: ListVendorsParams) {
  const { user } = useAuth();
  return useCollectionQuery(
    getListVendorsQueryKey(params),
    (database) => {
      let q = query(collection(database, "vendors"), where("ownerId", "==", user!.uid));
      if (params?.category) q = query(q, where("category", "==", params.category));
      return query(q, orderBy("name", "asc"));
    },
    mapVendor,
    { enabled: !!user },
  );
}

export const getGetVendorQueryKey = (id: string) => ["vendors", "detail", id] as const;

export function useGetVendor(id: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useDocQuery(
    getGetVendorQueryKey(id),
    (database) => doc(database, "vendors", id),
    (snap) => (snap.exists() ? mapVendor(snap) : undefined),
    { enabled: (options?.query?.enabled ?? true) && !!id },
  );
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: VendorInput }, Vendor>(
    async ({ data }, { uid, db }) => {
      const payload = withTimestamps(
        withOwner(
          {
            name: data.name,
            category: data.category,
            description: data.description ?? null,
            contactEmail: data.contactEmail ?? null,
            contactPhone: data.contactPhone ?? null,
            website: data.website ?? null,
            logoUrl: data.logoUrl ?? null,
            rating: data.rating ?? null,
            city: data.city ?? null,
            state: data.state ?? null,
            country: data.country ?? null,
            lastMessage: null,
            lastMessageAt: null,
            lastDirection: null,
            unreadCount: 0,
          },
          uid,
        ),
        "create",
      );
      const ref = await addDoc(collection(db, "vendors"), payload);
      const snap = await getDocOrThrow(ref);
      return mapVendor(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }) },
  );
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: VendorUpdate }, Vendor>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "vendors", id);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapVendor(snap);
    },
    {
      onSuccess: (_result, vars) => {
        qc.invalidateQueries({ queryKey: ["vendors"] });
        qc.invalidateQueries({ queryKey: getGetVendorQueryKey(vars.id) });
      },
    },
  );
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      await deleteDoc(doc(db, "vendors", id));
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }) },
  );
}
