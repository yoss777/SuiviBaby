// Bouton « Supprimer » des feuilles d'édition : même modèle que les listes
// (audit UI/UX V3, R-P1-12). La feuille se ferme, la ligne disparaît tout de
// suite de toutes les listes (ids masqués partagés) et le toast « Annuler »
// laisse 8 s avant la suppression serveur. Pas de modale de confirmation :
// elle reste réservée à la suppression groupée, d'un enfant ou du compte.
import * as Haptics from "expo-haptics";
import { useCallback } from "react";

import { useToast } from "@/contexts/ToastContext";
import { isOptimisticId, SAVING_TOAST } from "@/hooks/eventList/useSoftDelete";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import type { RunDeleteOptions } from "@/utils/deleteWithRetry";
import { softDeleteNow } from "@/utils/softDeleteNow";

export function useSheetDeleteWithUndo() {
  const scheduleDelete = useDeleteWithUndo();
  const { showToast } = useToast();

  return useCallback(
    ({
      id,
      message,
      run,
      close,
    }: {
      id: string | undefined;
      /** Texte du toast, par ex. « Activité supprimée ». */
      message: string;
      run: RunDeleteOptions["run"];
      /** Ferme la feuille (onDelete du formulaire). */
      close?: () => void;
    }): boolean => {
      if (!id) return false;
      if (isOptimisticId(id)) {
        showToast(SAVING_TOAST);
        return false;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      close?.();
      softDeleteNow({ id, message, run, scheduleDelete });
      return true;
    },
    [scheduleDelete, showToast],
  );
}
