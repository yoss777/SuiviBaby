// services/localNotificationService.ts
// Planifie/annule des notifications locales de rappel
// basées sur les thresholds utilisateur (repas, pompages, changes, vitamines).

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ReminderKey } from "./userPreferencesService";
import { DIAPER_DOMAIN_EVENT_TYPES } from "./eventTypeSupport";

// ============================================
// CONSTANTS
// ============================================

/** Mapping catégorie → types d'événements couverts */
export const REMINDER_EVENT_TYPES: Record<ReminderKey, string[]> = {
  repas: ["biberon", "tetee", "solide"],
  pompages: ["pompage"],
  // The modern product tracks diapers through `miction` / `selle`, but
  // reminder rescheduling still accepts legacy `couche` entries for
  // historical compatibility.
  changes: DIAPER_DOMAIN_EVENT_TYPES,
  vitamines: ["vitamine"],
};

/** Reverse mapping : type d'événement → catégorie de rappel */
export const EVENT_TYPE_TO_REMINDER: Record<string, ReminderKey> = {};
for (const [category, types] of Object.entries(REMINDER_EVENT_TYPES)) {
  for (const t of types) {
    EVENT_TYPE_TO_REMINDER[t] = category as ReminderKey;
  }
}

/** Labels humains pour les messages de notification */
const CATEGORY_LABELS: Record<ReminderKey, string> = {
  repas: "repas",
  pompages: "pompage",
  changes: "change",
  vitamines: "vitamine",
};

// Préfixe pour les identifiants de notification (permet de les annuler)
const NOTIF_ID_PREFIX = "reminder";

// ============================================
// SETUP
// ============================================

/**
 * Configure le handler global de notifications.
 * À appeler une seule fois au démarrage de l'app (_layout.tsx).
 */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Demande la permission de notifications si pas encore fait.
 * Retourne true si autorisé.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ============================================
// SCHEDULE / CANCEL
// ============================================

/**
 * Construit l'identifiant unique d'une notification de rappel.
 * Format: reminder-{childId}-{category}
 */
function buildNotifId(childId: string, category: ReminderKey): string {
  return `${NOTIF_ID_PREFIX}-${childId}-${category}`;
}

/**
 * Planifie une notification locale de rappel pour une catégorie donnée.
 *
 * Appeler après chaque création d'événement :
 *   → annule l'ancienne notif de la catégorie
 *   → planifie une nouvelle à now + thresholdHours
 *
 * @param childId      ID de l'enfant
 * @param childName    Prénom de l'enfant (pour le message)
 * @param category     Clé de rappel (repas, pompages, changes, vitamines)
 * @param thresholdHours  Nombre d'heures avant rappel (0 = désactivé)
 */
export async function scheduleReminder(
  childId: string,
  childName: string,
  category: ReminderKey,
  thresholdHours: number,
): Promise<void> {
  const identifier = buildNotifId(childId, category);

  // Toujours annuler l'ancienne notif de cette catégorie
  await cancelReminder(childId, category);

  // Si threshold = 0, pas de rappel
  if (thresholdHours <= 0) return;

  const triggerSeconds = thresholdHours * 3600;
  const label = CATEGORY_LABELS[category];

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `Rappel ${label} — ${childName}`,
      body: `Plus de ${thresholdHours}h depuis le dernier ${label}`,
      sound: "default",
      data: {
        type: "reminder",
        category,
        childId,
        route: "/baby/home",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: triggerSeconds,
      repeats: false,
    },
  });
}

/**
 * Annule la notification de rappel pour une catégorie + enfant.
 */
export async function cancelReminder(
  childId: string,
  category: ReminderKey,
): Promise<void> {
  const identifier = buildNotifId(childId, category);
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

/**
 * Annule toutes les notifications de rappel d'un enfant.
 */
export async function cancelAllRemindersForChild(
  childId: string,
): Promise<void> {
  const categories: ReminderKey[] = [
    "repas",
    "pompages",
    "changes",
    "vitamines",
  ];
  await Promise.all(categories.map((cat) => cancelReminder(childId, cat)));
}

/**
 * Annule toutes les notifications de rappel (tous enfants).
 * À appeler au signOut.
 */
export async function cancelAllReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminderIds = scheduled
    .filter((n) => n.identifier.startsWith(NOTIF_ID_PREFIX))
    .map((n) => n.identifier);

  await Promise.all(
    reminderIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id),
    ),
  );
}

/**
 * Re-planifie tous les rappels d'un enfant en se basant sur
 * les thresholds actuels et le dernier événement de chaque catégorie.
 *
 * @param childId       ID de l'enfant
 * @param childName     Prénom
 * @param thresholds    Record<ReminderKey, number> (heures)
 * @param lastEventDates  Map catégorie → date du dernier événement (ou null)
 */
export async function rescheduleAllReminders(
  childId: string,
  childName: string,
  thresholds: Record<ReminderKey, number>,
  lastEventDates: Partial<Record<ReminderKey, Date | null>>,
): Promise<void> {
  const categories: ReminderKey[] = [
    "repas",
    "pompages",
    "changes",
    "vitamines",
  ];

  await Promise.all(
    categories.map(async (cat) => {
      const threshold = thresholds[cat];
      if (!threshold || threshold <= 0) {
        await cancelReminder(childId, cat);
        return;
      }

      const lastDate = lastEventDates[cat];
      if (!lastDate) {
        // Pas d'événement récent → planifier dans threshold heures à partir de maintenant
        await scheduleReminder(childId, childName, cat, threshold);
        return;
      }

      const elapsedMs = Date.now() - lastDate.getTime();
      const thresholdMs = threshold * 3600 * 1000;
      const remainingMs = thresholdMs - elapsedMs;

      if (remainingMs <= 0) {
        // Déjà dépassé → notifier dans 1 minute (laisse le temps à l'app de s'ouvrir)
        await Notifications.scheduleNotificationAsync({
          identifier: buildNotifId(childId, cat),
          content: {
            title: `Rappel ${CATEGORY_LABELS[cat]} — ${childName}`,
            body: `Plus de ${threshold}h depuis le dernier ${CATEGORY_LABELS[cat]}`,
            sound: "default",
            data: {
              type: "reminder",
              category: cat,
              childId,
              route: "/baby/home",
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 60,
            repeats: false,
          },
        });
      } else {
        // Planifier le temps restant
        const remainingSeconds = Math.max(60, Math.ceil(remainingMs / 1000));
        await Notifications.scheduleNotificationAsync({
          identifier: buildNotifId(childId, cat),
          content: {
            title: `Rappel ${CATEGORY_LABELS[cat]} — ${childName}`,
            body: `Plus de ${threshold}h depuis le dernier ${CATEGORY_LABELS[cat]}`,
            sound: "default",
            data: {
              type: "reminder",
              category: cat,
              childId,
              route: "/baby/home",
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: remainingSeconds,
            repeats: false,
          },
        });
      }
    }),
  );
}
