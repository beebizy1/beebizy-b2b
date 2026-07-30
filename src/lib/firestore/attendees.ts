import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useDocQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow } from "./core";
import { tsToIso } from "./converters";
import type { Attendee, AttendeeInput, AttendeeUpdate } from "./types";

function mapAttendee(snap: { id: string; data: () => DocumentData }): Attendee {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    name: d.name,
    contact: d.contact,
    notes: d.notes ?? null,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListAttendeesQueryKey = () => ["attendees", "list"] as const;

export function useListAttendees() {
  const { user } = useAuth();
  return useCollectionQuery(
    getListAttendeesQueryKey(),
    (database) => query(collection(database, "attendees"), where("ownerId", "==", user!.uid), orderBy("name", "asc")),
    mapAttendee,
    { enabled: !!user },
  );
}

export const getGetAttendeeQueryKey = (id: string) => ["attendees", "detail", id] as const;

export function useGetAttendee(id: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useDocQuery(
    getGetAttendeeQueryKey(id),
    (database) => doc(database, "attendees", id),
    (snap) => (snap.exists() ? mapAttendee(snap) : undefined),
    { enabled: (options?.query?.enabled ?? true) && !!id },
  );
}

export function useCreateAttendee() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: AttendeeInput }, Attendee>(
    async ({ data }, { uid, db }) => {
      const payload = withTimestamps(withOwner({ name: data.name, contact: data.contact, notes: data.notes ?? null }, uid), "create");
      const ref = await addDoc(collection(db, "attendees"), payload);
      const snap = await getDocOrThrow(ref);
      return mapAttendee(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["attendees"] }) },
  );
}

export function useUpdateAttendee() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: AttendeeUpdate }, Attendee>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "attendees", id);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapAttendee(snap);
    },
    {
      onSuccess: (_result, vars) => {
        qc.invalidateQueries({ queryKey: ["attendees"] });
        qc.invalidateQueries({ queryKey: getGetAttendeeQueryKey(vars.id) });
      },
    },
  );
}

export function useDeleteAttendee() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      await deleteDoc(doc(db, "attendees", id));
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["attendees"] }) },
  );
}
