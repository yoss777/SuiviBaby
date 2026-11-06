// utils/deleteWithRetry.ts
// Exécute une suppression différée (après le délai d'annulation) et gère
// l'échec : élément ré-affiché, Sentry, bouton « Réessayer ». Le compteur
// d'essais est un paramètre, et les fonctions de toast sont relues à chaque
// fois (getToasts) : pas de fermeture périmée imbriquée sur 3 niveaux.

import { captureServiceError } from "@/utils/errorReporting";
import { DELETE_QUEUED_MESSAGE } from "@/utils/deleteOutcome";

export const MAX_DELETE_ATTEMPTS = 3;

type Toasts = {
  showActionToast: (message: string, actionLabel: string, onAction: () => void, durationMs?: number) => void;
  showToast: (message: string, durationMs?: number) => void;
};

type DeleteResult = "deleted" | "queued" | void;

/**
 * Suppression groupée dont les nouveaux essais ne renvoient QUE les
 * identifiants en échec (Promise.allSettled : un échec n'interrompt pas les
 * autres, et ce qui a réussi n'est pas redemandé — sinon le serveur répond
 * « introuvable » et l'utilisateur voit une erreur pour rien).
 *
 * À passer comme `run` : chaque appel traite les identifiants restants, rejette
 * avec la première vraie erreur s'il en reste, et renvoie sinon tous les
 * résultats (y compris ceux des essais précédents, pour le message « queued »).
 */
export function batchDeleteRun(
  ids: string[],
  deleteOne: (id: string) => Promise<DeleteResult>,
): () => Promise<DeleteResult[]> {
  let remaining = [...ids];
  const outcomes: DeleteResult[] = [];
  return async () => {
    const settled = await Promise.allSettled(remaining.map((id) => deleteOne(id)));
    const failedIds: string[] = [];
    let firstError: unknown;
    let hasError = false;
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        outcomes.push(result.value);
      } else {
        failedIds.push(remaining[index]);
        if (!hasError) {
          hasError = true;
          firstError = result.reason;
        }
      }
    });
    remaining = failedIds;
    if (hasError) throw firstError;
    return outcomes;
  };
}

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
      options.getToasts().showToast(DELETE_QUEUED_MESSAGE);
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
