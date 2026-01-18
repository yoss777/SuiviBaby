import { auth, db } from "@/config/firebase";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const CHILD_COLLECTIONS = [
  "events",
  "tetees",
  "pompages",
  "mictions",
  "selles",
  "vitamines",
  "vaccins",
  "babyAttachmentRequests",
];

const CHILD_AUX_COLLECTIONS = ["shareCodes", "shareInvitations"];

async function deleteDocsByField(
  collectionName: string,
  field: string,
  value: string
) {
  while (true) {
    const q = query(
      collection(db, collectionName),
      where(field, "==", value),
      limit(300)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
}

async function deleteChildData(childId: string) {
  await Promise.all(
    CHILD_COLLECTIONS.map((name) => deleteDocsByField(name, "childId", childId))
  );

  await Promise.all(
    CHILD_AUX_COLLECTIONS.map((name) => deleteDocsByField(name, "childId", childId))
  );
}

export async function deleteAccountAndData(password: string) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Utilisateur non authentifie.");
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  const userId = user.uid;
  const email = user.email.toLowerCase();

  const childrenQuery = query(
    collection(db, "children"),
    where("parentIds", "array-contains", userId)
  );
  const childrenSnapshot = await getDocs(childrenQuery);

  for (const childDoc of childrenSnapshot.docs) {
    const childData = childDoc.data() as { parentIds?: string[] };
    const parentIds = childData.parentIds || [];
    if (parentIds.length > 1) {
      await updateDoc(childDoc.ref, { parentIds: arrayRemove(userId) });
    } else {
      await deleteChildData(childDoc.id);
      await deleteDoc(childDoc.ref);
    }
  }

  await Promise.all([
    deleteDocsByField("shareCodes", "createdBy", userId),
    deleteDocsByField("shareInvitations", "inviterEmail", email),
    deleteDocsByField("shareInvitations", "invitedEmail", email),
  ]);

  await Promise.all([
    deleteDoc(doc(db, "users", userId)),
    deleteDoc(doc(db, "user_preferences", userId)),
  ]);

  await deleteUser(user);
}
