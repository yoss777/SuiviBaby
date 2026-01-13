import { useCallback, useEffect, useRef, useState } from "react";
import { collection, DocumentSnapshot, getDocs, limit, onSnapshot, orderBy, query, Query, QueryConstraint, startAfter, where } from "firebase/firestore";
import { db } from "@/config/firebase";

// ============================================
// TYPES
// ============================================

export interface PaginationConfig {
  pageSize?: number;
  initialLoad?: boolean;
  enableRealtime?: boolean;
}

export interface PaginationState {
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  totalLoaded: number;
}

export interface UsePaginatedEventsReturn<T> {
  data: T[];
  pagination: PaginationState;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

// ============================================
// HOOK
// ============================================

export function usePaginatedEvents<T extends { id: string; date?: { seconds: number }; createdAt?: { seconds: number } }>(
  childId: string | undefined,
  eventType: string,
  config: PaginationConfig = {}
): UsePaginatedEventsReturn<T> {
  const {
    pageSize = 30, // ~1 mois de données par défaut (1 événement/jour)
    initialLoad = true,
    enableRealtime = true,
  } = config;

  const [data, setData] = useState<T[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    hasMore: false, // Initialisé à false, sera mis à true après le premier chargement
    loading: false,
    loadingMore: false,
    error: null,
    totalLoaded: 0,
  });

  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initialLoadDoneRef = useRef(false);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const buildQuery = useCallback(
    (withPagination = false): Query | null => {
      if (!childId) return null;

      const constraints: QueryConstraint[] = [
        where("childId", "==", childId),
        where("type", "==", eventType),
        orderBy("date", "desc"),
      ];

      if (withPagination) {
        constraints.push(limit(pageSize));
        if (lastDocRef.current) {
          constraints.push(startAfter(lastDocRef.current));
        }
      } else {
        // Pour le temps réel, limiter aux N derniers
        constraints.push(limit(pageSize));
      }

      return query(collection(db, "events"), ...constraints);
    },
    [childId, eventType, pageSize]
  );

  const fetchPage = useCallback(
    async (isLoadMore = false) => {
      if (!childId) return;

      if (isLoadMore) {
        if (!pagination.hasMore || pagination.loadingMore) return;
        setPagination((prev) => ({ ...prev, loadingMore: true, error: null }));
      } else {
        setPagination((prev) => ({ ...prev, loading: true, error: null }));
      }

      try {
        const q = buildQuery(true);
        if (!q) return;

        const snapshot = await getDocs(q);
        const newData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];

        // Mettre à jour le dernier document pour la pagination
        if (snapshot.docs.length > 0) {
          lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }

        const hasMore = snapshot.docs.length === pageSize;

        setData((prev) => (isLoadMore ? [...prev, ...newData] : newData));
        setPagination((prev) => ({
          ...prev,
          hasMore,
          loading: false,
          loadingMore: false,
          totalLoaded: prev.totalLoaded + newData.length,
        }));
      } catch (error) {
        console.error("Erreur pagination:", error);
        setPagination((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: (error as Error).message,
        }));
      }
    },
    [childId, buildQuery, pageSize, pagination.hasMore, pagination.loadingMore]
  );

  const setupRealtimeListener = useCallback(() => {
    if (!childId || !enableRealtime) return;

    const q = buildQuery(false);
    if (!q) return;

    // Nettoyer l'ancien listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Créer le nouveau listener
    unsubscribeRef.current = onSnapshot(
      q,
      (snapshot) => {
        const realtimeData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];

        // Si c'est le premier chargement, utiliser les données du listener
        if (!initialLoadDoneRef.current) {
          console.log(`[usePaginatedEvents] Premier chargement pour type "${eventType}": ${realtimeData.length} items`);
          setData(realtimeData);
          initialLoadDoneRef.current = true;

          // IMPORTANT: Définir le curseur de pagination pour éviter les doublons
          if (snapshot.docs.length > 0) {
            lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
          }

          // Déterminer s'il y a plus de données à charger
          const hasMore = snapshot.docs.length === pageSize;
          console.log(`[usePaginatedEvents] hasMore pour "${eventType}": ${hasMore} (chargé: ${snapshot.docs.length}, pageSize: ${pageSize})`);

          setPagination((prev) => ({
            ...prev,
            hasMore,
            loading: false,
            totalLoaded: realtimeData.length,
          }));
        } else {
          // Sinon, mettre à jour uniquement les N premiers éléments (temps réel)
          setData((prev) => {
            const oldData = prev.slice(pageSize);
            return [...realtimeData, ...oldData];
          });
        }
      },
      (error) => {
        console.error("Erreur listener temps réel:", error);
        setPagination((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error).message,
        }));
      }
    );
  }, [childId, buildQuery, enableRealtime, pageSize, eventType]);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    if (!childId || !initialLoad) return;

    if (enableRealtime) {
      setPagination((prev) => ({ ...prev, loading: true }));
      setupRealtimeListener();
    } else {
      fetchPage(false);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [childId, initialLoad, enableRealtime]); // Ne pas inclure setupRealtimeListener et fetchPage

  // ============================================
  // PUBLIC API
  // ============================================

  const loadMore = useCallback(async () => {
    await fetchPage(true);
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    lastDocRef.current = null;
    initialLoadDoneRef.current = false;
    setPagination({
      hasMore: true,
      loading: false,
      loadingMore: false,
      error: null,
      totalLoaded: 0,
    });

    if (enableRealtime) {
      setupRealtimeListener();
    } else {
      await fetchPage(false);
    }
  }, [enableRealtime, setupRealtimeListener, fetchPage]);

  const reset = useCallback(() => {
    setData([]);
    lastDocRef.current = null;
    initialLoadDoneRef.current = false;
    setPagination({
      hasMore: true,
      loading: false,
      loadingMore: false,
      error: null,
      totalLoaded: 0,
    });

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  return {
    data,
    pagination,
    loadMore,
    refresh,
    reset,
  };
}
