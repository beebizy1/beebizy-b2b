import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, type DocumentData } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, stripUndefined, getDocOrThrow, requireDb } from "./core";
import { tsToIso } from "./converters";
import type { BudgetItem, BudgetItemInput, BudgetItemUpdate } from "./types";

function mapBudgetItem(eventId: string, snap: { id: string; data: () => DocumentData }): BudgetItem {
  const d = snap.data();
  return {
    id: snap.id,
    eventId,
    name: d.name,
    category: d.category,
    type: d.type,
    estimatedAmount: d.estimatedAmount,
    actualAmount: d.actualAmount ?? null,
    notes: d.notes ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListBudgetItemsQueryKey = (eventId: string) => ["budgetItems", "byEvent", eventId] as const;

/** Raw fetcher (not a hook) — used by Dashboard.tsx to aggregate budget totals across multiple events via useQueries. */
export async function listBudgetItems(eventId: string): Promise<BudgetItem[]> {
  const database = requireDb();
  const snap = await getDocs(query(collection(database, "events", eventId, "budgetItems"), orderBy("sortOrder", "asc")));
  return snap.docs.map((s) => mapBudgetItem(eventId, s));
}

export function useListBudgetItems(eventId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListBudgetItemsQueryKey(eventId),
    (database) => query(collection(database, "events", eventId, "budgetItems"), orderBy("sortOrder", "asc")),
    (snap) => mapBudgetItem(eventId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!eventId },
  );
}

export function useCreateBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: BudgetItemInput }, BudgetItem>(
    async ({ id: eventId, data }, { db }) => {
      const payload = withTimestamps({
        name: data.name, category: data.category ?? "Other", type: data.type,
        estimatedAmount: data.estimatedAmount, actualAmount: data.actualAmount ?? null,
        notes: data.notes ?? null, sortOrder: data.sortOrder ?? 0,
      }, "create");
      const ref = await addDoc(collection(db, "events", eventId, "budgetItems"), payload);
      const snap = await getDocOrThrow(ref);
      return mapBudgetItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(vars.id) }) },
  );
}

export function useUpdateBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: BudgetItemUpdate }, BudgetItem>(
    async ({ id: eventId, itemId, data }, { db }) => {
      const ref = doc(db, "events", eventId, "budgetItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapBudgetItem(eventId, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(vars.id) }) },
  );
}

export function useDeleteBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id: eventId, itemId }, { db }) => {
      await deleteDoc(doc(db, "events", eventId, "budgetItems", itemId));
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getListBudgetItemsQueryKey(vars.id) }) },
  );
}
