// services/childSharingService.ts
import { auth, db } from "@/config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getUserByEmail } from "./usersService";
import { grantChildAccess, revokeChildAccess } from "@/utils/permissions";

export interface ShareCode {
  code: string;
  childId: string;
  childName: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  used: boolean;
  usedBy?: string;
  usedByEmail?: string;
  usedAt?: Timestamp;
}

export interface ShareInvitation {
  id?: string;
  childId: string;
  childName: string;
  inviterId: string;
  inviterEmail: string;
  invitedEmail: string;
  invitedUserId?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Timestamp;
}

/**
 * Génère un code de partage aléatoire (6 caractères alphanumériques)
 */
function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sans caractères ambigus (0, O, I, 1)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Crée un code de partage pour un enfant (valide 7 jours)
 */
export async function createShareCode(
  childId: string,
  childName: string,
): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur non connecté");

    const maxAttempts = 5;
    for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
      const code = generateShareCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire dans 7 jours

      const shareCodeData: ShareCode = {
        code,
        childId,
        childName,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
        used: false,
      };

      try {
        await setDoc(doc(db, "shareCodes", code), shareCodeData);
        return code;
      } catch (error: any) {
        if (error?.code === "permission-denied") {
          // Possible collision with an existing (used/expired) code.
          continue;
        }
        throw error;
      }
    }

    throw new Error("Impossible de générer un code unique");
  } catch (error) {
    console.error("Erreur lors de la création du code de partage:", error);
    throw error;
  }
}

/**
 * Utilise un code de partage pour accéder à un enfant
 */
export async function useShareCode(
  code: string,
): Promise<{ childId: string; childName: string }> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur non connecté");

    const codeDoc = await getDoc(doc(db, "shareCodes", code.toUpperCase()));

    if (!codeDoc.exists()) {
      throw new Error("Code invalide ou expiré");
    }

    const shareCode = codeDoc.data() as ShareCode;

    // Vérifier si le code a déjà été utilisé
    if (shareCode.used) {
      throw new Error("Ce code a déjà été utilisé");
    }

    // Vérifier si le code n'est pas expiré
    if (shareCode.expiresAt.toDate() < new Date()) {
      throw new Error("Ce code a expiré");
    }

    const accessDoc = await getDoc(
      doc(db, "children", shareCode.childId, "access", user.uid)
    );
    if (accessDoc.exists()) {
      throw new Error("Vous avez déjà accès à cet enfant");
    }

    // IMPORTANT: Marquer le code comme utilisé AVANT de créer l'accès
    // Car les règles Firestore vérifient que used == true ET usedBy == request.auth.uid
    await updateDoc(doc(db, "shareCodes", code.toUpperCase()), {
      used: true,
      usedBy: user.uid,
      usedByEmail: user.email ?? null,
      usedAt: Timestamp.now(),
    });

    // Créer l'accès pour l'utilisateur invité APRÈS avoir marqué le code comme utilisé
    await grantChildAccess(
      shareCode.childId,
      user.uid,
      "contributor",
      shareCode.createdBy,
      { invitationId: code.toUpperCase() }
    );

    return {
      childId: shareCode.childId,
      childName: shareCode.childName,
    };
  } catch (error) {
    console.error("Erreur lors de l'utilisation du code:", error);
    throw error;
  }
}

/**
 * Crée une invitation par email pour partager un enfant
 *
 * Workflow:
 * 1. User1 invite l'email de User2
 * 2. Le système trouve l'id de User2 basé sur son email
 * 3. Comparaison si l'id de User2 est dans la liste des parentIds de l'enfant
 * 4. Si oui → blocage (déjà lié)
 * 5. Si non → vérification s'il n'y a pas déjà une invitation en cours
 * 6. Si oui → blocage (doublon)
 * 7. Si non → envoi de l'invitation
 */
export async function createEmailInvitation(
  childId: string,
  childName: string,
  invitedEmail: string,
): Promise<string> {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("Utilisateur non connecté");
    if (!childId) {
      console.error("Invitation: childId manquant", {
        childId,
        childName,
        inviterId: user.uid,
      });
      throw new Error("Enfant introuvable");
    }

    const invitedEmailLower = invitedEmail.trim().toLowerCase();

    // Étape 1: Vérifier que l'utilisateur ne s'invite pas lui-même
    if (invitedEmailLower === user.email.toLowerCase()) {
      const error: Error & { code?: string } = new Error(
        "Vous ne pouvez pas vous inviter vous-même",
      );
      error.code = "self-invite";
      throw error;
    }

    // Étape 2: Trouver l'id de l'utilisateur invité basé sur son email
    const invitedUserDoc = await getUserByEmail(invitedEmailLower);
    if (!invitedUserDoc) {
      const error: Error & { code?: string } = new Error(
        "Aucun utilisateur trouvé avec cet email. Veuillez demander au destinataire de créer un compte d'abord.",
      );
      error.code = "no-user";
      throw error;
    }

    const invitedUserId = invitedUserDoc?.id;

    // Étape 3: Récupérer les parentIds de l'enfant
    const childDoc = await getDocFromServer(doc(db, "children", childId));
    if (!childDoc.exists()) {
      throw new Error("Enfant introuvable");
    }

    // Étape 4: Vérifier si l'utilisateur invité est déjà parent de l'enfant
    if (invitedUserId) {
      const accessDoc = await getDoc(
        doc(db, "children", childId, "access", invitedUserId)
      );
      if (accessDoc.exists()) {
      const error: Error & { code?: string; email?: string } = new Error(
        "Cet enfant est déjà lié à ce destinataire.",
      );
      error.code = "already-linked";
      error.email = invitedEmail;
      throw error;
      }
    }

    // Étape 5: Vérifier s'il n'y a pas déjà une invitation en cours
    const pendingInvitesQuery = query(
      collection(db, "shareInvitations"),
      where("childId", "==", childId),
      where("invitedEmail", "==", invitedEmailLower),
      where("inviterId", "==", user.uid),
      where("status", "==", "pending"),
    );
    const existingInvites = await getDocs(pendingInvitesQuery);

    // Étape 6: Blocage si invitation déjà en cours
    if (!existingInvites.empty) {
      const error: Error & { code?: string } = new Error(
        "Une invitation est déjà en attente pour cet email",
      );
      error.code = "already-pending";
      throw error;
    }

    // Étape 7: Créer l'invitation
    const invitationData: Omit<ShareInvitation, "id"> = {
      childId,
      childName,
      inviterId: user.uid,
      inviterEmail: user.email,
      invitedEmail: invitedEmailLower,
      invitedUserId,
      status: "pending",
      createdAt: Timestamp.now(),
    };
    console.log("[Invitation] payload", {
      childId,
      inviterId: user.uid,
      invitedEmail: invitedEmailLower,
      invitedUserId,
    });

    const docRef = await addDoc(
      collection(db, "shareInvitations"),
      invitationData,
    );

    // TODO: Envoyer un email de notification (via Cloud Function)
    console.log(`Invitation créée pour ${invitedEmail}`);

    return docRef.id;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const expectedCodes = new Set([
      "self-invite",
      "no-user",
      "already-linked",
      "already-pending",
    ]);
    if (!code || !expectedCodes.has(code)) {
      console.error("Erreur lors de la création de l'invitation:", error);
    }
    throw error;
  }
}

/**
 * Récupère les invitations en attente pour l'utilisateur connecté
 */
export async function getPendingInvitations(): Promise<ShareInvitation[]> {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) return [];

    const emailQuery = query(
      collection(db, "shareInvitations"),
      where("invitedEmail", "==", user.email.toLowerCase()),
      where("status", "==", "pending"),
    );

    const userIdQuery = query(
      collection(db, "shareInvitations"),
      where("invitedUserId", "==", user.uid),
      where("status", "==", "pending"),
    );

    const [emailSnapshot, userSnapshot] = await Promise.all([
      getDocs(emailQuery),
      getDocs(userIdQuery),
    ]);

    const invitesById = new Map<string, ShareInvitation>();
    emailSnapshot.docs.forEach((docSnap) => {
      invitesById.set(docSnap.id, {
        id: docSnap.id,
        ...docSnap.data(),
      } as ShareInvitation);
    });
    userSnapshot.docs.forEach((docSnap) => {
      invitesById.set(docSnap.id, {
        id: docSnap.id,
        ...docSnap.data(),
      } as ShareInvitation);
    });

    return Array.from(invitesById.values());
  } catch (error) {
    console.error("Erreur lors de la récupération des invitations:", error);
    return [];
  }
}

/**
 * Écoute les invitations en temps réel
 */
export function listenToPendingInvitations(
  callback: (invitations: ShareInvitation[]) => void,
): () => void {
  const user = auth.currentUser;
  if (!user || !user.email) {
    callback([]);
    return () => {};
  }

  const emailQuery = query(
    collection(db, "shareInvitations"),
    where("invitedEmail", "==", user.email.toLowerCase()),
    where("status", "==", "pending"),
    limit(200)
  );

  const userIdQuery = query(
    collection(db, "shareInvitations"),
    where("invitedUserId", "==", user.uid),
    where("status", "==", "pending"),
    limit(200)
  );

  let emailInvites: ShareInvitation[] = [];
  let userInvites: ShareInvitation[] = [];

  const mergeAndEmit = () => {
    const invitesById = new Map<string, ShareInvitation>();
    emailInvites.forEach((invite) => {
      if (invite.id) invitesById.set(invite.id, invite);
    });
    userInvites.forEach((invite) => {
      if (invite.id) invitesById.set(invite.id, invite);
    });
    callback(Array.from(invitesById.values()));
  };

  const unsubscribeEmail = onSnapshot(
    emailQuery,
    (snapshot) => {
      emailInvites = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ShareInvitation[];
      mergeAndEmit();
    },
    (error) => {
      console.error("Erreur écoute invitations (email):", error);
      callback([]);
    }
  );

  const unsubscribeUserId = onSnapshot(
    userIdQuery,
    (snapshot) => {
      userInvites = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ShareInvitation[];
      mergeAndEmit();
    },
    (error) => {
      console.error("Erreur écoute invitations (uid):", error);
      callback([]);
    }
  );

  return () => {
    unsubscribeEmail();
    unsubscribeUserId();
  };
}

/**
 * Nettoie les invitations en doublon (même enfant, même destinataire).
 */
export async function cleanupDuplicatePendingInvitations(
  invitedEmail?: string,
): Promise<number> {
  const user = auth.currentUser;
  const email = (invitedEmail ?? user?.email ?? "").toLowerCase();
  if (!email) return 0;

  const q = query(
    collection(db, "shareInvitations"),
    where("invitedEmail", "==", email),
    where("status", "==", "pending"),
    limit(200)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const byChildId = new Map<string, typeof snapshot.docs>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as ShareInvitation;
    const key = data.childId;
    const list = byChildId.get(key) ?? [];
    list.push(docSnap);
    byChildId.set(key, list);
  });

  const batch = writeBatch(db);
  let updatedCount = 0;

  byChildId.forEach((docs) => {
    if (docs.length <= 1) return;
    const sorted = [...docs].sort((a, b) => {
      const aTime = (a.data() as ShareInvitation).createdAt?.toMillis?.() ?? 0;
      const bTime = (b.data() as ShareInvitation).createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    const duplicates = sorted.slice(1);
    duplicates.forEach((dup) => {
      batch.update(dup.ref, { status: "rejected" });
      updatedCount += 1;
    });
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return updatedCount;
}

/**
 * Supprime les invitations en attente si le destinataire est déjà lié à l'enfant.
 */
export async function cleanupAlreadyLinkedInvitations(
  invitedEmail?: string,
): Promise<number> {
  const user = auth.currentUser;
  const email = (invitedEmail ?? user?.email ?? "").toLowerCase();
  if (!email || !user?.uid) return 0;

  const q = query(
    collection(db, "shareInvitations"),
    where("invitedEmail", "==", email),
    where("status", "==", "pending"),
    limit(200)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  let updatedCount = 0;

  await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as ShareInvitation;
      const accessDoc = await getDoc(
        doc(db, "children", data.childId, "access", user.uid)
      );
      if (accessDoc.exists()) {
        batch.update(docSnap.ref, { status: "rejected" });
        updatedCount += 1;
      }
    }),
  );

  if (updatedCount > 0) {
    await batch.commit();
  }

  return updatedCount;
}

/**
 * Accepte une invitation
 */
export async function acceptInvitation(invitationId: string): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur non connecté");

    const inviteDoc = await getDoc(doc(db, "shareInvitations", invitationId));
    if (!inviteDoc.exists()) {
      throw new Error("Invitation introuvable");
    }

    const invitation = inviteDoc.data() as ShareInvitation;

    // Vérifier que l'utilisateur est bien le destinataire
    const userEmail = user.email?.toLowerCase() ?? "";
    if (
      invitation.invitedUserId !== user.uid &&
      invitation.invitedEmail !== userEmail
    ) {
      throw new Error("Cette invitation ne vous est pas destinée");
    }

    // Vérifier que l'invitation est encore en attente
    if (invitation.status !== "pending") {
      throw new Error("Cette invitation a déjà été traitée");
    }

    // Vérifier que l'utilisateur n'a pas déjà accès
    const existingAccess = await getDoc(
      doc(db, "children", invitation.childId, "access", user.uid)
    );
    if (existingAccess.exists()) {
      // Marquer quand même l'invitation comme acceptée si l'accès existe déjà
      await updateDoc(doc(db, "shareInvitations", invitationId), {
        status: "accepted",
      });
      return; // Sortir sans erreur
    }

    // IMPORTANT: Créer l'accès AVANT de marquer l'invitation comme acceptée
    // Car les règles Firestore vérifient que status == 'pending' ou 'accepted'
    await grantChildAccess(
      invitation.childId,
      user.uid,
      "contributor",
      invitation.inviterId,
      { invitationId }
    );

    // Marquer l'invitation comme acceptée APRÈS avoir créé l'accès
    await updateDoc(doc(db, "shareInvitations", invitationId), {
      status: "accepted",
    });
  } catch (error) {
    console.error("Erreur lors de l'acceptation de l'invitation:", error);
    throw error;
  }
}

/**
 * Refuse une invitation
 */
export async function rejectInvitation(invitationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "shareInvitations", invitationId), {
      status: "rejected",
    });
  } catch (error) {
    console.error("Erreur lors du refus de l'invitation:", error);
    throw error;
  }
}

/**
 * Récupère le code de partage actif pour un enfant (s'il existe)
 */
export async function getActiveShareCode(
  childId: string,
): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;

    const q = query(
      collection(db, "shareCodes"),
      where("childId", "==", childId),
      where("createdBy", "==", user.uid),
      where("used", "==", false),
    );

    const snapshot = await getDocs(q);

    // Trouver un code non expiré
    for (const doc of snapshot.docs) {
      const shareCode = doc.data() as ShareCode;
      if (shareCode.expiresAt.toDate() > new Date()) {
        return shareCode.code;
      }
    }

    return null;
  } catch (error) {
    console.error("Erreur lors de la récupération du code:", error);
    return null;
  }
}

/**
 * Écoute le code de partage actif pour un enfant (s'il existe).
 */
export function listenToActiveShareCode(
  childId: string,
  callback: (code: string | null) => void,
): () => void {
  const user = auth.currentUser;
  if (!user) {
    callback(null);
    return () => {};
  }

  const q = query(
    collection(db, "shareCodes"),
    where("childId", "==", childId),
    where("createdBy", "==", user.uid),
    where("used", "==", false),
  );

  return onSnapshot(q, (snapshot) => {
    let activeCode: string | null = null;
    for (const doc of snapshot.docs) {
      const shareCode = doc.data() as ShareCode;
      if (shareCode.expiresAt.toDate() > new Date()) {
        activeCode = shareCode.code;
        break;
      }
    }
    callback(activeCode);
  });
}

/**
 * Supprime les codes de partage expirés (non utilisés) pour un enfant.
 */
export async function cleanupExpiredShareCodes(
  childId: string,
): Promise<number> {
  try {
    const user = auth.currentUser;
    if (!user) return 0;

    const q = query(
      collection(db, "shareCodes"),
      where("childId", "==", childId),
      where("createdBy", "==", user.uid),
      where("used", "==", false),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const now = new Date();
    const batch = writeBatch(db);
    let deleted = 0;

    snapshot.docs.forEach((docSnap) => {
      const shareCode = docSnap.data() as ShareCode;
      if (shareCode.expiresAt.toDate() <= now) {
        batch.delete(docSnap.ref);
        deleted += 1;
      }
    });

    if (deleted > 0) {
      await batch.commit();
    }

    return deleted;
  } catch (error) {
    console.warn("Erreur lors du nettoyage des codes expirés:", error);
    return 0;
  }
}

/**
 * Retire l'accès d'un parent à un enfant
 */
export async function removeParentAccess(
  childId: string,
  parentUid: string,
): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Utilisateur non connecté");

    const myAccess = await getDoc(
      doc(db, "children", childId, "access", user.uid)
    );
    if (!myAccess.exists() || myAccess.data().role !== "owner") {
      throw new Error("Vous n'avez pas la permission de retirer cet accès");
    }

    if (parentUid === user.uid) {
      throw new Error("Impossible de retirer votre propre accès owner");
    }

    await revokeChildAccess(childId, parentUid);
  } catch (error) {
    console.error("Erreur lors du retrait de l'accès:", error);
    throw error;
  }
}
