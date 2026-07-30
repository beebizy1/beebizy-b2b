import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { requireDb } from "./core";
import type { TicketWithEvent } from "./types";

export const getGetTicketReportQueryKey = () => ["ticketReport"] as const;

/** Client-side join across all owner events' ticketTypes subcollections — no separate report backend. */
export function useGetTicketReport(options?: { query?: { queryKey?: readonly unknown[] } }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: getGetTicketReportQueryKey(),
    queryFn: async (): Promise<TicketWithEvent[]> => {
      const database = requireDb();
      const eventsSnap = await getDocs(
        query(collection(database, "events"), where("ownerId", "==", user!.uid), orderBy("date", "desc")),
      );
      const results: TicketWithEvent[] = [];
      await Promise.all(
        eventsSnap.docs.map(async (eventDoc) => {
          const e = eventDoc.data();
          const ticketsSnap = await getDocs(collection(database, "events", eventDoc.id, "ticketTypes"));
          ticketsSnap.docs.forEach((t) => {
            const d = t.data();
            results.push({
              id: t.id,
              eventId: eventDoc.id,
              eventTitle: e.title,
              eventDate: e.date,
              eventStatus: e.status,
              eventCategory: e.category,
              name: d.name,
              description: d.description ?? null,
              price: d.price ?? "0",
              quantityTotal: d.quantityTotal ?? 0,
              quantitySold: d.quantitySold ?? 0,
              isActive: d.isActive ?? true,
              sortOrder: d.sortOrder ?? 0,
              createdAt: d.createdAt?.toDate?.().toISOString?.() ?? new Date().toISOString(),
              updatedAt: null,
            });
          });
        }),
      );
      return results;
    },
    enabled: !!user,
  });
}
