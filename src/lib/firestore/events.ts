import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  increment,
  type Firestore,
  type DocumentData,
  type CollectionReference,
} from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useDocQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import { getLocationRecord } from "./locations";
import type { Event, EventInput, EventUpdate, ListEventsParams } from "./types";

function mapEvent(snap: { id: string; data: () => DocumentData }): Event {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    title: d.title,
    description: d.description ?? null,
    date: d.date,
    endDate: d.endDate ?? null,
    location: d.location ?? null,
    locationId: d.locationId ?? null,
    locationRecord: d.locationRecord ?? undefined,
    capacity: d.capacity ?? null,
    status: d.status,
    category: d.category,
    imageUrl: d.imageUrl ?? null,
    registrationCount: d.registrationCount ?? 0,
    shareToken: d.shareToken ?? null,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIsoOptional(d.updatedAt),
  };
}

export const getListEventsQueryKey = (params?: ListEventsParams) => ["events", "list", params ?? {}] as const;

export function useListEvents(params?: ListEventsParams) {
  const { user } = useAuth();
  return useCollectionQuery(
    getListEventsQueryKey(params),
    (database) => {
      let q = query(collection(database, "events"), where("ownerId", "==", user!.uid));
      if (params?.status) q = query(q, where("status", "==", params.status));
      if (params?.category) q = query(q, where("category", "==", params.category));
      if (params?.locationId) q = query(q, where("locationId", "==", params.locationId));
      return query(q, orderBy("date", "desc"));
    },
    mapEvent,
    { enabled: !!user },
  );
}

export const getListUpcomingEventsQueryKey = () => ["events", "upcoming"] as const;

/** Client-side filtered "next 30 days" view over the same owner-scoped event list. */
export function useListUpcomingEvents() {
  const { user } = useAuth();
  const listQuery = useCollectionQuery(
    getListUpcomingEventsQueryKey(),
    (database) => query(collection(database, "events"), where("ownerId", "==", user!.uid), orderBy("date", "asc")),
    mapEvent,
    { enabled: !!user },
  );
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    ...listQuery,
    data: listQuery.data?.filter((e) => {
      const d = new Date(e.date);
      return d >= now && d <= in30Days;
    }),
  };
}

export const getListLocationEventsQueryKey = (locationId: string) => ["events", "byLocation", locationId] as const;

export function useListLocationEvents(locationId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  const { user } = useAuth();
  return useCollectionQuery(
    getListLocationEventsQueryKey(locationId),
    (database) =>
      query(
        collection(database, "events"),
        where("ownerId", "==", user!.uid),
        where("locationId", "==", locationId),
        orderBy("date", "desc"),
      ),
    mapEvent,
    { enabled: (options?.query?.enabled ?? true) && !!user && !!locationId },
  );
}

export const getGetEventQueryKey = (id: string) => ["events", "detail", id] as const;

export function useGetEvent(id: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useDocQuery(
    getGetEventQueryKey(id),
    (database) => doc(database, "events", id),
    (snap) => (snap.exists() ? mapEvent(snap) : undefined),
    { enabled: (options?.query?.enabled ?? true) && !!id },
  );
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: EventInput }, Event>(
    async ({ data }, { uid, db }) => {
      const locationRecord = data.locationId ? await getLocationRecord(db, data.locationId) : undefined;
      const payload = withTimestamps(
        withOwner(
          {
            title: data.title,
            description: data.description ?? null,
            date: data.date,
            endDate: data.endDate ?? null,
            location: data.location ?? null,
            locationId: data.locationId ?? null,
            locationRecord: locationRecord ?? null,
            capacity: data.capacity ?? null,
            status: data.status,
            category: data.category,
            imageUrl: data.imageUrl ?? null,
            registrationCount: 0,
            shareToken: null,
          },
          uid,
        ),
        "create",
      );
      const ref = await addDoc(collection(db, "events"), payload);
      if (data.locationId) await updateDoc(doc(db, "locations", data.locationId), { eventCount: increment(1) });
      const snap = await getDocOrThrow(ref);
      return mapEvent(snap);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["locations"] });
      },
    },
  );
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: EventUpdate }, Event>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "events", id);
      const updatePayload: Record<string, unknown> = stripUndefined({ ...data });
      if ("locationId" in data) {
        const previousSnap = await getDocOrThrow(ref);
        const previousLocationId = previousSnap.data().locationId as string | null;
        updatePayload.locationRecord = data.locationId ? ((await getLocationRecord(db, data.locationId)) ?? null) : null;
        if (previousLocationId !== (data.locationId ?? null)) {
          if (previousLocationId) await updateDoc(doc(db, "locations", previousLocationId), { eventCount: increment(-1) });
          if (data.locationId) await updateDoc(doc(db, "locations", data.locationId), { eventCount: increment(1) });
        }
      }
      await updateDoc(ref, withTimestamps(updatePayload, "update"));
      const snap = await getDocOrThrow(ref);
      return mapEvent(snap);
    },
    {
      onSuccess: (_result, vars) => {
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: getGetEventQueryKey(vars.id) });
        qc.invalidateQueries({ queryKey: ["locations"] });
      },
    },
  );
}

// Subcollections that live under events/{id}/... across every phase of the migration.
// Deleting an event must cascade-delete all of these (Firestore doesn't do this automatically).
const EVENT_SUBCOLLECTIONS = [
  "budgetItems",
  "checklistItems",
  "runOfShowItems",
  "auctionItems",
  "sponsorships",
  "raffleItems",
  "menuItems",
  "ticketTypes",
  "eventInspirations",
  "eventVendors",
  "floorplan",
] as const;

async function deleteAllDocsIn(db: Firestore, colRef: CollectionReference<DocumentData>) {
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs;
}

async function cascadeDeleteEvent(db: Firestore, eventId: string) {
  const eventSnap = await getDoc(doc(db, "events", eventId));
  const locationId = eventSnap.data()?.locationId as string | null | undefined;
  for (const sub of EVENT_SUBCOLLECTIONS) {
    const docs = await deleteAllDocsIn(db, collection(db, "events", eventId, sub));
    if (sub === "raffleItems") {
      for (const raffleDoc of docs) {
        await deleteAllDocsIn(db, collection(db, "events", eventId, "raffleItems", raffleDoc.id, "raffleTickets"));
      }
    }
  }
  await deleteDoc(doc(db, "events", eventId));
  if (locationId) await updateDoc(doc(db, "locations", locationId), { eventCount: increment(-1) });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      await cascadeDeleteEvent(db, id);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["locations"] });
      },
    },
  );
}

/** Generates (once) and returns the event's public share token, reused for both /buy/:token and /share/:token. */
export function useShareEvent() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, { shareToken: string }>(
    async ({ id }, { db }) => {
      const ref = doc(db, "events", id);
      const existing = await getDocOrThrow(ref);
      const existingToken = existing.data().shareToken as string | null | undefined;
      if (existingToken) return { shareToken: existingToken };
      const shareToken = crypto.randomUUID();
      await updateDoc(ref, { shareToken });
      return { shareToken };
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetEventQueryKey(vars.id) }) },
  );
}
