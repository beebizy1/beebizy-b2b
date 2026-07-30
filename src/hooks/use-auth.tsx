import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  getAdditionalUserInfo,
  type User,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, storage, db } from "@/lib/firebase";

const NOT_CONFIGURED_MESSAGE =
  "Firebase isn't configured yet. Add your project's credentials to .env (see .env.example) to enable sign-in.";

export interface UserProfile {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  photoURL: string | null;
}

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

async function saveUserProfile(uid: string, profile: Partial<UserProfile> & { createdAt?: ReturnType<typeof serverTimestamp> }) {
  if (!db) throw new Error(NOT_CONFIGURED_MESSAGE);
  await setDoc(doc(db, "users", uid), profile, { merge: true });
}

async function uploadProfileImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error(NOT_CONFIGURED_MESSAGE);
  const storageRef = ref(storage, `profile-images/${uid}/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

interface SignUpInput {
  email: string;
  password: string;
  name: string;
  contactName: string;
  phone: string;
  profileImage?: File | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  userProfile: UserProfile | null;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  completeProfile: (profile: { contactName: string; phone: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(
      auth,
      async (nextUser) => {
        console.log("[auth] onAuthStateChanged fired. user:", nextUser?.uid ?? null, nextUser?.email ?? "");
        setUser(nextUser);
        setUserProfile(nextUser ? await fetchUserProfile(nextUser.uid) : null);
        setLoading(false);
      },
      (error) => {
        console.error("[auth] onAuthStateChanged error:", error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const signUpWithEmail = async ({ email, password, name, contactName, phone, profileImage }: SignUpInput) => {
    if (!auth) throw new Error(NOT_CONFIGURED_MESSAGE);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    let photoURL: string | null = null;
    if (profileImage) {
      photoURL = await uploadProfileImage(credential.user.uid, profileImage);
    }
    await updateProfile(credential.user, { displayName: name, photoURL: photoURL ?? undefined });

    const profile: UserProfile = { name, contactName, phone, email, photoURL };
    await saveUserProfile(credential.user.uid, { ...profile, createdAt: serverTimestamp() });

    setUserProfile(profile);
    setUser(auth.currentUser);
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) throw new Error(NOT_CONFIGURED_MESSAGE);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    console.log("[auth] signInWithGoogle called. auth configured:", !!auth);
    if (!auth) throw new Error(NOT_CONFIGURED_MESSAGE);
    const result = await signInWithPopup(auth, googleProvider);
    const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false;
    console.log("[auth] signInWithPopup resolved. uid:", result.user.uid, "isNewUser:", isNewUser);

    if (isNewUser) {
      const profile: UserProfile = {
        name: result.user.displayName ?? "",
        contactName: "",
        phone: "",
        email: result.user.email ?? "",
        photoURL: result.user.photoURL ?? null,
      };
      await saveUserProfile(result.user.uid, { ...profile, createdAt: serverTimestamp() });
      setUserProfile(profile);
    } else {
      setUserProfile(await fetchUserProfile(result.user.uid));
    }

    return { isNewUser };
  };

  const completeProfile = async (profile: { contactName: string; phone: string }) => {
    if (!user) return;
    await saveUserProfile(user.uid, profile);
    setUserProfile((prev) =>
      prev
        ? { ...prev, ...profile }
        : { name: user.displayName ?? "", email: user.email ?? "", photoURL: user.photoURL, ...profile }
    );
  };

  const signOutUser = () => (auth ? firebaseSignOut(auth) : Promise.resolve());

  return (
    <AuthContext.Provider
      value={{ user, loading, userProfile, signUpWithEmail, signInWithEmail, signInWithGoogle, completeProfile, signOutUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
