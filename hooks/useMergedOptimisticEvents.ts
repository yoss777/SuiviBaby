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
  setFirestoreEvents: (events: any[]) => void;
  refreshMerged: () => void;
};

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
    (events: any[]) => {
      latestFirestoreEventsRef.current = events;
      scheduleMerge();
    },
    [scheduleMerge],
  );

  const refreshMerged = useCallback(() => {
    lastFingerprintRef.current = "";
    scheduleMerge();
  }, [scheduleMerge]);

  useEffect(() => {
    if (!childId) {
      latestFirestoreEventsRef.current = [];
      lastFingerprintRef.current = "";
      setMergedEvents([]);
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
