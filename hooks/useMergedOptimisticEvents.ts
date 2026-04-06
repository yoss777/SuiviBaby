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
};

type UseMergedOptimisticEventsResult<T> = {
  mergedEvents: T[];
  setFirestoreEvents: (
    events: any[],
    options?: { preserveExisting?: boolean },
  ) => void;
  refreshMerged: () => void;
};

export function mergeFirestoreSnapshots(current: any[], incoming: any[]): any[] {
  const mergedById = new Map<string, any>();

  // Non-destructive refresh: keep the listener/current version for existing
  // ids because one-shot reads can lag behind recent optimistic writes.
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

export function useMergedOptimisticEvents<T = any>({
  childId,
  debounceMs = 50,
  transformMerged,
}: UseMergedOptimisticEventsParams<T>): UseMergedOptimisticEventsResult<T> {
  const [mergedEvents, setMergedEvents] = useState<T[]>([]);
  const latestFirestoreEventsRef = useRef<any[]>([]);
  const lastFingerprintRef = useRef("");
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const childIdRef = useRef(childId);
  const debounceMsRef = useRef(debounceMs);
  const transformMergedRef = useRef(transformMerged);

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
      const merged = mergeWithFirestoreEvents(
        latestFirestoreEventsRef.current,
        childIdRef.current!,
      );
      const normalized = transformMergedRef.current
        ? transformMergedRef.current(merged)
        : (merged as T[]);
      const fingerprint = buildEventFingerprint(normalized as any[]);

      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;
      setMergedEvents(normalized);
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

  const refreshMerged = useCallback(() => {
    lastFingerprintRef.current = "";
    scheduleMerge();
  }, [scheduleMerge]);

  useEffect(() => {
    // Reset à chaque changement de childId (y compris childA → childB)
    // pour éviter de montrer les événements de l'ancien enfant.
    latestFirestoreEventsRef.current = [];
    lastFingerprintRef.current = "";
    setMergedEvents([]);

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
  };
}
