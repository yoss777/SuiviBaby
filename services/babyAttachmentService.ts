import { db } from "../config/firebase";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

export interface BabyAttachmentRequest {
  id?: string;
  simId: string;
  babyData?: {
    name: string;
    birthDate: string;
    gender?: "male" | "female";
    photoUri?: string;
  };
  parentEmail: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Timestamp;
  validatedAt?: Timestamp;
}

export interface BabyData {
  id: string;
  name: string;
  birthDate: string;
  gender?: "male" | "female";
  photoUri?: string;
  parentEmails: string[]; // Liste des emails des parents enregistrés à la maternité
  hospital?: string;
}

// Interface de compatibilité pour l'ancien format
export interface LegacyBabyData {
  id: string;
  name: string;
  birthDate: string;
  gender?: "male" | "female";
  photoUri?: string;
  parentEmail?: string;
  secondaryParentEmail?: string;
  hospital?: string;
}

/**
 * Recherche un enfant par son ID SIM dans la base de données
 * Gère la rétrocompatibilité avec l'ancien format (parentEmail unique)
 */
export async function searchBabyBySimId(simId: string): Promise<BabyData | null> {
  try {
    const babyRef = doc(db, "babies", simId);
    const babySnap = await getDoc(babyRef);

    if (babySnap.exists()) {
      const data = babySnap.data() as LegacyBabyData;

      // Convertir l'ancien format vers le nouveau
      let parentEmails: string[] = [];

      if (data.parentEmail) {
        parentEmails.push(data.parentEmail);
      }
      if (data.secondaryParentEmail) {
        parentEmails.push(data.secondaryParentEmail);
      }

      // Si les données utilisent déjà le nouveau format
      const rawData = babySnap.data();
      if (rawData.parentEmails && Array.isArray(rawData.parentEmails)) {
        parentEmails = rawData.parentEmails;
      }

      return {
        id: babySnap.id,
        name: data.name,
        birthDate: data.birthDate,
        gender: data.gender,
        photoUri: data.photoUri,
        parentEmails,
        hospital: data.hospital,
      };
    }
    return null;
  } catch (error) {
    console.error("Erreur lors de la recherche de l'enfant:", error);
    throw error;
  }
}

/**
 * Crée une demande de rattachement d'enfant
 * L'email est envoyé au parent sélectionné parmi ceux enregistrés
 */
export async function createAttachmentRequest(
  simId: string,
  babyData: BabyData,
  selectedParentEmail: string
): Promise<string> {
  try {
    // Vérifier que l'email sélectionné fait partie des parents autorisés
    if (!babyData.parentEmails.includes(selectedParentEmail)) {
      throw new Error(
        "L'email sélectionné n'est pas autorisé pour cet enfant"
      );
    }

    const requestData: Omit<BabyAttachmentRequest, "id"> = {
      simId,
      babyData: {
        name: babyData.name,
        birthDate: babyData.birthDate,
        gender: babyData.gender,
        photoUri: babyData.photoUri,
      },
      parentEmail: selectedParentEmail, // Email du parent qui fait la demande
      status: "pending",
      requestedAt: Timestamp.now(),
    };

    const docRef = await addDoc(
      collection(db, "babyAttachmentRequests"),
      requestData
    );

    // Envoyer un email de validation au parent sélectionné
    await sendValidationEmail(
      selectedParentEmail,
      simId,
      docRef.id,
      babyData.name
    );

    return docRef.id;
  } catch (error) {
    console.error("Erreur lors de la création de la demande:", error);
    throw error;
  }
}

/**
 * Envoie un email de validation au parent enregistré
 * Note: Cette fonction doit être implémentée côté serveur (Firebase Functions)
 * Pour l'instant, elle simule l'envoi
 */
async function sendValidationEmail(
  email: string,
  simId: string,
  requestId: string,
  childName: string
): Promise<void> {
  try {
    // TODO: Implémenter l'envoi d'email via Firebase Functions ou autre service
    // Exemple avec une Cloud Function:
    // const sendEmailFunction = httpsCallable(functions, 'sendValidationEmail');
    // await sendEmailFunction({ email, simId, requestId, childName });

    console.log(`Email de validation envoyé à ${email} pour ${childName} (SIM ${simId})`);
    console.log(`Lien de validation: https://mediscope.app/validate-attachment/${requestId}`);

    // Pour le développement, vous pouvez utiliser un service d'email comme SendGrid, Mailgun, etc.
    // ou créer une Firebase Cloud Function qui envoie un email avec:
    // - Le nom de l'enfant
    // - Un lien de validation sécurisé
    // - Les informations de sécurité (qui a fait la demande, quand, etc.)
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);
    throw error;
  }
}

/**
 * Valide une demande de rattachement
 */
export async function validateAttachmentRequest(
  requestId: string
): Promise<void> {
  try {
    const requestRef = doc(db, "babyAttachmentRequests", requestId);
    await updateDoc(requestRef, {
      status: "approved",
      validatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Erreur lors de la validation de la demande:", error);
    throw error;
  }
}

/**
 * Rejette une demande de rattachement
 */
export async function rejectAttachmentRequest(
  requestId: string
): Promise<void> {
  try {
    const requestRef = doc(db, "babyAttachmentRequests", requestId);
    await updateDoc(requestRef, {
      status: "rejected",
      validatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Erreur lors du rejet de la demande:", error);
    throw error;
  }
}

/**
 * Écoute les demandes de rattachement approuvées pour un parent
 */
export function listenToApprovedRequests(
  parentEmail: string,
  callback: (requests: BabyAttachmentRequest[]) => void
): () => void {
  const q = query(
    collection(db, "babyAttachmentRequests"),
    where("parentEmail", "==", parentEmail),
    where("status", "==", "approved")
  );

  return onSnapshot(q, (snapshot) => {
    const requests: BabyAttachmentRequest[] = [];
    snapshot.forEach((doc) => {
      requests.push({
        id: doc.id,
        ...doc.data(),
      } as BabyAttachmentRequest);
    });
    callback(requests);
  });
}

/**
 * Récupère les demandes en attente pour un parent
 */
export async function getPendingRequests(
  parentEmail: string
): Promise<BabyAttachmentRequest[]> {
  try {
    const q = query(
      collection(db, "babyAttachmentRequests"),
      where("parentEmail", "==", parentEmail),
      where("status", "==", "pending")
    );

    const snapshot = await getDocs(q);
    const requests: BabyAttachmentRequest[] = [];

    snapshot.forEach((doc) => {
      requests.push({
        id: doc.id,
        ...doc.data(),
      } as BabyAttachmentRequest);
    });

    return requests;
  } catch (error) {
    console.error("Erreur lors de la récupération des demandes:", error);
    throw error;
  }
}
