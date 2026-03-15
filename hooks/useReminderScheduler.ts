// hooks/useReminderScheduler.ts
// Re-planifie les notifications locales de rappel quand :
// - les préférences changent (enabled, thresholds)
// - un nouvel événement est créé (todayStats changent)
// - l'enfant actif change

import { useEffect, useRef } from "react";
import type { ReminderKey, ReminderPreferences } from "@/services/userPreferencesService";
import {
  cancelAllRemindersForChild,
  rescheduleAllReminders,
} from "@/services/localNotificationService";

interface LastTimestamps {
  repas: number | null;
  pompages: number | null;
  changes: number | null;
  vitamines: number | null;
}

/**
 * Extracts the last event timestamp per reminder category from todayStats.
 * TodayStats structure:
 *   meals.biberons.lastTimestamp, meals.seins.lastTimestamp, meals.solides.lastTimestamp
 *   pompages.lastTimestamp
 *   mictions.lastTimestamp, selles.lastTimestamp
 *   vitamines.lastTimestamp
 */
function extractLastTimestamps(todayStats: any): LastTimestamps {
  const max = (...vals: (number | undefined | null)[]) =>
    vals.reduce<number | null>((best, v) => {
      if (v == null) return best;
      return best === null || v > best ? v : best;
    }, null);

  return {
    repas: max(
      todayStats?.meals?.biberons?.lastTimestamp,
      todayStats?.meals?.seins?.lastTimestamp,
      todayStats?.meals?.solides?.lastTimestamp,
      todayStats?.meals?.lastAbsoluteTimestamp,
    ),
    pompages: max(todayStats?.pompages?.lastTimestamp),
    changes: max(
      todayStats?.mictions?.lastTimestamp,
      todayStats?.mictions?.lastAbsoluteTimestamp,
      todayStats?.selles?.lastTimestamp,
      todayStats?.selles?.lastAbsoluteTimestamp,
    ),
    vitamines: max(todayStats?.vitamines?.lastTimestamp),
  };
}

/**
 * Hook qui re-planifie les notifications locales de rappel
 * dès que les préférences ou les timestamps changent.
 *
 * @param childId     ID de l'enfant actif (null si aucun)
 * @param childName   Prénom de l'enfant actif
 * @param prefs       Préférences de rappel (enabled + thresholds)
 * @param todayStats  Données du dashboard (contient lastTimestamp par type)
 */
export function useReminderScheduler(
  childId: string | null | undefined,
  childName: string | undefined,
  prefs: ReminderPreferences,
  todayStats: any,
) {
  const prevChildIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!childId || !childName) return;

    // Si l'enfant a changé, annuler les rappels de l'ancien
    if (prevChildIdRef.current && prevChildIdRef.current !== childId) {
      cancelAllRemindersForChild(prevChildIdRef.current).catch(() => {});
    }
    prevChildIdRef.current = childId;

    if (!prefs.enabled) {
      cancelAllRemindersForChild(childId).catch(() => {});
      return;
    }

    const timestamps = extractLastTimestamps(todayStats);
    const lastDates: Partial<Record<ReminderKey, Date | null>> = {};

    for (const cat of ["repas", "pompages", "changes", "vitamines"] as ReminderKey[]) {
      const ts = timestamps[cat];
      lastDates[cat] = ts ? new Date(ts) : null;
    }

    rescheduleAllReminders(
      childId,
      childName,
      prefs.thresholds,
      lastDates,
    ).catch(() => {});
  }, [
    childId,
    childName,
    prefs.enabled,
    prefs.thresholds.repas,
    prefs.thresholds.pompages,
    prefs.thresholds.changes,
    prefs.thresholds.vitamines,
    // Re-trigger when any lastTimestamp changes
    todayStats?.meals?.biberons?.lastTimestamp,
    todayStats?.meals?.seins?.lastTimestamp,
    todayStats?.meals?.solides?.lastTimestamp,
    todayStats?.meals?.lastAbsoluteTimestamp,
    todayStats?.pompages?.lastTimestamp,
    todayStats?.mictions?.lastTimestamp,
    todayStats?.mictions?.lastAbsoluteTimestamp,
    todayStats?.selles?.lastTimestamp,
    todayStats?.selles?.lastAbsoluteTimestamp,
    todayStats?.vitamines?.lastTimestamp,
  ]);
}
