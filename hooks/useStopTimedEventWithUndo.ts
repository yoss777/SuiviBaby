import { useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";
import { modifierEvenementOptimistic } from "@/services/eventsService";
import { isValidDate, toDate } from "@/utils/date";

type TimedEvent = {
  id?: string;
  heureDebut?: unknown;
  heureFin?: unknown;
  duree?: number | null;
};

/** Durée maximale acceptée par le serveur (validation.js : 1440 min) ; au-delà, l'arrêt échouait sans rien dire. */
export const MAX_TIMED_EVENT_MINUTES = 1440;

type StopTimedEventParams<TEvent extends TimedEvent> = {
  childId?: string | null;
  /**
   * Session de plus de 24 h (oubliée) : l'heure de fin réelle est inconnue et
   * le serveur refuserait la durée. On ouvre plutôt le formulaire pour la saisir.
   */
  onTooLong?: (event: TEvent) => void;
  getSuccessLabel: (
    event: TEvent,
    timing: { elapsedMinutes: number; isUnderOneMinute: boolean },
  ) => string;
};

export function useStopTimedEventWithUndo<TEvent extends TimedEvent>({
  childId,
  getSuccessLabel,
  onTooLong,
}: StopTimedEventParams<TEvent>) {
  const { showUndoToast, showToast } = useToast();

  return useCallback(
    // `extra` : champs ajoutés à l'arrêt (ex. endSource: "widget", mesure de l'usage).
    // `opts.onUndo` : appelé quand l'utilisateur touche « Annuler » (ex. annuler le retour auto du widget).
    (event: TEvent | null | undefined, extra?: Record<string, unknown>, opts?: { onUndo?: () => void }) => {
      if (!childId || !event?.id) return;
      const start = toDate(event.heureDebut);
      const heureFin = new Date();
      // Début absent ou invalide : on arrête quand même le chrono, sans durée
      // (jamais de NaN écrit dans Firestore).
      const hasStart = isValidDate(start);
      const elapsedMs = hasStart ? heureFin.getTime() - start.getTime() : 0;
      const elapsedMinutes = Math.round(elapsedMs / 60000);
      const isUnderOneMinute = elapsedMs < 60_000;
      const duree = hasStart ? Math.max(1, elapsedMinutes) : undefined;
      if (duree !== undefined && duree > MAX_TIMED_EVENT_MINUTES) {
        showToast("Plus de 24 h : indiquez l'heure de fin réelle");
        onTooLong?.(event);
        return;
      }
      const snapshot = event;

      modifierEvenementOptimistic(
        childId,
        event.id,
        { ...(duree === undefined ? { heureFin } : { heureFin, duree }), ...(extra ?? {}) },
        snapshot,
      );

      const successLabel = getSuccessLabel(event, {
        elapsedMinutes,
        isUnderOneMinute,
      });

      showUndoToast(successLabel, () => {
        opts?.onUndo?.();
        modifierEvenementOptimistic(
          childId,
          event.id!,
          // Les champs ajoutés à l'arrêt (endSource…) sont retirés aussi :
          // sinon la mesure compterait un arrêt annulé.
          { heureFin: null, duree: null, ...Object.fromEntries(Object.keys(extra ?? {}).map((k) => [k, null])) } as any,
          duree === undefined ? { ...snapshot, heureFin } : { ...snapshot, heureFin, duree },
        );
      }, undefined, 5000);
    },
    [childId, getSuccessLabel, showUndoToast, showToast, onTooLong],
  );
}
