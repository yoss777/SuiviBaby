// utils/deleteWithRetry.ts
// Exécute une suppression différée (après le délai d'annulation) et gère
// l'échec : élément ré-affiché, Sentry, bouton « Réessayer ». Le compteur
// d'essais est un paramètre, et les fonctions de toast sont relues à chaque
// fois (getToasts) : pas de fermeture périmée imbriquée sur 3 niveaux.

import { captureServiceError } from "@/utils/errorReporting";

export const MAX_DELETE_ATTEMPTS = 3;

type Toasts = {
  showActionToast: (message: string, actionLabel: string, onAction: () => void, durationMs?: number) => void;
  showToast: (message: string, durationMs?: number) => void;
};

type DeleteResult = "deleted" | "queued" | void;

export interface RunDeleteOptions {
  /**
   * Appelle la suppression. "queued" : hors ligne, partira à la reconnexion.
   * Pour une suppression groupée (Promise.all), un seul "queued" suffit.
   */
  run: () => Promise<DeleteResult | DeleteResult[]>;
  /** Ré-affiche l'élément (la suppression a échoué). */
  onRestore: () => void;
  /** Masque de nouveau l'élément (avant un nouvel essai). */
  onHide?: () => void;
  /** Toujours les fonctions de toast courantes. */
  getToasts: () => Toasts;
  context: { service: string; operation: string };
  attempt?: number;
}

export async function runDeleteWithRetry(options: RunDeleteOptions): Promise<void> {
  const attempt = options.attempt ?? 1;
  try {
    const outcome = await options.run();
    const queued = Array.isArray(outcome) ? outcome.includes("queued") : outcome === "queued";
    if (queued) {
      options.getToasts().showToast("Suppression enregistrée : synchronisation en attente.");
    }
  } catch (error) {
    captureServiceError(error, options.context);
    options.onRestore();
    const toasts = options.getToasts();
    if (attempt >= MAX_DELETE_ATTEMPTS) {
      toasts.showToast("Échec de la suppression");
      return;
    }
    toasts.showActionToast("Erreur lors de la suppression", "Réessayer", () => {
      options.onHide?.();
      void runDeleteWithRetry({ ...options, attempt: attempt + 1 });
    });
  }
}
