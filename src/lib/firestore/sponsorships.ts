import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { Sponsorship, SponsorshipInput, SponsorshipUpdate } from "./types";

function mapSponsorship(eventId: string, snap: { id: string; data: () => DocumentData }): Sponsorship {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    companyName: d.companyName,
    tier: d.tier ?? "custom",
    amount: d.amount ?? null,
    logoUrl: d.logoUrl ?? null,
    contactEmail: d.contactEmail ?? null,
    contactName: d.contactName ?? null,
    notes: d.notes ?? null,
    status: d.status ?? "pending",
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

export const getListSponsorshipsQueryKey = (eventId: string) => ["sponsorships", "byEvent", eventId] as const;

export function useListSponsorships(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListSponsorshipsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "sponsorships"), orderBy("createdAt", "asc")),
    (snap) => mapSponsorship(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateSponsorship() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: SponsorshipInput }, Sponsorship>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        companyName: data.companyName, tier: data.tier ?? "custom", amount: data.amount ?? null,
        logoUrl: data.logoUrl ?? null, contactEmail: data.contactEmail ?? null, contactName: data.contactName ?? null,
        notes: data.notes ?? null, status: data.status ?? "pending",
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "sponsorships"), payload);
      const snap = await getDocOrThrow(ref);
      return mapSponsorship(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListSponsorshipsQueryKey(vars.id) }) },
  );
}

export function useUpdateSponsorship() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; sponsorshipId: string; data: SponsorshipUpdate }, Sponsorship>(
    async ({ id: eventId, sponsorshipId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "sponsorships", sponsorshipId);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapSponsorship(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListSponsorshipsQueryKey(vars.id) }) },
  );
}

export function useDeleteSponsorship() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; sponsorshipId: string }, void>(
    async ({ id: eventId, sponsorshipId: itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "sponsorships", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListSponsorshipsQueryKey(vars.id) }) },
  );
}
