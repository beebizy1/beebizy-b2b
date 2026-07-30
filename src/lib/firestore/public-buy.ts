import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  runTransaction,
  increment,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { requireDb } from "./core";
import { FirestoreOpError } from "./errors";
import type { ChecklistItem, RunOfShowItem, SharedEventDetail, TicketType } from "./types";

async function resolveEventDocByShareToken(db: Firestore, token: string) {
  const snap = await getDocs(query(collection(db, "events"), where("shareToken", "==", token), limit(1)));
  if (snap.empty) return null;
  return snap.docs[0];
}

export const getGetSharedEventQueryKey = (token: string) => ["sharedEvent", token] as const;

/** Public read-only snapshot (event + checklist + run-of-show) for /share/:token. */
export function useGetSharedEvent(token: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery({
    queryKey: getGetSharedEventQueryKey(token),
    queryFn: async (): Promise<SharedEventDetail | null> => {
      const database = requireDb();
      const eventDoc = await resolveEventDocByShareToken(database, token);
      if (!eventDoc) return null;
      const e = eventDoc.data();
      const [checklistSnap, rosSnap] = await Promise.all([
        getDocs(collection(database, "events", eventDoc.id, "checklistItems")),
        getDocs(query(collection(database, "events", eventDoc.id, "runOfShowItems"), orderBy("sortOrder", "asc"))),
      ]);
      const checklistItems: ChecklistItem[] = checklistSnap.docs.map((s) => {
        const d = s.data();
        return { id: s.id, eventId: eventDoc.id, title: d.title, description: d.description ?? null, completed: d.completed ?? false, dueDate: d.dueDate ?? null, assignedTo: d.assignedTo ?? null, category: d.category, sortOrder: d.sortOrder ?? 0, createdAt: "" };
      });
      const runOfShowItems: RunOfShowItem[] = rosSnap.docs.map((s) => {
        const d = s.data();
        return { id: s.id, eventId: eventDoc.id, startTime: d.startTime, duration: d.duration ?? null, title: d.title, description: d.description ?? null, responsible: d.responsible ?? null, sortOrder: d.sortOrder ?? 0, createdAt: "" };
      });
      return {
        id: eventDoc.id,
        title: e.title,
        description: e.description ?? null,
        date: e.date,
        endDate: e.endDate ?? null,
        location: e.location ?? null,
        capacity: e.capacity ?? null,
        category: e.category,
        status: e.status,
        checklistItems,
        runOfShowItems,
      };
    },
    enabled: (options?.query?.enabled ?? true) && !!token,
  });
}

export interface BuyEvent {
  id: string;
  title: string;
  date: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  status: string;
}
export interface BuyPageData {
  event: BuyEvent;
  ticketTypes: TicketType[];
}

/** Public read (event + active ticket types) for /buy/:token. */
export function useBuyPageData(token: string) {
  return useQuery({
    queryKey: ["buy", token],
    queryFn: async (): Promise<BuyPageData> => {
      const database = requireDb();
      const eventDoc = await resolveEventDocByShareToken(database, token);
      if (!eventDoc) throw new FirestoreOpError("not-found", "Event not found");
      const e = eventDoc.data();
      const ticketsSnap = await getDocs(query(collection(database, "events", eventDoc.id, "ticketTypes"), orderBy("sortOrder", "asc")));
      const ticketTypes: TicketType[] = ticketsSnap.docs
        .map((s) => {
          const d = s.data();
          return {
            id: s.id, eventId: eventDoc.id, name: d.name, description: d.description ?? null, price: d.price ?? "0",
            quantityTotal: d.quantityTotal ?? 0, quantitySold: d.quantitySold ?? 0, isActive: d.isActive ?? true,
            sortOrder: d.sortOrder ?? 0, createdAt: "", updatedAt: null,
          };
        })
        .filter((t) => t.isActive);
      return {
        event: { id: eventDoc.id, title: e.title, date: e.date ?? null, endDate: e.endDate ?? null, location: e.location ?? null, description: e.description ?? null, status: e.status },
        ticketTypes,
      };
    },
    enabled: !!token,
  });
}

export interface ConfirmationData {
  confirmationId: string;
  buyerName: string;
  buyerEmail: string;
  event: { title: string; date: string | null; location: string | null };
  items: { name: string; quantity: number; price: string; subtotal: number }[];
  total: number;
}

export interface CheckoutInput {
  token: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  items: { ticketTypeId: string; quantity: number }[];
}

/** Public unauthenticated checkout — atomically decrements ticketTypes.quantitySold and creates a registration. */
export async function checkoutTickets(input: CheckoutInput): Promise<ConfirmationData> {
  const database = requireDb();
  const registrationRef = doc(collection(database, "registrations"));

  // Firestore web SDK transactions only support tx.get() on DocumentReferences, not
  // queries — resolve the event by token first, then re-verify inside the transaction.
  const resolvedEventDoc = await resolveEventDocByShareToken(database, input.token);
  if (!resolvedEventDoc) throw new FirestoreOpError("not-found", "Event not found");
  const eventRef = resolvedEventDoc.ref;

  const result = await runTransaction(database, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists() || eventSnap.data().shareToken !== input.token) {
      throw new FirestoreOpError("not-found", "Event not found");
    }
    const eventDoc = eventSnap;
    const eventData = eventSnap.data();

    const ticketRefs = input.items.map((i) => doc(database, "events", eventDoc.id, "ticketTypes", i.ticketTypeId));
    const ticketSnaps = await Promise.all(ticketRefs.map((r) => tx.get(r)));

    const lineItems: { name: string; quantity: number; price: string; subtotal: number }[] = [];
    let total = 0;
    ticketSnaps.forEach((snap, i) => {
      if (!snap.exists()) throw new FirestoreOpError("not-found", "Ticket type not found");
      const t = snap.data() as DocumentData;
      const requested = input.items[i].quantity;
      const nextSold = (t.quantitySold ?? 0) + requested;
      if (t.quantityTotal > 0 && nextSold > t.quantityTotal) {
        throw new FirestoreOpError("failed-precondition", `${t.name} is sold out`);
      }
      tx.update(ticketRefs[i], { quantitySold: nextSold });
      const price = parseFloat(t.price) || 0;
      const subtotal = price * requested;
      total += subtotal;
      lineItems.push({ name: t.name, quantity: requested, price: t.price, subtotal });
    });

    tx.set(registrationRef, {
      ownerId: eventData.ownerId,
      eventId: eventDoc.id,
      eventTitle: eventData.title,
      attendeeId: null,
      status: "confirmed",
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone ?? null,
      items: input.items,
      attendee: {
        id: null,
        name: input.buyerName,
        contact: input.buyerPhone ? `${input.buyerEmail} · ${input.buyerPhone}` : input.buyerEmail,
        notes: null,
      },
      registeredAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(doc(database, "events", eventDoc.id), { registrationCount: increment(1) });

    return {
      confirmationId: registrationRef.id.slice(0, 8).toUpperCase(),
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      event: { title: eventData.title, date: eventData.date ?? null, location: eventData.location ?? null },
      items: lineItems,
      total,
    };
  });

  return result;
}
