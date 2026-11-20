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
  /**
   * Session encore en cours au moment de la réponse à une question (sieste
   * passée minuit) ? Un autre aidant a pu l'arrêter ou la supprimer : la
   * réponse ne réécrit jamais une session close.
   */
  isStillRunning?: (eventId: string) => boolean;
  getSuccessLabel: (
    event: TEvent,
    timing: { elapsedMinutes: number; isUnderOneMinute: boolean },
  ) => string;
};

export function useStopTimedEventWithUndo<TEvent extends TimedEvent>({
  childId,
  getSuccessLabel,
  onTooLong,
  isStillRunning,
}: StopTimedEventParams<TEvent>) {
  const { showUndoToast, showToast } = useToast();
  const { showAlert } = useModal();

  const stop = useCallback(
    // `extra` : champs ajoutés à l'arrêt (ex. endSource: "widget", mesure de l'usage).
    // `opts.onUndo` : appelé quand l'utilisateur touche « Annuler » (ex. annuler le retour auto du widget).
    // `opts.allowPastMidnight` : sieste convertie en nuit (déjà confirmée).
    // `opts.forChildId` : bébé de la session, figé quand la question a été
    // posée (l'Accueil a pu changer de bébé entre-temps).
    // Renvoie vrai si l'arrêt est écrit ; faux s'il attend une réponse
    // (question, formulaire) ou n'a pas eu lieu.
    (
      event: TEvent | null | undefined,
      extra?: Record<string, unknown>,
      opts?: { onUndo?: () => void; allowPastMidnight?: boolean; forChildId?: string },
    ): boolean => {
      const targetChildId = opts?.forChildId ?? childId;
      if (!targetChildId || !event?.id) return false;
      const start = toDate(event.heureDebut);
      const heureFin = new Date();
      // Début absent ou invalide : on arrête quand même le chrono, sans durée
      // (jamais de NaN écrit dans Firestore).
      const hasStart = isValidDate(start);
      const elapsedMs = hasStart ? heureFin.getTime() - start.getTime() : 0;
      // Minutes entières écoulées, comme le chrono affiché (qui ignore les
      // secondes) : « 5 min » à l'écran, 5 min enregistrées (R12).
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const isUnderOneMinute = elapsedMs < 60_000;
      const duree = hasStart ? Math.max(1, elapsedMinutes) : undefined;
      if (duree !== undefined && duree > MAX_TIMED_EVENT_MINUTES) {
        showToast("Plus de 24 h : indiquez l'heure de fin réelle");
        onTooLong?.(event);
        return false;
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
                // Bébé changé pendant la question : le formulaire s'ouvrirait
                // sur l'autre bébé.
                if (childIdRef.current !== targetChildId) {
                  showToast("Bébé changé : rien n'a été modifié");
                  return;
                }
                if (stillRunningRef.current && !stillRunningRef.current(event.id!)) {
                  showToast("Session déjà terminée");
                  return;
                }
                const endOfStartDay = new Date(start);
                endOfStartDay.setHours(23, 59, 0, 0);
                // Début à 23:59:xx : 23:59 serait avant lui ; le formulaire
                // propose alors lui-même une fin plausible.
                onTooLong?.(event, endOfStartDay > start ? endOfStartDay : undefined);
              },
            },
            {
              text: "Enregistrer comme nuit",
              // Bébé figé : la session appartient à celui de la question.
              onPress: () => {
                if (stillRunningRef.current && !stillRunningRef.current(event.id!)) {
                  showToast("Session déjà terminée");
                  return;
                }
                stopRef.current(
                  event,
                  { ...(extra ?? {}), isNap: false },
                  { ...opts, allowPastMidnight: true, forChildId: targetChildId },
                );
              },
            },
          ],
          // Une seule question par session, même après plusieurs appuis.
          { key: `nap-past-midnight:${event.id}` },
        );
        return false;
      }
      const snapshot = event;

      modifierEvenementOptimistic(
        targetChildId,
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
          targetChildId,
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
      return true;
    },
    [childId, getSuccessLabel, showUndoToast, showToast, showAlert, onTooLong],
  );
  const childIdRef = useRef(childId);
  const stopRef = useRef(stop);
  const stillRunningRef = useRef(isStillRunning);
  useEffect(() => {
    childIdRef.current = childId;
    stopRef.current = stop;
    stillRunningRef.current = isStillRunning;
  }, [childId, stop, isStillRunning]);
  return stop;
}
