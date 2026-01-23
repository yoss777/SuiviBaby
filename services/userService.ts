// Service de gestion des utilisateurs
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  User,
  UserType,
  ProfessionalProfile,
  ProfessionalValidationRequest,
  ValidationStatus,
} from '../types/user';

/**
 * Créer un nouvel utilisateur patient dans Firestore
 */
export async function createPatientUser(
  uid: string,
  email: string,
  userName: string,
  babyName?: string
): Promise<User> {
  const safeUserName = userName?.trim() || email.split("@")[0];
  const user: User = {
    uid,
    email,
    userName: safeUserName,
    userType: 'patient',
    babyName: babyName?.trim() ? babyName.trim() : null,
    children: [],
    createdAt: Timestamp.now(),
    lastLogin: Timestamp.now(),
    preferences: {
      notifications: true,
      language: 'fr',
      theme: 'auto',
    },
  };

  await setDoc(doc(db, 'users', uid), user);
  return user;
}

/**
 * Créer une demande d'inscription professionnelle
 */
export async function createProfessionalRegistrationRequest(
  uid: string,
  email: string,
  userName: string,
  professionalData: Omit<ProfessionalProfile, 'validationStatus' | 'validationDate' | 'validationNotes'>
): Promise<string> {
  // Nettoyer les valeurs undefined (Firestore ne les accepte pas)
  const cleanData = Object.fromEntries(
    Object.entries(professionalData).filter(([_, value]) => value !== undefined)
  ) as typeof professionalData;

  // Créer la demande de validation
  const requestRef = doc(collection(db, 'professional-validation-requests'));
  const request: ProfessionalValidationRequest = {
    id: requestRef.id,
    userId: uid,
    userEmail: email,
    userName,
    professionalData: cleanData,
    status: 'pending',
    submittedAt: Timestamp.now(),
  };

  await setDoc(requestRef, request);

  // Créer un utilisateur "pending" en attendant la validation
  const user: User = {
    uid,
    email,
    userName,
    userType: 'professional',
    professionalProfile: {
      ...cleanData,
      validationStatus: 'pending',
      isVisibleOnMap: false,
      acceptsNewPatients: false,
    },
    createdAt: Timestamp.now(),
    lastLogin: Timestamp.now(),
    preferences: {
      notifications: true,
      language: 'fr',
      theme: 'auto',
    },
  };

  await setDoc(doc(db, 'users', uid), user);

  return requestRef.id;
}

/**
 * Récupérer un utilisateur par son UID
 */
export async function getUserById(uid: string): Promise<User | null> {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) {
    return null;
  }
  return userDoc.data() as User;
}

/**
 * Mettre à jour les informations de l'utilisateur
 */
export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data as any);
}

/**
 * Mettre à jour le dernier login
 */
export async function updateLastLogin(
  uid: string,
  platform: 'ios' | 'android' | 'web',
  version: string
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    lastLogin: serverTimestamp(),
    deviceInfo: {
      platform,
      version,
    },
  });
}

/**
 * Vérifier si un utilisateur peut accéder à l'app actuelle
 */
export async function canUserAccessApp(
  uid: string,
  appType: 'patient' | 'professional'
): Promise<{ canAccess: boolean; reason?: string }> {
  const user = await getUserById(uid);
  if (!user) {
    return { canAccess: false, reason: 'Utilisateur non trouvé' };
  }

  // Par défaut, considérer les comptes sans userType explicite comme patients
  const userType: UserType = user.userType || 'patient';
  const hasDualAccount = user.dualAccount === true;
  const isPatient = userType === 'patient' || hasDualAccount;
  const isProfessional = userType === 'professional' || hasDualAccount;

  if (appType === 'professional') {
    // Accès app pro
    if (isProfessional) {
      if (user.professionalProfile?.validationStatus === 'approved') {
        return { canAccess: true };
      }
      return {
        canAccess: false,
        reason: user.professionalProfile
          ? 'Votre compte professionnel est en attente de validation.'
          : 'Votre profil professionnel doit être complété ou validé.',
      };
    }
    return {
      canAccess: false,
      reason: 'Ce compte est un compte patient. Veuillez utiliser l\'application Mediscope Patient.',
    };
  } else {
    // Accès app patient
    if (isPatient) {
      return { canAccess: true };
    }
    return {
      canAccess: false,
      reason: 'Ce compte est un compte professionnel. Veuillez utiliser l\'application Mediscope Pro.',
    };
  }
}

/**
 * Transformer un compte patient en compte dual (ajouter profil pro)
 */
export async function convertPatientToDualAccount(
  uid: string,
  professionalData: Omit<ProfessionalProfile, 'validationStatus' | 'validationDate' | 'validationNotes'>
): Promise<string> {
  const user = await getUserById(uid);
  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  if (user.userType !== 'patient') {
    throw new Error('Seuls les comptes patients peuvent être convertis en comptes dual');
  }

  // Nettoyer les valeurs undefined (Firestore ne les accepte pas)
  const cleanData = Object.fromEntries(
    Object.entries(professionalData).filter(([_, value]) => value !== undefined)
  ) as typeof professionalData;

  // Créer la demande de validation
  const requestRef = doc(collection(db, 'professional-validation-requests'));
  const request: ProfessionalValidationRequest = {
    id: requestRef.id,
    userId: uid,
    userEmail: user.email,
    userName: user.userName,
    professionalData: cleanData,
    status: 'pending',
    submittedAt: Timestamp.now(),
  };

  await setDoc(requestRef, request);

  // Mettre à jour l'utilisateur
  await updateDoc(doc(db, 'users', uid), {
    dualAccount: true,
    professionalProfile: {
      ...cleanData,
      validationStatus: 'pending',
      isVisibleOnMap: false,
      acceptsNewPatients: false,
    },
  });

  return requestRef.id;
}

/**
 * Valider un profil professionnel (Admin only)
 */
export async function approveProfessionalProfile(
  requestId: string,
  adminUid: string,
  notes?: string
): Promise<void> {
  console.log('📝 approveProfessionalProfile - Start', { requestId, adminUid, notes });

  const requestDoc = await getDoc(doc(db, 'professional-validation-requests', requestId));
  console.log('📄 Request doc exists:', requestDoc.exists());

  if (!requestDoc.exists()) {
    throw new Error('Demande de validation non trouvée');
  }

  const request = requestDoc.data() as ProfessionalValidationRequest;
  console.log('📋 Request data:', request);

  // Mettre à jour la demande
  console.log('🔄 Updating request document...');
  await updateDoc(doc(db, 'professional-validation-requests', requestId), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
    adminNotes: notes || '',
  });
  console.log('✔️ Request document updated');

  // Mettre à jour le profil utilisateur
  console.log('🔄 Updating user profile for userId:', request.userId);
  await updateDoc(doc(db, 'users', request.userId), {
    'professionalProfile.validationStatus': 'approved',
    'professionalProfile.validationDate': serverTimestamp(),
    'professionalProfile.validationNotes': notes || '',
    'professionalProfile.isVisibleOnMap': true,
    'professionalProfile.acceptsNewPatients': true,
  });
  console.log('✔️ User profile updated');
}

/**
 * Rejeter un profil professionnel (Admin only)
 */
export async function rejectProfessionalProfile(
  requestId: string,
  adminUid: string,
  reason: string
): Promise<void> {
  const requestDoc = await getDoc(doc(db, 'professional-validation-requests', requestId));
  if (!requestDoc.exists()) {
    throw new Error('Demande de validation non trouvée');
  }

  const request = requestDoc.data() as ProfessionalValidationRequest;

  // Mettre à jour la demande
  await updateDoc(doc(db, 'professional-validation-requests', requestId), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
    adminNotes: reason,
  });

  // Mettre à jour le profil utilisateur
  await updateDoc(doc(db, 'users', request.userId), {
    'professionalProfile.validationStatus': 'rejected',
    'professionalProfile.validationDate': serverTimestamp(),
    'professionalProfile.validationNotes': reason,
  });
}

/**
 * Récupérer toutes les demandes en attente (Admin only)
 */
export async function getPendingValidationRequests(): Promise<ProfessionalValidationRequest[]> {
  const q = query(
    collection(db, 'professional-validation-requests'),
    where('status', '==', 'pending')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as ProfessionalValidationRequest);
}

/**
 * Écouter en temps réel les demandes en attente (Admin only)
 */
export function subscribeToPendingValidationRequests(
  onUpdate: (requests: ProfessionalValidationRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'professional-validation-requests'),
    where('status', '==', 'pending')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map((doc) => doc.data() as ProfessionalValidationRequest);
      onUpdate(requests);
    },
    (error) => {
      console.error('Error in validation requests listener:', error);
      if (onError) {
        onError(error);
      }
    }
  );
}

/**
 * Migrer un utilisateur existant vers la nouvelle structure
 */
export async function migrateUserToNewStructure(uid: string): Promise<void> {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) {
    console.log(`User ${uid} not found`);
    return;
  }

  const data = userDoc.data();

  // Si userType existe déjà, pas besoin de migrer
  if (data.userType) {
    console.log(`User ${uid} already migrated`);
    return;
  }

  // Migrer en tant que patient par défaut
  await updateDoc(doc(db, 'users', uid), {
    userType: 'patient',
    babyName: data.babyName || null,
    children: data.children || [],
    preferences: {
      notifications: true,
      language: 'fr',
      theme: 'auto',
    },
  });

  console.log(`✅ User ${uid} migrated to new structure as patient`);
}
