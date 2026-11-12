// Ids masqués d'une liste : état local de l'écran (suppressions groupées,
// purge quand les données changent) réuni avec les ids masqués partagés
// (suppressions unitaires en attente, y compris depuis une feuille d'édition
// ou un écran quitté avant la fin du délai d'annulation).
// Même signature que useState : le setter ne touche que l'état local.
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  getSoftDeletedIds,
  subscribeSoftDeletedIds,
} from "@/utils/softDeletedStore";

export function useGlobalSoftDeletedIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeSoftDeletedIds, getSoftDeletedIds, getSoftDeletedIds);
}

export function useSoftDeletedIds(): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [local, setLocal] = useState<Set<string>>(() => new Set());
  const shared = useGlobalSoftDeletedIds();
  const merged = useMemo(() => {
    if (shared.size === 0) return local;
    if (local.size === 0) return shared as Set<string>;
    const next = new Set(local);
    shared.forEach((id) => next.add(id));
    return next;
  }, [local, shared]);
  return [merged, setLocal];
}
