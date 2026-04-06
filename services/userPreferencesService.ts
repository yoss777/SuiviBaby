// services/userPreferencesService.ts
import { arrayRemove, arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export interface HealthDataConsent {
  granted: boolean;
  grantedAt: string; // ISO 8601
  version: string; // version de la politique au moment du consentement
}

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
 * Sauvegarder le consentement données de santé (RGPD art. 9)
 * Appelé à l'inscription — preuve horodatée du consentement explicite.
 */
export async function sauvegarderConsentementSante(uid: string) {
  const docRef = doc(db, "user_preferences", uid);
  const consent: HealthDataConsent = {
    granted: true,
    grantedAt: new Date().toISOString(),
    version: "1.0", // incrémenter à chaque mise à jour de la politique de confidentialité
  };

  await setDoc(docRef, { healthDataConsent: consent, updatedAt: new Date() }, { merge: true });
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

    console.log("Enfant masqué avec succès");
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

    console.log("Enfant affiché avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de l'affichage de l'enfant:", e);
    captureServiceError(e, { service: "userPreferences", operation: "afficherEnfant" });
    throw e;
  }
}
