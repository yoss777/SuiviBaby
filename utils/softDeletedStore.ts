// utils/softDeletedStore.ts
// Ids masqués en attendant la fin du délai d'annulation, partagés par toute
// l'app. Une suppression lancée depuis une feuille d'édition (ou depuis un
// écran qu'on quitte avant 8 s) reste ainsi masquée dans toutes les listes
// jusqu'à « Annuler » (ou jusqu'à la suppression serveur), au lieu de
// réapparaître le temps que le serveur réponde.
import type { SetStateAction } from "react";

let ids: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();

export function getSoftDeletedIds(): ReadonlySet<string> {
  return ids;
}

export function setSoftDeletedIds(action: SetStateAction<Set<string>>): void {
  const next = typeof action === "function" ? action(ids as Set<string>) : action;
  if (next === ids) return;
  ids = next;
  listeners.forEach((listener) => listener());
}

export function subscribeSoftDeletedIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests uniquement. */
export function resetSoftDeletedIdsForTests(): void {
  ids = new Set<string>();
  listeners.forEach((listener) => listener());
}
