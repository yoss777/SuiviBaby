import { useCallback, useEffect, useRef } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useModal } from "@/contexts/ModalContext";
import { modifierEvenementOptimistic } from "@/services/eventsService";
import { isValidDate, toDate } from "@/utils/date";

type TimedEvent = {
  id?: string;
  type?: string;
  isNap?: boolean | null;
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
  /**
   * Heure de fin à corriger dans le formulaire. `suggestedEnd` : fin proposée
   * (sieste passée minuit : 23:59 du jour du début) ; sinon le formulaire
   * propose lui-même une fin plausible pour une session oubliée.
   */
  onTooLong?: (event: TEvent, suggestedEnd?: Date) => void;
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
  const { showAlert } = useModal();

  const stop = useCallback(
    // `extra` : champs ajoutés à l'arrêt (ex. endSource: "widget", mesure de l'usage).
    // `opts.onUndo` : appelé quand l'utilisateur touche « Annuler » (ex. annuler le retour auto du widget).
    // `opts.allowPastMidnight` : sieste convertie en nuit (déjà confirmée).
    (
      event: TEvent | null | undefined,
      extra?: Record<string, unknown>,
      opts?: { onUndo?: () => void; allowPastMidnight?: boolean },
    ) => {
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
      // Sieste arrêtée après minuit : une sieste ne finit pas le lendemain.
      // On propose de l'enregistrer comme une nuit (mêmes heures), ou de
      // corriger l'heure de fin dans le formulaire.
      if (
        !opts?.allowPastMidnight &&
        event.type === "sommeil" &&
        event.isNap !== false &&
        isValidDate(start) &&
        start.toDateString() !== heureFin.toDateString()
      ) {
        showAlert(
          "Cette sieste passe minuit",
          "On l'enregistre comme une nuit, avec les mêmes heures ?",
          [
            {
              text: "Corriger l'heure de fin",
              style: "cancel",
              onPress: () => {
                const endOfStartDay = new Date(start);
                endOfStartDay.setHours(23, 59, 0, 0);
                onTooLong?.(event, endOfStartDay);
              },
            },
            {
              text: "Enregistrer comme nuit",
              onPress: () => stopRef.current(event, { ...(extra ?? {}), isNap: false }, { ...opts, allowPastMidnight: true }),
            },
          ],
          // Une seule question par session, même après plusieurs appuis.
          { key: `nap-past-midnight:${event.id}` },
        );
        return;
      }
      const snapshot = event;

      modifierEvenementOptimistic(
        childId,
        event.id,
        { ...(duree === undefined ? { heureFin } : { heureFin, duree }), ...(extra ?? {}) },
        snapshot,
      );

      // Libellé selon l'état enregistré (« Nuit terminée » après conversion).
      const successLabel = getSuccessLabel({ ...event, ...(extra ?? {}) } as TEvent, {
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
          // Un champ qui existait avant (isNap d'une sieste convertie en nuit)
          // reprend sa valeur ; les autres (endSource…) sont retirés.
          {
            heureFin: null,
            duree: null,
            ...Object.fromEntries(
              Object.keys(extra ?? {}).map((k) => [k, (snapshot as Record<string, unknown>)[k] ?? null]),
            ),
          } as any,
          duree === undefined ? { ...snapshot, heureFin } : { ...snapshot, heureFin, duree },
        );
      }, undefined, 5000);
    },
    [childId, getSuccessLabel, showUndoToast, showToast, showAlert, onTooLong],
  );
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  return stop;
}
