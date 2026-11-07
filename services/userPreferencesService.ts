// services/userPreferencesService.ts
import { arrayRemove, arrayUnion, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import type { DocumentData, DocumentSnapshot, FirestoreError, Unsubscribe } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";
import type { HealthDataConsent } from "./healthConsentService";
import {
  DEFAULT_QUIET_HOURS,
  getDeviceTimeZone,
  normalizeQuietHours,
  type QuietHours,
} from "@/utils/quietHours";

export type { QuietHours } from "@/utils/quietHours";

// ============================================
// ACCÈS BRUT À user_preferences/{uid} (utilisé par les contextes et écrans)
// ============================================

/** Lit user_preferences/{uid}. */
export function getUserPreferencesDoc(uid: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, "user_preferences", uid));
}

/** Écoute user_preferences/{uid}. */
export function listenToUserPreferencesDoc(
  uid: string,
  onNext: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(doc(db, "user_preferences", uid), onNext, onError);
}

/** Écrit (merge) user_preferences/{uid}. */
export function mergeUserPreferences(uid: string, data: DocumentData): Promise<void> {
  return setDoc(doc(db, "user_preferences", uid), data, { merge: true });
}

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

interface UserPreferences {
  hiddenChildrenIds: string[];
  lastActiveChildId?: string;
  notifications?: NotificationPreferences;
  theme?: ThemePreference;
  language?: LanguagePreference;
  healthDataConsent?: HealthDataConsent;
}

export type ThemePreference = 'light' | 'dark' | 'auto';
export type LanguagePreference = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'ar';

export type ReminderKey = 'repas' | 'pompages' | 'changes' | 'vitamines';

export interface ReminderPreferences {
  enabled: boolean;
  thresholds: Record<ReminderKey, number>;
  /**
   * Heures calmes (pas de rappel la nuit), propres à ce parent et exprimées dans
   * le fuseau de son téléphone. Absent = activé 22:00-07:00 (défaut serveur aussi).
   */
  quietHours?: QuietHours;
}

/** Heures calmes par défaut, dans le fuseau de l'appareil. */
function defaultQuietHours(): QuietHours {
  return { ...DEFAULT_QUIET_HOURS, timeZone: getDeviceTimeZone() };
}

/** Valeur stockée -> valeur sûre ; sans valeur, défaut dans le fuseau de l'appareil. */
function resolveQuietHours(stored: unknown): QuietHours {
  return stored === undefined || stored === null ? defaultQuietHours() : normalizeQuietHours(stored);
}

interface NotificationPreferences {
  push: boolean;
  email: boolean;
  updates: boolean;
  tips: boolean;
  insights: boolean;
  correlations: boolean;
  marketing: boolean;
  reminders?: ReminderPreferences;
}

const defaultNotificationPreferences: NotificationPreferences = {
  push: true,
  email: false,
  updates: true,
  tips: true,
  insights: true,
  correlations: true,
  marketing: false,
  reminders: {
    enabled: false,
    thresholds: {
      repas: 0,
      pompages: 0,
      changes: 0,
      vitamines: 0,
    },
  },
};
const defaultThemePreference: ThemePreference = 'auto';
const defaultLanguagePreference: LanguagePreference = 'fr';

/**
 * Récupère les préférences de l'utilisateur
 */
export async function obtenirPreferences(): Promise<UserPreferences> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return {
        hiddenChildrenIds: [],
        notifications: defaultNotificationPreferences,
        theme: defaultThemePreference,
        language: defaultLanguagePreference,
      };
    }
    const userId = user.uid;
    const docRef = doc(db, "user_preferences", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserPreferences;
      return {
        hiddenChildrenIds: data.hiddenChildrenIds ?? [],
        lastActiveChildId: data.lastActiveChildId ?? undefined,
        notifications: {
          ...defaultNotificationPreferences,
          ...(data.notifications || {}),
          reminders: {
            ...defaultNotificationPreferences.reminders,
            ...(data.notifications?.reminders || {}),
            thresholds: {
              ...defaultNotificationPreferences.reminders?.thresholds,
              ...(data.notifications?.reminders?.thresholds || {}),
            } as Record<ReminderKey, number>,
            quietHours: resolveQuietHours(data.notifications?.reminders?.quietHours),
          } as ReminderPreferences,
        },
        theme: data.theme ?? defaultThemePreference,
        language: data.language ?? defaultLanguagePreference,
      };
    } else {
      // Si le document n'existe pas, le créer avec des valeurs par défaut
      const defaultPrefs = {
        hiddenChildrenIds: [],
        notifications: defaultNotificationPreferences,
        theme: defaultThemePreference,
        language: defaultLanguagePreference,
      };
      await setDoc(docRef, defaultPrefs);
      return defaultPrefs;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération des préférences:", e);
    captureServiceError(e, { service: "userPreferences", operation: "obtenirPreferences" });
    throw e;
  }
}

/**
 * Obtenir les préférences de notifications
 */
export async function obtenirPreferencesNotifications(): Promise<NotificationPreferences> {
  const preferences = await obtenirPreferences();
  return preferences.notifications || defaultNotificationPreferences;
}

/**
 * Mettre à jour les préférences de notifications
 */
export async function mettreAJourPreferencesNotifications(
  updates: Partial<NotificationPreferences>
) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);
    const preferences = await obtenirPreferences();

    const currentReminders =
      preferences.notifications?.reminders || defaultNotificationPreferences.reminders;
    const mergedReminders = updates.reminders
      ? {
          ...currentReminders,
          ...updates.reminders,
          thresholds: {
            ...currentReminders?.thresholds,
            ...(updates.reminders?.thresholds || {}),
          },
          quietHours: updates.reminders.quietHours
            ? normalizeQuietHours({ ...currentReminders?.quietHours, ...updates.reminders.quietHours })
            : currentReminders?.quietHours,
        }
      : currentReminders;

    const mergedNotifications = {
      ...defaultNotificationPreferences,
      ...(preferences.notifications || {}),
      ...updates,
      reminders: mergedReminders,
    };

    await updateDoc(docRef, {
      notifications: mergedNotifications,
      updatedAt: new Date(),
    });

    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour des notifications:", e);
    captureServiceError(e, { service: "userPreferences", operation: "mettreAJourPreferencesNotifications" });
    throw e;
  }
}

/**
 * Au démarrage : aligne le fuseau stocké des heures calmes sur celui du
 * téléphone (déplacement, changement de réglage), et écrit le défaut s'il
 * n'existe pas encore, pour que le serveur applique la bonne heure locale.
 * Ne touche qu'à `quietHours` (chemin pointé) et ne lève jamais.
 * @returns true si une écriture a eu lieu
 */
export async function synchroniserFuseauHoraire(): Promise<boolean> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);
    // Lecture brute : obtenirPreferences() comble déjà le défaut, on ne verrait
    // pas qu'aucune valeur n'est stockée.
    const snap = await getDoc(docRef);
    // Pas de document : obtenirPreferences() le crée à l'ouverture de l'appli.
    if (!snap.exists()) return false;
    const rawStored = snap.data()?.notifications?.reminders?.quietHours;
    const deviceTimeZone = getDeviceTimeZone();
    if (rawStored && rawStored.timeZone === deviceTimeZone) return false;
    const next: QuietHours = {
      ...(rawStored ? normalizeQuietHours(rawStored) : DEFAULT_QUIET_HOURS),
      timeZone: deviceTimeZone,
    };
    await updateDoc(docRef, {
      "notifications.reminders.quietHours": next,
    });
    return true;
  } catch (e) {
    // Best effort : un échec (hors ligne) sera retenté au prochain démarrage.
    console.error("Erreur lors de la synchronisation du fuseau horaire:", e);
    captureServiceError(e, { service: "userPreferences", operation: "synchroniserFuseauHoraire" });
    return false;
  }
}

/**
 * Obtenir la préférence de thème
 */
export async function obtenirPreferenceTheme(): Promise<ThemePreference> {
  const preferences = await obtenirPreferences();
  return preferences.theme ?? defaultThemePreference;
}

/**
 * Mettre à jour la préférence de thème
 */
export async function mettreAJourPreferenceTheme(theme: ThemePreference) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    await updateDoc(docRef, {
      theme,
      updatedAt: new Date(),
    });

    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour du thème:", e);
    captureServiceError(e, { service: "userPreferences", operation: "mettreAJourPreferenceTheme" });
    throw e;
  }
}

/**
 * Obtenir la préférence de langue
 */
export async function obtenirPreferenceLanguage(): Promise<LanguagePreference> {
  const preferences = await obtenirPreferences();
  return preferences.language ?? defaultLanguagePreference;
}

/**
 * Mettre à jour la préférence de langue
 */
export async function mettreAJourPreferenceLanguage(language: LanguagePreference) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    await updateDoc(docRef, {
      language,
      updatedAt: new Date(),
    });

    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour de la langue:", e);
    captureServiceError(e, { service: "userPreferences", operation: "mettreAJourPreferenceLanguage" });
    throw e;
  }
}

/**
 * Masque un enfant de la liste de suivi
 */
export async function masquerEnfant(childId: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    // Vérifier si le document existe
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Ajouter l'enfant à la liste des masqués
      await updateDoc(docRef, {
        hiddenChildrenIds: arrayUnion(childId),
      });
    } else {
      // Créer le document avec l'enfant masqué
      await setDoc(docRef, {
        hiddenChildrenIds: [childId],
      });
    }

    if (__DEV__) console.log("Enfant masqué avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors du masquage de l'enfant:", e);
    captureServiceError(e, { service: "userPreferences", operation: "masquerEnfant" });
    throw e;
  }
}

/**
 * Affiche à nouveau un enfant dans la liste de suivi
 */
export async function afficherEnfant(childId: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    // Retirer l'enfant de la liste des masqués
    await updateDoc(docRef, {
      hiddenChildrenIds: arrayRemove(childId),
    });

    if (__DEV__) console.log("Enfant affiché avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de l'affichage de l'enfant:", e);
    captureServiceError(e, { service: "userPreferences", operation: "afficherEnfant" });
    throw e;
  }
}
