import { useEffect, useRef } from "react";

import { useMinuteTick } from "@/hooks/useMinuteTick";
import type { useToast } from "@/contexts/ToastContext";

// S7.6 : surveille les seuils de rappel (change, repas, pompage) et affiche un
// toast une seule fois par dépassement. Composant « sans rendu » : il porte
// lui-même le tick à la minute, pour que l'écran d'accueil ne se re-rende pas
// toutes les minutes juste pour cette vérification.

export interface ReminderWarningWatcherProps {
  childId?: string | null;
  remindersEnabled: boolean;
  thresholds: { changes?: number; repas?: number; pompages?: number };
  lastMictionTs?: number;
  lastSelleTs?: number;
  /** Dernier repas du jour (sinon dernier repas absolu). */
  mealsLastTs?: number;
  lastPompageTs?: number;
  showToast: ReturnType<typeof useToast>["showToast"];
}

export function ReminderWarningWatcher({
  childId,
  remindersEnabled,
  thresholds,
  lastMictionTs,
  lastSelleTs,
  mealsLastTs,
  lastPompageTs,
  showToast,
}: ReminderWarningWatcherProps) {
  const { currentTime } = useMinuteTick();
  const warningStateRef = useRef<
    Record<string, { change?: number; repas?: number; pompage?: number }>
  >({});

  useEffect(() => {
    if (!childId) return;

    if (!warningStateRef.current[childId]) {
      warningStateRef.current[childId] = {};
    }
    const warningState = warningStateRef.current[childId];
    const now = currentTime.getTime();
    const changesThresholdHours = thresholds.changes || 0;
    const changesThresholdMs =
      changesThresholdHours > 0 ? changesThresholdHours * 60 * 60 * 1000 : null;

    const lastChangeTs = Math.max(lastMictionTs ?? 0, lastSelleTs ?? 0);
    const changeExceeded =
      remindersEnabled &&
      changesThresholdMs !== null &&
      lastChangeTs > 0 &&
      now - lastChangeTs > changesThresholdMs;
    const changeNotified = lastChangeTs > 0 && warningState.change === lastChangeTs;

    if (changeExceeded && !changeNotified) {
      showToast(
        `⚠️ Attention: plus de ${changesThresholdHours}h depuis le dernier change.`,
        3200,
        "top",
      );
      warningState.change = lastChangeTs;
    }

    const repasThresholdHours = thresholds.repas || 0;
    const repasThresholdMs =
      repasThresholdHours > 0 ? repasThresholdHours * 60 * 60 * 1000 : null;
    const repasExceeded =
      remindersEnabled &&
      repasThresholdMs !== null &&
      !!mealsLastTs &&
      now - mealsLastTs > repasThresholdMs;
    const repasNotified = mealsLastTs && warningState.repas === mealsLastTs;

    if (repasExceeded && !repasNotified) {
      showToast(
        `⚠️ Attention: plus de ${repasThresholdHours}h depuis le dernier repas.`,
        3200,
        "top",
      );
      warningState.repas = mealsLastTs;
    }

    const pompagesThresholdHours = thresholds.pompages || 0;
    const pompagesThresholdMs =
      pompagesThresholdHours > 0 ? pompagesThresholdHours * 60 * 60 * 1000 : null;
    const pompageExceeded =
      remindersEnabled &&
      pompagesThresholdMs !== null &&
      !!lastPompageTs &&
      now - lastPompageTs > pompagesThresholdMs;
    const pompageNotified = lastPompageTs && warningState.pompage === lastPompageTs;

    if (pompageExceeded && !pompageNotified) {
      showToast(
        `⚠️ Attention: plus de ${pompagesThresholdHours}h depuis le dernier pompage.`,
        3200,
        "top",
      );
      warningState.pompage = lastPompageTs;
    }
  }, [
    childId,
    currentTime,
    remindersEnabled,
    thresholds.changes,
    thresholds.repas,
    thresholds.pompages,
    lastMictionTs,
    lastSelleTs,
    mealsLastTs,
    lastPompageTs,
    showToast,
  ]);

  return null;
}
