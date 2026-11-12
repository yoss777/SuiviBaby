// utils/nursingDraftDisplay.ts
// Libellés de l'indicateur « Tétée en cours » de l'Accueil, calculés à partir
// du brouillon du chrono tétée (format inchangé, lu via nursingTimer).
import { sideSeconds, type NursingTimerState } from "@/components/forms/nursingTimer";
import { formatElapsedMinutes } from "@/utils/timeSince";

const SIDE_LABEL = { left: "gauche", right: "droit" } as const;

export interface NursingDraftDisplay {
  running: boolean;
  /** Secondes comptées, deux côtés et segment en cours compris. */
  totalSeconds: number;
  /** Ligne courte affichée : « Tétée en cours · côté gauche · 6 min ». */
  label: string;
  /** Lecture complète pour le lecteur d'écran. */
  accessibilityLabel: string;
}

export function describeNursingDraft(state: NursingTimerState, now: number): NursingDraftDisplay {
  const totalSeconds = sideSeconds(state, "left", now) + sideSeconds(state, "right", now);
  const running = state.runningSide !== null;
  const elapsed =
    totalSeconds < 60 ? "moins d'1 min" : formatElapsedMinutes(Math.floor(totalSeconds / 60));
  const status = running ? "Tétée en cours" : "Tétée en pause";
  const side = state.runningSide ? `côté ${SIDE_LABEL[state.runningSide]}` : null;
  const label = [status, side, elapsed].filter(Boolean).join(" · ");
  const accessibilityLabel = `${[status, side, elapsed].filter(Boolean).join(", ")}. Reprendre la tétée`;
  return { running, totalSeconds, label, accessibilityLabel };
}
