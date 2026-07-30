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
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useFirestoreMutation, withOwner, withTimestamps, stripUndefined, getDocOrThrow, requireDb } from "./core";
import { tsToIso } from "./converters";
import { getLocationRecord } from "./locations";
import type {
  Template,
  TemplateDetail,
  TemplateInput,
  TemplateUpdate,
  TemplateChecklistItem,
  TemplateChecklistItemInput,
  TemplateRunOfShowItem,
  TemplateRunOfShowItemInput,
  TemplateBudgetItem,
  TemplateBudgetItemInput,
  EventFromTemplateInput,
  SaveEventAsTemplateInput,
  Event,
} from "./types";

function mapTemplate(snap: { id: string; data: () => DocumentData }): Template {
  const d = snap.data();
  return {
    id: snap.id,
    ownerId: d.ownerId,
    name: d.name,
    description: d.description ?? null,
    category: d.category,
    defaultCapacity: d.defaultCapacity ?? null,
    createdAt: tsToIso(d.createdAt),
    checklistCount: d.checklistCount ?? 0,
    runOfShowCount: d.runOfShowCount ?? 0,
    budgetCount: d.budgetCount ?? 0,
  };
}

function mapTemplateChecklistItem(templateId: string, snap: { id: string; data: () => DocumentData }): TemplateChecklistItem {
  const d = snap.data();
  return {
    id: snap.id,
    templateId,
    title: d.title,
    description: d.description ?? null,
    category: d.category,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

function mapTemplateRunOfShowItem(templateId: string, snap: { id: string; data: () => DocumentData }): TemplateRunOfShowItem {
  const d = snap.data();
  return {
    id: snap.id,
    templateId,
    startTime: d.startTime,
    duration: d.duration ?? null,
    title: d.title,
    description: d.description ?? null,
    responsible: d.responsible ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

function mapTemplateBudgetItem(templateId: string, snap: { id: string; data: () => DocumentData }): TemplateBudgetItem {
  const d = snap.data();
  return {
    id: snap.id,
    templateId,
    name: d.name,
    category: d.category,
    type: d.type,
    estimatedAmount: d.estimatedAmount,
    notes: d.notes ?? null,
    sortOrder: d.sortOrder ?? 0,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListTemplatesQueryKey = () => ["templates", "list"] as const;

export function useListTemplates() {
  const { user } = useAuth();
  return useCollectionQuery(
    getListTemplatesQueryKey(),
    (database) => query(collection(database, "templates"), where("ownerId", "==", user!.uid), orderBy("createdAt", "desc")),
    mapTemplate,
    { enabled: !!user },
  );
}

export const getGetTemplateQueryKey = (id: string) => ["templates", "detail", id] as const;

export function useGetTemplate(id: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery({
    queryKey: getGetTemplateQueryKey(id),
    queryFn: async (): Promise<TemplateDetail> => {
      const database = requireDb();
      const templateSnap = await getDocOrThrow(doc(database, "templates", id));
      const [checklistSnap, rosSnap, budgetSnap] = await Promise.all([
        getDocs(query(collection(database, "templates", id, "checklistItems"), orderBy("sortOrder", "asc"))),
        getDocs(query(collection(database, "templates", id, "runOfShowItems"), orderBy("sortOrder", "asc"))),
        getDocs(query(collection(database, "templates", id, "budgetItems"), orderBy("sortOrder", "asc"))),
      ]);
      return {
        ...mapTemplate(templateSnap),
        checklistItems: checklistSnap.docs.map((s) => mapTemplateChecklistItem(id, s)),
        runOfShowItems: rosSnap.docs.map((s) => mapTemplateRunOfShowItem(id, s)),
        budgetItems: budgetSnap.docs.map((s) => mapTemplateBudgetItem(id, s)),
      };
    },
    enabled: (options?.query?.enabled ?? true) && !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ data: TemplateInput }, Template>(
    async ({ data }, { uid, db }) => {
      const payload = withTimestamps(
        withOwner(
          {
            name: data.name,
            description: data.description ?? null,
            category: data.category,
            defaultCapacity: data.defaultCapacity ?? null,
            checklistCount: 0,
            runOfShowCount: 0,
            budgetCount: 0,
          },
          uid,
        ),
        "create",
      );
      const ref = await addDoc(collection(db, "templates"), payload);
      const snap = await getDocOrThrow(ref);
      return mapTemplate(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }) },
  );
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: TemplateUpdate }, Template>(
    async ({ id, data }, { db }) => {
      const ref = doc(db, "templates", id);
      await updateDoc(ref, withTimestamps(stripUndefined({ ...data }), "update"));
      const snap = await getDocOrThrow(ref);
      return mapTemplate(snap);
    },
    {
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: ["templates"] });
        qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) });
      },
    },
  );
}

const TEMPLATE_SUBCOLLECTIONS = ["checklistItems", "runOfShowItems", "budgetItems"] as const;

async function deleteAllDocs(db: Firestore, colRef: ReturnType<typeof collection>) {
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs;
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id }, { db }) => {
      for (const sub of TEMPLATE_SUBCOLLECTIONS) {
        await deleteAllDocs(db, collection(db, "templates", id, sub));
      }
      await deleteDoc(doc(db, "templates", id));
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }) },
  );
}

// --- Nested checklist / run-of-show / budget item CRUD ---

export function useAddTemplateChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: TemplateChecklistItemInput }, TemplateChecklistItem>(
    async ({ id, data }, { db }) => {
      const payload = withTimestamps({ title: data.title, description: data.description ?? null, category: data.category ?? "General", sortOrder: data.sortOrder ?? 0 }, "create");
      const ref = await addDoc(collection(db, "templates", id, "checklistItems"), payload);
      await updateDoc(doc(db, "templates", id), { checklistCount: increment(1) });
      const snap = await getDocOrThrow(ref);
      return mapTemplateChecklistItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useUpdateTemplateChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: Partial<TemplateChecklistItemInput> }, TemplateChecklistItem>(
    async ({ id, itemId, data }, { db }) => {
      const ref = doc(db, "templates", id, "checklistItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapTemplateChecklistItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useDeleteTemplateChecklistItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id, itemId }, { db }) => {
      await deleteDoc(doc(db, "templates", id, "checklistItems", itemId));
      await updateDoc(doc(db, "templates", id), { checklistCount: increment(-1) });
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useAddTemplateRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: TemplateRunOfShowItemInput }, TemplateRunOfShowItem>(
    async ({ id, data }, { db }) => {
      const payload = withTimestamps(stripUndefined({ startTime: data.startTime, duration: data.duration ?? null, title: data.title, description: data.description ?? null, responsible: data.responsible ?? null, sortOrder: data.sortOrder ?? 0 }), "create");
      const ref = await addDoc(collection(db, "templates", id, "runOfShowItems"), payload);
      await updateDoc(doc(db, "templates", id), { runOfShowCount: increment(1) });
      const snap = await getDocOrThrow(ref);
      return mapTemplateRunOfShowItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useUpdateTemplateRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: Partial<TemplateRunOfShowItemInput> }, TemplateRunOfShowItem>(
    async ({ id, itemId, data }, { db }) => {
      const ref = doc(db, "templates", id, "runOfShowItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapTemplateRunOfShowItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useDeleteTemplateRunOfShowItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id, itemId }, { db }) => {
      await deleteDoc(doc(db, "templates", id, "runOfShowItems", itemId));
      await updateDoc(doc(db, "templates", id), { runOfShowCount: increment(-1) });
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useAddTemplateBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: TemplateBudgetItemInput }, TemplateBudgetItem>(
    async ({ id, data }, { db }) => {
      const payload = withTimestamps({ name: data.name, category: data.category ?? "Other", type: data.type, estimatedAmount: data.estimatedAmount, notes: data.notes ?? null, sortOrder: data.sortOrder ?? 0 }, "create");
      const ref = await addDoc(collection(db, "templates", id, "budgetItems"), payload);
      await updateDoc(doc(db, "templates", id), { budgetCount: increment(1) });
      const snap = await getDocOrThrow(ref);
      return mapTemplateBudgetItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useUpdateTemplateBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string; data: Partial<TemplateBudgetItemInput> }, TemplateBudgetItem>(
    async ({ id, itemId, data }, { db }) => {
      const ref = doc(db, "templates", id, "budgetItems", itemId);
      await updateDoc(ref, stripUndefined({ ...data }));
      const snap = await getDocOrThrow(ref);
      return mapTemplateBudgetItem(id, snap);
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

export function useDeleteTemplateBudgetItem() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; itemId: string }, void>(
    async ({ id, itemId }, { db }) => {
      await deleteDoc(doc(db, "templates", id, "budgetItems", itemId));
      await updateDoc(doc(db, "templates", id), { budgetCount: increment(-1) });
    },
    { onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: getGetTemplateQueryKey(vars.id) }) },
  );
}

// --- Apply template -> new event / Save event -> new template ---

function mapEventFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Event {
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
  };
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: EventFromTemplateInput }, Event>(
    async ({ id: templateId, data }, { uid, db }) => {
      const templateSnap = await getDocOrThrow(doc(db, "templates", templateId));
      const template = mapTemplate(templateSnap);
      const locationRecord = data.locationId ? await getLocationRecord(db, data.locationId) : undefined;

      const eventPayload = withTimestamps(
        withOwner(
          {
            title: data.title,
            description: data.description ?? null,
            date: data.date,
            endDate: data.endDate ?? null,
            location: data.location ?? null,
            locationId: data.locationId ?? null,
            locationRecord: locationRecord ?? null,
            capacity: data.capacity ?? template.defaultCapacity ?? null,
            status: data.status ?? "draft",
            category: data.category,
            imageUrl: null,
            registrationCount: 0,
            shareToken: null,
          },
          uid,
        ),
        "create",
      );
      const eventRef = await addDoc(collection(db, "events"), eventPayload);
      if (data.locationId) await updateDoc(doc(db, "locations", data.locationId), { eventCount: increment(1) });

      const [checklistSnap, rosSnap, budgetSnap] = await Promise.all([
        getDocs(collection(db, "templates", templateId, "checklistItems")),
        getDocs(collection(db, "templates", templateId, "runOfShowItems")),
        getDocs(collection(db, "templates", templateId, "budgetItems")),
      ]);

      const batch = writeBatch(db);
      checklistSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "events", eventRef.id, "checklistItems")), {
          title: t.title, description: t.description ?? null, completed: false, dueDate: null,
          assignedTo: null, category: t.category, sortOrder: t.sortOrder ?? 0, createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      rosSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "events", eventRef.id, "runOfShowItems")), {
          startTime: t.startTime, duration: t.duration ?? null, title: t.title, description: t.description ?? null,
          responsible: t.responsible ?? null, sortOrder: t.sortOrder ?? 0, createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      budgetSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "events", eventRef.id, "budgetItems")), {
          name: t.name, category: t.category, type: t.type, estimatedAmount: t.estimatedAmount,
          actualAmount: null, notes: t.notes ?? null, sortOrder: t.sortOrder ?? 0, createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      await batch.commit();

      const snap = await getDocOrThrow(eventRef);
      return mapEventFromDoc(snap);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["locations"] });
      },
    },
  );
}

export function useSaveEventAsTemplate() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: SaveEventAsTemplateInput }, Template>(
    async ({ id: eventId, data }, { uid, db }) => {
      const [checklistSnap, rosSnap, budgetSnap] = await Promise.all([
        getDocs(collection(db, "events", eventId, "checklistItems")),
        getDocs(collection(db, "events", eventId, "runOfShowItems")),
        getDocs(collection(db, "events", eventId, "budgetItems")),
      ]);
      const eventSnap = await getDocOrThrow(doc(db, "events", eventId));
      const eventData = eventSnap.data();

      const templatePayload = withTimestamps(
        withOwner(
          {
            name: data.name,
            description: data.description ?? null,
            category: eventData.category ?? "General",
            defaultCapacity: eventData.capacity ?? null,
            checklistCount: checklistSnap.size,
            runOfShowCount: rosSnap.size,
            budgetCount: budgetSnap.size,
          },
          uid,
        ),
        "create",
      );
      const templateRef = await addDoc(collection(db, "templates"), templatePayload);

      const batch = writeBatch(db);
      checklistSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "templates", templateRef.id, "checklistItems")), {
          title: t.title, description: t.description ?? null, category: t.category, sortOrder: t.sortOrder ?? 0,
          createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      rosSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "templates", templateRef.id, "runOfShowItems")), {
          startTime: t.startTime, duration: t.duration ?? null, title: t.title, description: t.description ?? null,
          responsible: t.responsible ?? null, sortOrder: t.sortOrder ?? 0, createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      budgetSnap.docs.forEach((s) => {
        const t = s.data();
        batch.set(doc(collection(db, "templates", templateRef.id, "budgetItems")), {
          name: t.name, category: t.category, type: t.type, estimatedAmount: t.estimatedAmount,
          notes: t.notes ?? null, sortOrder: t.sortOrder ?? 0, createdAt: withTimestamps({}, "create").createdAt,
        });
      });
      await batch.commit();

      const snap = await getDocOrThrow(templateRef);
      return mapTemplate(snap);
    },
    { onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }) },
  );
}
