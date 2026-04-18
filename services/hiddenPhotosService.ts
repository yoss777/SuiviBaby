import { auth, db } from "@/config/firebase";
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

const COLLECTION = "user_hidden_photos";

function getDocRef() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User not authenticated");
  return doc(db, COLLECTION, uid);
}

export async function hidePhoto(eventId: string): Promise<void> {
  await setDoc(getDocRef(), { hiddenEventIds: arrayUnion(eventId) }, { merge: true });
}

export async function unhidePhoto(eventId: string): Promise<void> {
  await setDoc(getDocRef(), { hiddenEventIds: arrayRemove(eventId) }, { merge: true });
}

export async function getHiddenEventIds(): Promise<string[]> {
  const snap = await getDoc(getDocRef());
  if (!snap.exists()) return [];
  return (snap.data()?.hiddenEventIds as string[]) ?? [];
}

export function onHiddenPhotosChange(
  callback: (hiddenIds: string[]) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      callback((snap.data()?.hiddenEventIds as string[]) ?? []);
    },
    () => callback([]),
  );
}
