import {
  getDocs,
  getDoc,
  serverTimestamp,
  type Firestore,
  type Query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  type DocumentReference,
  type FieldValue,
} from "firebase/firestore";
import {
  useQuery,
  useMutation,
  type QueryKey,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { FirestoreOpError } from "./errors";

const NOT_CONFIGURED_MESSAGE =
  "Firebase isn't configured yet. Add your project's credentials to .env (see .env.example).";

export function requireDb(): Firestore {
  if (!db) throw new FirestoreOpError("failed-precondition", NOT_CONFIGURED_MESSAGE);
  return db;
}

/** getDoc() that throws instead of returning a possibly-nonexistent snapshot — use right after a write. */
export async function getDocOrThrow(ref: DocumentReference<DocumentData>): Promise<QueryDocumentSnapshot<DocumentData>> {
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new FirestoreOpError("not-found", `Document ${ref.path} not found.`);
  return snap;
}

/** Drops keys whose value is undefined — Firestore writes reject undefined field values. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

export function withOwner<T extends object>(data: T, uid: string): T & { ownerId: string } {
  return { ...data, ownerId: uid };
}

export function withTimestamps<T extends object>(
  data: T,
  mode: "create" | "update",
): T & { createdAt?: FieldValue; updatedAt: FieldValue } {
  return mode === "create"
    ? { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    : { ...data, updatedAt: serverTimestamp() };
}

/** One-time collection fetch wrapped in react-query — no live onSnapshot listeners. */
export function useCollectionQuery<T>(
  queryKey: QueryKey,
  buildQuery: (database: Firestore) => Query<DocumentData>,
  mapDoc: (snap: QueryDocumentSnapshot<DocumentData>) => T,
  options?: { enabled?: boolean },
): UseQueryResult<T[], FirestoreOpError> {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const database = requireDb();
      const snap = await getDocs(buildQuery(database));
      return snap.docs.map(mapDoc);
    },
    enabled: options?.enabled ?? true,
  });
}

/** One-time single-document fetch wrapped in react-query. */
export function useDocQuery<T>(
  queryKey: QueryKey,
  buildRef: (database: Firestore) => DocumentReference<DocumentData>,
  mapDoc: (snap: DocumentSnapshot<DocumentData>) => T | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<T | undefined, FirestoreOpError> {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const database = requireDb();
      const snap = await getDoc(buildRef(database));
      return mapDoc(snap);
    },
    enabled: options?.enabled ?? true,
  });
}

/** Mutation wrapper: resolves the signed-in uid + db, throws FirestoreOpError if signed out. */
export function useFirestoreMutation<TVars, TResult>(
  mutationFn: (vars: TVars, ctx: { uid: string; db: Firestore }) => Promise<TResult>,
  opts?: { onSuccess?: (result: TResult, vars: TVars) => void },
): UseMutationResult<TResult, FirestoreOpError, TVars> {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      if (!user) throw new FirestoreOpError("unauthenticated", "You must be signed in.");
      const database = requireDb();
      return mutationFn(vars, { uid: user.uid, db: database });
    },
    onSuccess: opts?.onSuccess,
  });
}
