// Données d'un écran de liste : un écouteur Firestore par type sur la
// fenêtre courante, fusion avec les saisies optimistes, relecture serveur au
// retour au premier plan et tirer-pour-rafraîchir.
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";

import { useForegroundServerRefresh } from "@/hooks/useForegroundServerRefresh";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { ecouterEvenements, obtenirEvenements, type EventType } from "@/services/eventsService";

import { computeRange, typesArg, type EventWindow } from "./useEventWindow";

type Options<T> = {
  childId: string | undefined;
  eventTypes: readonly EventType[];
  normalizeSnapshot?: (events: any[], type: EventType) => T[];
  sortMerged?: (merged: any[]) => T[];
  window: Pick<EventWindow, "daysWindow" | "rangeEndDate" | "loadMoreVersionRef" | "notifySnapshot">;
};

export function useEventListData<T extends { id: string; type?: string }>({
  childId,
  eventTypes,
  normalizeSnapshot,
  sortMerged,
  window,
}: Options<T>) {
  const { daysWindow, rangeEndDate, loadMoreVersionRef, notifySnapshot } = window;
  const [loadedTypes, setLoadedTypes] = useState<ReadonlySet<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    mergedEvents: items,
    setFirestoreEvents,
    refreshMerged,
  } = useMergedOptimisticEvents<T>({
    childId,
    eventTypes,
    transformMerged: sortMerged,
  });

  // Dernier snapshot de chaque type : la liste fusionnée les concatène.
  const latestByTypeRef = useRef<Map<string, T[]>>(new Map());
  const typesRef = useRef(eventTypes);
  typesRef.current = eventTypes;
  const normalizeRef = useRef(normalizeSnapshot);
  normalizeRef.current = normalizeSnapshot;
  const typesKey = eventTypes.join(",");

  const normalize = useCallback(
    (events: any[], type: EventType): T[] =>
      normalizeRef.current ? normalizeRef.current(events, type) : (events as T[]),
    [],
  );

  const pushFirestoreEvents = useCallback(() => {
    setFirestoreEvents(typesRef.current.flatMap((type) => latestByTypeRef.current.get(type) ?? []));
  }, [setFirestoreEvents]);

  // Changement d'enfant : tout recharger.
  useEffect(() => {
    if (!childId) return;
    setLoadedTypes(new Set());
    latestByTypeRef.current = new Map();
  }, [childId]);

  useEffect(() => {
    if (!childId) return;
    setLoadError(false);
    const versionAtSubscribe = loadMoreVersionRef.current;
    const { startOfRange, endOfRange } = computeRange(rangeEndDate, daysWindow);
    const types = typesRef.current;
    latestByTypeRef.current = new Map();
    let refreshCleared = false;

    const handleListenerError = () => {
      setLoadError(true);
      setIsRefreshing(false);
      setLoadedTypes(new Set(types));
    };

    const markLoaded = (type: string) =>
      setLoadedTypes((prev) => {
        if (prev.has(type)) return prev;
        const next = new Set(prev);
        next.add(type);
        return next;
      });

    const unsubscribers = types.map((type, index) =>
      ecouterEvenements(
        childId,
        (events: any[]) => {
          latestByTypeRef.current.set(type, normalize(events, type));
          markLoaded(type);
          // Le type principal arrête l'indicateur de rafraîchissement.
          if (index === 0 && !refreshCleared) {
            refreshCleared = true;
            setIsRefreshing(false);
          }
          notifySnapshot(versionAtSubscribe);
          pushFirestoreEvents();
        },
        { type, waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
        handleListenerError,
      ),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    childId,
    daysWindow,
    rangeEndDate,
    refreshKey,
    typesKey,
    loadMoreVersionRef,
    normalize,
    notifySnapshot,
    pushFirestoreEvents,
  ]);

  useForegroundServerRefresh({
    enabled: !!childId,
    childId,
    refresh: async () => {
      if (!childId) return [];
      const { startOfRange, endOfRange } = computeRange(rangeEndDate, daysWindow);
      return obtenirEvenements(childId, {
        type: typesArg(typesRef.current),
        depuis: startOfRange,
        jusqu: endOfRange,
        source: "server",
      });
    },
    apply: (freshEvents: any[]) => {
      const next = new Map<string, T[]>();
      typesRef.current.forEach((type) => {
        next.set(
          type,
          normalize(
            freshEvents.filter((event) => event.type === type),
            type,
          ),
        );
      });
      latestByTypeRef.current = next;
      pushFirestoreEvents();
    },
  });

  // Re-merge on tab focus — frozen tabs miss state updates
  useFocusEffect(
    useCallback(() => {
      refreshMerged();
    }, [refreshMerged]),
  );

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const loaded = eventTypes.every((type) => loadedTypes.has(type));

  return { items, loaded, loadError, isRefreshing, handlePullToRefresh };
}
