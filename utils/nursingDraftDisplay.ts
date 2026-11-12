// utils/nursingDraftDisplay.ts
// Libellés de l'indicateur « Tétée en cours » de l'Accueil, calculés à partir
// du brouillon du chrono tétée (format inchangé, lu via nursingTimer).
import {
  nursingDraftExpiresAt,
  sideSeconds,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";
import { formatElapsedMinutes } from "@/utils/timeSince";

const SIDE_LABEL = { left: "gauche", right: "droit" } as const;

/** En deçà, l'échéance d'une tétée en pause est mise en avant. */
export const NURSING_EXPIRY_WARNING_MS = 10 * 60 * 1000;

export interface NursingDraftDisplay {
  running: boolean;
  /** Secondes comptées, deux côtés et segment en cours compris. */
  totalSeconds: number;
  /** Ligne courte affichée : « Tétée en cours · côté gauche · 6 min ». */
  label: string;
  /**
   * Tétée en pause : heure à laquelle le brouillon sera effacé s'il n'est ni
   * repris ni enregistré (« Effacée à 14:35 sans reprise »). null en marche.
   */
  expiryLabel: string | null;
  /** L'échéance approche (moins de 10 min). */
  expiringSoon: boolean;
  /** Lecture complète pour le lecteur d'écran. */
  accessibilityLabel: string;
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function describeNursingDraft(state: NursingTimerState, now: number): NursingDraftDisplay {
  const totalSeconds = sideSeconds(state, "left", now) + sideSeconds(state, "right", now);
  const running = state.runningSide !== null;
  const elapsed =
    totalSeconds < 60 ? "moins d'1 min" : formatElapsedMinutes(Math.floor(totalSeconds / 60));
  const status = running ? "Tétée en cours" : "Tétée en pause";
  const side = state.runningSide ? `côté ${SIDE_LABEL[state.runningSide]}` : null;
  const label = [status, side, elapsed].filter(Boolean).join(" · ");
  const expiresAt = nursingDraftExpiresAt(state);
  const expiryLabel = running ? null : `Effacée à ${clock(expiresAt)} sans reprise`;
  const expiringSoon = !running && expiresAt - now <= NURSING_EXPIRY_WARNING_MS;
  const accessibilityLabel = `${[status, side, elapsed, expiryLabel].filter(Boolean).join(", ")}. Reprendre la tétée`;
  return { running, totalSeconds, label, expiryLabel, expiringSoon, accessibilityLabel };
}
