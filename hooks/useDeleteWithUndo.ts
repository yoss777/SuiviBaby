import { useCallback, useRef } from "react";
import { useToast } from "@/contexts/ToastContext";
import { runDeleteWithRetry, type RunDeleteOptions } from "@/utils/deleteWithRetry";

/**
 * Suppression avec annulation : le toast « Annuler » laisse un délai, puis la
 * suppression part (tout de suite si l'app passe en arrière-plan, cf.
 * ToastContext). En cas d'échec : élément ré-affiché et « Réessayer », sans
 * fermeture périmée (les toasts sont relus à chaque essai).
 */
export function useDeleteWithUndo() {
  const { showUndoToast, showActionToast, showToast } = useToast();
  const toastsRef = useRef({ showActionToast, showToast });
  toastsRef.current = { showActionToast, showToast };

  return useCallback(
    (params: {
      message: string;
      /** Remet l'élément à l'écran (clic sur « Annuler »). */
      onUndo: () => void;
      run: RunDeleteOptions["run"];
      onRestore: () => void;
      onHide?: () => void;
      durationMs?: number;
    }) => {
      showUndoToast(
        params.message,
        params.onUndo,
        () => {
          void runDeleteWithRetry({
            run: params.run,
            onRestore: params.onRestore,
            onHide: params.onHide,
            getToasts: () => toastsRef.current,
            context: { service: "events", operation: "deleteWithUndo" },
          });
        },
        params.durationMs ?? 4000,
      );
    },
    [showUndoToast],
  );
}
