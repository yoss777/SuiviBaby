import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildEventFingerprint,
  mergeWithFirestoreEvents,
  subscribe as subscribeOptimistic,
} from "@/services/optimisticEventsStore";

type UseMergedOptimisticEventsParams<T> = {
  childId: string | undefined;
  debounceMs?: number;
  transformMerged?: (events: any[]) => T[];
  /**
   * Types d'événements affichés par l'écran. Le store optimiste contient les
   * saisies en attente de TOUS les types de l'enfant : sans ce filtre, un
   * biberon saisi hors ligne apparaissait dans Routines (et y plantait, faute
   * de config pour ce type). Absent = aucun filtre (écrans multi-types).
   */
  eventTypes?: readonly string[];
};

type UseMergedOptimisticEventsResult<T> = {
  mergedEvents: T[];
  setFirestoreEvents: (
    events: any[],
    options?: { preserveExisting?: boolean },
  ) => void;
  /**
   * Force une re-fusion locale (firestore events + optimistic store) et
   * reset le fingerprint pour garantir une re-émission vers React.
   *
   * ⚠️ NE DÉCLENCHE AUCUN REFETCH FIRESTORE. Si la donnée en mémoire est
   * obsolète (listener endormi, cache stale après background prolongé),
   * appelez `obtenirEvenements(...)` puis `setFirestoreEvents(fresh)`
   * pour un vrai refresh serveur. Voir home.tsx `handleAppStateChange`.
   *
   * Alias exposé : `recomputeMerged`.
   */
  refreshMerged: () => void;
  /** Alias honnête de `refreshMerged` — même fonction, nom non trompeur. */
  recomputeMerged: () => void;
  /**
   * Re-fusion locale sans reset du fingerprint : n'émet vers React que si le
   * résultat a changé (ex. mise à jour optimiste manquée pendant que l'écran
   * était gelé). Évite un re-render complet à chaque retour sur l'écran.
   */
  remergeIfChanged: () => void;
};

export function mergeFirestoreSnapshots(current: any[], incoming: any[]): any[] {
  const mergedById = new Map<string, any>();

  // Non-destructive refresh only. This is intentionally not an authoritative
  // server merge: one-shot reads can lag behind recent optimistic writes, so
  // current wins for matching ids. Deletions and concurrent server updates are
  // reconciled by the real-time listener, which calls setFirestoreEvents
  // without preserveExisting.
  for (const event of current) {
    if (event?.id) {
      mergedById.set(event.id, event);
    }
  }

  for (const event of incoming) {
    if (event?.id && !mergedById.has(event.id)) {
      mergedById.set(event.id, event);
    }
  }

  return [...mergedById.values()];
}

/** Keeps only the screen's event types (no filter when `types` is absent). */
export function filterTypes(events: any[], types: readonly string[] | undefined): any[] {
  if (!types) return events;
  return events.filter((event) => types.includes(event?.type));
}

// Fingerprint of an empty list: the initial state, so mounting does not emit
// a fresh [] (and re-render the screen) for nothing.
const EMPTY_FINGERPRINT = buildEventFingerprint([]);
type MergedState<T> = { events: T[]; fingerprint: string };
const EMPTY_STATE: MergedState<any> = { events: [], fingerprint: EMPTY_FINGERPRINT };

export function useMergedOptimisticEvents<T = any>({
  childId,
  debounceMs = 50,
  transformMerged,
  eventTypes,
}: UseMergedOptimisticEventsParams<T>): UseMergedOptimisticEventsResult<T> {
  // The fingerprint travels with the events it describes, so we always know
  // what is actually rendered (see remergeIfChanged).
  const [mergedState, setMergedState] = useState<MergedState<T>>(EMPTY_STATE);
  const mergedEvents = mergedState.events;
  const latestFirestoreEventsRef = useRef<any[]>([]);
  const lastFingerprintRef = useRef(EMPTY_FINGERPRINT);
  const renderedFingerprintRef = useRef(EMPTY_FINGERPRINT);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const childIdRef = useRef(childId);
  const debounceMsRef = useRef(debounceMs);
  const transformMergedRef = useRef(transformMerged);
  const eventTypesRef = useRef(eventTypes);
  eventTypesRef.current = eventTypes;

  useEffect(() => {
    childIdRef.current = childId;
  }, [childId]);

  useEffect(() => {
    debounceMsRef.current = debounceMs;
  }, [debounceMs]);

  useEffect(() => {
    transformMergedRef.current = transformMerged;
  }, [transformMerged]);

  const scheduleMerge = useCallback(() => {
    if (!childIdRef.current) return;

    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
    }

    mergeTimerRef.current = setTimeout(() => {
      const merged = filterTypes(
        mergeWithFirestoreEvents(
          latestFirestoreEventsRef.current,
          childIdRef.current!,
        ),
        eventTypesRef.current,
      );
      const normalized = transformMergedRef.current
        ? transformMergedRef.current(merged)
        : (merged as T[]);
      const fingerprint = buildEventFingerprint(normalized as any[]);

      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;
      setMergedState({ events: normalized, fingerprint });
    }, debounceMsRef.current);
  }, []);

  const setFirestoreEvents = useCallback(
    (events: any[], options?: { preserveExisting?: boolean }) => {
      latestFirestoreEventsRef.current = options?.preserveExisting
        ? mergeFirestoreSnapshots(latestFirestoreEventsRef.current, events)
        : events;
      scheduleMerge();
    },
    [scheduleMerge],
  );

  // Re-fusion locale uniquement. N'appelle PAS Firestore — ne corrige pas un
  // cache stale. Pour un vrai refresh serveur, refetch via obtenirEvenements
  // puis appeler setFirestoreEvents(fresh).
  const refreshMerged = useCallback(() => {
    lastFingerprintRef.current = "";
    scheduleMerge();
  }, [scheduleMerge]);

  useEffect(() => {
    renderedFingerprintRef.current = mergedState.fingerprint;
  }, [mergedState]);

  // Compare with what is rendered, not with what was last sent: if an update
  // sent while the screen was frozen never got committed, force it again.
  const remergeIfChanged = useCallback(() => {
    if (renderedFingerprintRef.current !== lastFingerprintRef.current) {
      lastFingerprintRef.current = "";
    }
    scheduleMerge();
  }, [scheduleMerge]);

  useEffect(() => {
    // Reset à chaque changement de childId (y compris childA → childB)
    // pour éviter de montrer les événements de l'ancien enfant.
    latestFirestoreEventsRef.current = [];
    lastFingerprintRef.current = EMPTY_FINGERPRINT;
    setMergedState((prev) => (prev.events.length === 0 ? prev : EMPTY_STATE));

    if (!childId) {
      return;
    }

    const unsubscribe = subscribeOptimistic(scheduleMerge);

    return () => {
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [childId, scheduleMerge]);

  return {
    mergedEvents,
    setFirestoreEvents,
    refreshMerged,
    recomputeMerged: refreshMerged,
    remergeIfChanged,
  };
}
