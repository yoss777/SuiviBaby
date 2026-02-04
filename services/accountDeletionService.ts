import { auth, db } from "@/config/firebase";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  Timestamp,
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

  const accessQuery = query(
    collection(db, "user_child_access"),
    where("userId", "==", userId)
  );
  const accessSnapshot = await getDocs(accessQuery);

  for (const accessDoc of accessSnapshot.docs) {
    const accessDataIndex = accessDoc.data() as { childId?: string };
    const childId = accessDataIndex.childId;
    if (!childId) continue;

    const accessData = accessDoc.data() as { role?: string };
    const childAccessSnap = await getDocs(
      collection(db, "children", childId, "access")
    );

    if (childAccessSnap.size <= 1) {
      await deleteChildData(childId);
      await deleteDoc(doc(db, "children", childId));
      continue;
    }

    if (accessData.role === "owner") {
      const newOwnerDoc = childAccessSnap.docs.find((d) => d.id !== userId);
      if (newOwnerDoc) {
        await updateDoc(doc(db, "children", childId), {
          ownerId: newOwnerDoc.id,
        });
        await updateDoc(newOwnerDoc.ref, {
          role: "owner",
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: newOwnerDoc.id,
          grantedAt: Timestamp.now(),
        });
      }
    }

    await deleteDoc(doc(db, "children", childId, "access", userId));
    await deleteDoc(doc(db, "user_child_access", `${userId}_${childId}`));
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
