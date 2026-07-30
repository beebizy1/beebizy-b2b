import { collection, doc, getDocs, query, where, orderBy, writeBatch, type DocumentData } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCollectionQuery, useFirestoreMutation, withTimestamps, requireDb } from "./core";
import { tsToIso, tsToIsoOptional } from "./converters";
import type { VendorConversation, VendorMessage, SendVendorMessageInput } from "./types";

function mapMessage(vendorId: string, snap: { id: string; data: () => DocumentData }): VendorMessage {
  const d = snap.data();
  return {
    id: snap.id,
    vendorId,
    eventId: d.eventId ?? null,
    direction: d.direction,
    senderName: d.senderName,
    subject: d.subject ?? null,
    content: d.content,
    isRead: d.isRead ?? false,
    createdAt: tsToIso(d.createdAt),
  };
}

export const getListConversationsQueryKey = () => ["conversations"] as const;

/** Vendors with a non-null lastMessageAt, mapped into the Conversation summary shape. */
export function useListConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: getListConversationsQueryKey(),
    queryFn: async (): Promise<VendorConversation[]> => {
      const database = requireDb();
      const snap = await getDocs(query(collection(database, "vendors"), where("ownerId", "==", user!.uid)));
      return snap.docs
        .filter((d) => d.data().lastMessageAt != null)
        .map((d) => {
          const v = d.data();
          return {
            vendorId: d.id,
            vendorName: v.name,
            vendorCategory: v.category,
            lastMessage: v.lastMessage ?? "",
            lastMessageAt: tsToIsoOptional(v.lastMessageAt),
            lastDirection: v.lastDirection ?? undefined,
            unreadCount: v.unreadCount ?? 0,
          };
        })
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    },
    enabled: !!user,
  });
}

export const getListVendorMessagesQueryKey = (vendorId: string) => ["vendorMessages", vendorId] as const;

export function useListVendorMessages(vendorId: string, options?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useCollectionQuery(
    getListVendorMessagesQueryKey(vendorId),
    (database) => query(collection(database, "vendors", vendorId, "messages"), orderBy("createdAt", "asc")),
    (snap) => mapMessage(vendorId, snap),
    { enabled: (options?.query?.enabled ?? true) && !!vendorId },
  );
}

export function useSendVendorMessage() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string; data: SendVendorMessageInput }, VendorMessage>(
    async ({ id: vendorId, data }, { db }) => {
      const direction = "outbound";
      const messageRef = doc(collection(db, "vendors", vendorId, "messages"));
      const payload = withTimestamps({
        direction, senderName: data.senderName, subject: data.subject ?? null,
        content: data.content, isRead: true, eventId: data.eventId ?? null,
      }, "create");
      const batch = writeBatch(db);
      batch.set(messageRef, payload);
      batch.update(doc(db, "vendors", vendorId), {
        lastMessage: data.content, lastMessageAt: payload.createdAt, lastDirection: direction,
      });
      await batch.commit();
      return mapMessage(vendorId, { id: messageRef.id, data: () => payload });
    },
    {
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: getListVendorMessagesQueryKey(vars.id) });
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      },
    },
  );
}

export function useMarkVendorMessagesRead() {
  const qc = useQueryClient();
  return useFirestoreMutation<{ id: string }, void>(
    async ({ id: vendorId }, { db }) => {
      const unreadSnap = await getDocs(
        query(collection(db, "vendors", vendorId, "messages"), where("direction", "==", "inbound"), where("isRead", "==", false)),
      );
      if (!unreadSnap.empty) {
        const batch = writeBatch(db);
        unreadSnap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
        batch.update(doc(db, "vendors", vendorId), { unreadCount: 0 });
        await batch.commit();
      }
    },
    {
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: getListVendorMessagesQueryKey(vars.id) });
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      },
    },
  );
}
