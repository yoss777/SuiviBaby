import { useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";
import { modifierEvenementOptimistic } from "@/services/eventsService";
import { toDate } from "@/utils/date";

type TimedEvent = {
  id?: string;
  heureDebut?: unknown;
  heureFin?: unknown;
  duree?: number | null;
};

type StopTimedEventParams<TEvent extends TimedEvent> = {
  childId?: string | null;
  getSuccessLabel: (
    event: TEvent,
    timing: { elapsedMinutes: number; isUnderOneMinute: boolean },
  ) => string;
};

export function useStopTimedEventWithUndo<TEvent extends TimedEvent>({
  childId,
  getSuccessLabel,
}: StopTimedEventParams<TEvent>) {
  const { showUndoToast } = useToast();

  return useCallback(
    (event: TEvent | null | undefined) => {
      if (!childId || !event?.id) return;
      const start = toDate(event.heureDebut);
      const heureFin = new Date();
      const elapsedMs = heureFin.getTime() - start.getTime();
      const elapsedMinutes = Math.round(elapsedMs / 60000);
      const isUnderOneMinute = elapsedMs < 60_000;
      const duree = Math.max(
        1,
        elapsedMinutes,
      );
      const snapshot = event;

      modifierEvenementOptimistic(
        childId,
        event.id,
        { heureFin, duree },
        snapshot,
      );

      const successLabel = getSuccessLabel(event, {
        elapsedMinutes,
        isUnderOneMinute,
      });

      showUndoToast(successLabel, () => {
        modifierEvenementOptimistic(
          childId,
          event.id!,
          { heureFin: null, duree: null } as any,
          { ...snapshot, heureFin, duree },
        );
      }, undefined, 5000);
    },
    [childId, getSuccessLabel, showUndoToast],
  );
}
