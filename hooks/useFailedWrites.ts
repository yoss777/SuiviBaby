// hooks/useFailedWrites.ts
// Fenêtre « Enregistrements non envoyés » : lecture, réessai et suppression des
// écritures abandonnées par la file hors ligne. Rien n'y est silencieux : une
// lecture impossible n'est jamais présentée comme une liste vide, et la
// suppression demande confirmation puis ne vise que les lignes AFFICHÉES.

import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
  deleteExhaustedEventsByIds,
  getExhaustedEvents,
  retryExhaustedEvents,
} from "@/services/offlineQueueService";
import { captureServiceError } from "@/utils/errorReporting";
import { describeQueuedWrite } from "@/utils/queuedWriteLabel";

export const FAILED_WRITES_READ_ERROR = "Impossible de lire la liste, réessayez";

export type FailedWriteRow = { id: string; label: string };
export type FailedWritesState =
  | { status: "closed" }
  | { status: "error" }
  | { status: "ready"; rows: FailedWriteRow[] };

export function useFailedWrites() {
  const [state, setState] = useState<FailedWritesState>({ status: "closed" });

  const open = useCallback(async () => {
    try {
      const rows = await getExhaustedEvents();
      setState({
        status: "ready",
        rows: rows.map((row) => ({ id: row.id, label: describeQueuedWrite(row) })),
      });
    } catch (error) {
      captureServiceError(error, { service: "offlineQueue", operation: "openFailedList" });
      setState({ status: "error" });
    }
  }, []);

  const close = useCallback(() => setState({ status: "closed" }), []);

  const retry = useCallback(async () => {
    // Liste illisible : on relit, on ne réarme pas à l'aveugle.
    if (state.status === "error") {
      await open();
      return;
    }
    setState({ status: "closed" });
    try {
      await retryExhaustedEvents();
    } catch (error) {
      captureServiceError(error, { service: "offlineQueue", operation: "retryFailedWrites" });
    }
  }, [open, state.status]);

  const deleteShown = useCallback(() => {
    if (state.status !== "ready" || state.rows.length === 0) return;
    const ids = state.rows.map((row) => row.id);
    Alert.alert(
      "Supprimer ces saisies ?",
      "Ces saisies ne seront jamais envoyées et ne pourront pas être récupérées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExhaustedEventsByIds(ids);
              setState({ status: "closed" });
            } catch (error) {
              captureServiceError(error, { service: "offlineQueue", operation: "deleteFailedWrites" });
              Alert.alert("Erreur", "Impossible de supprimer ces saisies. Réessayez.");
            }
          },
        },
      ],
    );
  }, [state]);

  return { state, open, close, retry, deleteShown };
}
