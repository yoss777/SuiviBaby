// Suppression avec annulation : l'élément disparaît tout de suite de la liste
// (soft-delete), la suppression Firestore part après le délai d'annulation.
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";

import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { supprimerEvenement } from "@/services/eventsService";
import { batchDeleteRun, type RunDeleteOptions } from "@/utils/deleteWithRetry";

export const OPTIMISTIC_PREFIX = "__optimistic_";
export const SAVING_TOAST = "Enregistrement en cours...";

/** Saisie pas encore confirmée par le serveur : ni modifiable ni supprimable. */
export function isOptimisticId(id: string | undefined | null): boolean {
  return !!id?.startsWith?.(OPTIMISTIC_PREFIX);
}

type Options<T extends { id: string }> = {
  childId: string | undefined;
  items: readonly T[];
  texts: {
    deleted: string;
    batchDeleted: (count: number) => string;
    batchDeleteHaptic: boolean;
  };
  showToast: (message: string) => void;
  /** Appelé avant une suppression groupée (sortie du mode sélection). */
  onBatchStart: () => void;
};

function withIds(prev: Set<string>, ids: readonly string[], add: boolean): Set<string> {
  const next = new Set(prev);
  ids.forEach((id) => (add ? next.add(id) : next.delete(id)));
  return next;
}

export function useSoftDelete<T extends { id: string }>({
  childId,
  items,
  texts,
  showToast,
  onBatchStart,
}: Options<T>) {
  const scheduleDelete = useDeleteWithUndo();
  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({
    visible: false,
    ids: [],
  });

  // Oublie les ids qui ne sont plus dans les données (suppression confirmée).
  useEffect(() => {
    setSoftDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      const dataIds = new Set(items.map((e) => e.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (dataIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const hideAndSchedule = useCallback(
    (ids: string[], message: string, run: RunDeleteOptions["run"]) => {
      setSoftDeletedIds((prev) => withIds(prev, ids, true));
      scheduleDelete({
        message,
        onUndo: () => setSoftDeletedIds((prev) => withIds(prev, ids, false)),
        run,
        onRestore: () => setSoftDeletedIds((prev) => withIds(prev, ids, false)),
        onHide: () => setSoftDeletedIds((prev) => withIds(prev, ids, true)),
      });
    },
    [scheduleDelete],
  );

  // Suppression unitaire : immédiate et annulable (toast « Annuler »), sans
  // modale — la confirmation est réservée à la suppression groupée.
  const requestDelete = useCallback(
    (item: T) => {
      if (isOptimisticId(item.id)) {
        showToast(SAVING_TOAST);
        return;
      }
      if (!childId || !item.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const id = item.id;
      hideAndSchedule([id], texts.deleted, () => supprimerEvenement(childId, id));
    },
    [childId, hideAndSchedule, showToast, texts.deleted],
  );

  const requestBatchDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      if (texts.batchDeleteHaptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (!childId) {
        return;
      }
      setBatchDeleteConfirm({ visible: true, ids });
    },
    [childId, texts.batchDeleteHaptic],
  );

  const confirmBatchDelete = useCallback(() => {
    const ids = batchDeleteConfirm.ids;
    if (!childId || ids.length === 0) return;
    setBatchDeleteConfirm({ visible: false, ids: [] });
    onBatchStart();
    hideAndSchedule(
      ids,
      texts.batchDeleted(ids.length),
      batchDeleteRun(ids, (id) => supprimerEvenement(childId, id)),
    );
  }, [batchDeleteConfirm.ids, childId, onBatchStart, hideAndSchedule, texts]);

  const cancelBatchDelete = useCallback(() => {
    setBatchDeleteConfirm({ visible: false, ids: [] });
  }, []);

  return {
    softDeletedIds,
    batchDeleteConfirm,
    requestDelete,
    requestBatchDelete,
    confirmBatchDelete,
    cancelBatchDelete,
  };
}
