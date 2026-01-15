// services/userPreferencesService.ts
import { arrayRemove, arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

interface UserPreferences {
  hiddenChildrenIds: string[];
  notifications?: NotificationPreferences;
  theme?: ThemePreference;
  language?: LanguagePreference;
}

export type ThemePreference = 'light' | 'dark' | 'auto';
export type LanguagePreference = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'ar';

interface NotificationPreferences {
  push: boolean;
  email: boolean;
  updates: boolean;
  tips: boolean;
  marketing: boolean;
}

const defaultNotificationPreferences: NotificationPreferences = {
  push: true,
  email: true,
  updates: true,
  tips: true,
  marketing: false,
};
const defaultThemePreference: ThemePreference = 'auto';
const defaultLanguagePreference: LanguagePreference = 'fr';

/**
 * Récupère les préférences de l'utilisateur
 */
export async function obtenirPreferences(): Promise<UserPreferences> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserPreferences;
      return {
        hiddenChildrenIds: data.hiddenChildrenIds ?? [],
        notifications: {
          ...defaultNotificationPreferences,
          ...(data.notifications || {}),
        },
        theme: data.theme ?? defaultThemePreference,
        language: data.language ?? defaultLanguagePreference,
      };
    } else {
      // Si le document n'existe pas, le créer avec des valeurs par défaut
      const defaultPrefs: UserPreferences = {
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

    const mergedNotifications = {
      ...defaultNotificationPreferences,
      ...(preferences.notifications || {}),
      ...updates,
    };

    await updateDoc(docRef, {
      notifications: mergedNotifications,
      updatedAt: new Date(),
    });

    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour des notifications:", e);
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

    console.log("Enfant masqué avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors du masquage de l'enfant:", e);
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
    throw e;
  }
}
