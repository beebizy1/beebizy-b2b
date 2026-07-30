import { collection, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, increment, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { RegistrationWithAttendee, RegistrationInput, RegistrationUpdate } from "./types";

function mapRegistration(snap: { id: string; data: () => DocumentData }): RegistrationWithAttendee {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    eventId: d.eventId,
    eventTitle: d.eventTitle ?? d.eventId,
    attendeeId: d.attendeeId,
    status: d.status,
    registeredAt: tsToIso(d.registeredAt),
    attendee: d.attendee,
  };
}

export const getListRegistrationsQueryKey = () => ["registrations", "list"] as const;

export function useListRegistrations() {
  const { user } = useAuth();
  return useCollectionQuery(
    getListRegistrationsQueryKey(),
    (database) => query(collection(database, "registrations"), where("ownerId", "==", user!.uid), orderBy("registeredAt", "desc")),
    mapRegistration,
    { enabled: !!user },
  );
}

export const getListEventRegistrationsQueryKey = (eventId: string) => ["registrations", "byEvent", eventId] as const;

export function useListEventRegistrations(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  const { user } = useAuth();
  return useCollectionQuery(
    getListEventRegistrationsQueryKey(eventId),
    (database) =>
      query(
        collection(database, "registrations"),
        where("ownerId", "==", user!.uid),
        where("eventId", "==", eventId),
        orderBy("registeredAt", "desc"),
      ),
    mapRegistration,
    { enabled: (options?.query?.enabled ?? true) && !!user && !!eventId },
  );
}

export function useCreateRegistration() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: RegistrationInput }, RegistrationWithAttendee>(
    async ({ data }, { uid, db }) => {
      const [attendeeSnap, eventSnap] = await Promise.all([
        getDoc(doc(db, "attendees", data.attendeeId)),
        getDoc(doc(db, "events", data.eventId)),
      ]);
      const attendeeData = attendeeSnap.data();
      const attendee = attendeeData
        ? { id: attendeeSnap.id, name: attendeeData.name, contact: attendeeData.contact, notes: attendeeData.notes ?? null }
        : null;
      const eventTitle = eventSnap.data()?.title ?? data.eventId;
      const payload = withTimestamps(
        withOwner(
          {
            eventId: data.eventId,
            eventTitle,
            attendeeId: data.attendeeId,
            status: data.status ?? "pending",
            attendee,
            registeredAt: new Date().toISOString(),
          },
          uid,
        ),
        "create",
      );
      const ref = await addDoc(collection(db, "registrations"), payload);
      await updateDoc(doc(db, "events", data.eventId), { registrationCount: increment(1) });
      const snap = await getDocOrThrow(ref);
      return mapRegistration(snap);
    },
    {
      onSuccess: (_result, vars) => {
        qc.invalidateQueries({ queryKey: ["registrations"] });
        qc.invalidateQueries({ queryKey: ["events", "detail", vars.data.eventId] });
        qc.invalidateQueries({ queryKey: ["events", "list"] });
      },
    },
  );
}

export function useUpdateRegistration() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: RegistrationUpdate }, RegistrationWithAttendee>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "registrations", id);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapRegistration(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["registrations"] }) },
  );
}

export function useDeleteRegistration() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      const ref = doc(db, "registrations", id);
      const snap = await getDoc(ref);
      const eventId = snap.data()?.eventId;
      await deleteDoc(ref);
      if (eventId) await updateDoc(doc(db, "events", eventId), { registrationCount: increment(-1) });
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["registrations"] });
        qc.invalidateQueries({ queryKey: ["events"] });
      },
    },
  );
}
