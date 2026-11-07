// Fenêtre de dates chargée par les écrans de liste : 14 jours se terminant à
// 23:59:59.999, élargie par « Voir plus » et par le chargement automatique
// quand le filtre ne montre rien. Machine à états reprise telle quelle de
// l'écran Pompages (avant Sprint 13), sauf le mode « extend » : la fin de la
// fenêtre reste fixe (les anciens écrans la déplaçaient sur l'événement trouvé
// et sortaient les jours récents de l'écouteur).
import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import {
  getNextEventDateBefore,
  hasMoreEventsBefore,
  type EventType,
} from "@/services/eventsService";

export const DEFAULT_DAYS_WINDOW = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Un seul type : chaîne (comme avant) ; plusieurs : tableau. */
export function typesArg(eventTypes: readonly EventType[]): EventType | EventType[] {
  return eventTypes.length === 1 ? eventTypes[0] : [...eventTypes];
}

/** Bornes de la fenêtre : [début du 1er jour, fin du dernier jour]. */
export function computeRange(rangeEndDate: Date | null, daysWindow: number) {
  const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
  endOfRange.setHours(23, 59, 59, 999);
  const startOfRange = new Date(endOfRange);
  startOfRange.setHours(0, 0, 0, 0);
  startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
  return { startOfRange, endOfRange };
}

type Options = {
  childId: string | undefined;
  eventTypes: readonly EventType[];
  jumpToLatestOnMount: boolean;
  loadMore: { jumpOnManual: boolean; jumpWindow: "extend" | "reset" };
};

export function useEventWindow({ childId, eventTypes, jumpToLatestOnMount, loadMore }: Options) {
  const [daysWindow, setDaysWindow] = useState(DEFAULT_DAYS_WINDOW);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  // Version de la fenêtre au moment d'un « Voir plus » : seul l'écouteur
  // abonné après ce clic décompte les réponses attendues.
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  // Les types sont une constante de config : on les fige pour les dépendances.
  const typesRef = useRef(eventTypes);
  typesRef.current = eventTypes;
  const typesKey = eventTypes.join(",");
  const { jumpOnManual, jumpWindow } = loadMore;

  // Changement d'enfant : fenêtre par défaut.
  useEffect(() => {
    if (!childId) return;
    setDaysWindow(DEFAULT_DAYS_WINDOW);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [childId]);

  // Au montage : fenêtre terminée au dernier événement (pas de liste vide si
  // rien n'a été saisi depuis deux semaines).
  useEffect(() => {
    if (!childId || !jumpToLatestOnMount) return;
    let cancelled = false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    getNextEventDateBefore(childId, typesArg(typesRef.current), endOfToday)
      .then((nextDate) => {
        if (cancelled) return;
        setDaysWindow(DEFAULT_DAYS_WINDOW);
        setRangeEndDate(nextDate ?? endOfToday);
      })
      .catch(() => {
        if (cancelled) return;
        setDaysWindow(DEFAULT_DAYS_WINDOW);
        setRangeEndDate(endOfToday);
      });

    return () => {
      cancelled = true;
    };
  }, [childId, jumpToLatestOnMount, typesKey]);

  // Après un enregistrement : la fenêtre doit inclure aujourd'hui.
  const ensureTodayInRange = useCallback(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    setRangeEndDate((prev) => {
      if (!prev) {
        setDaysWindow(DEFAULT_DAYS_WINDOW);
        return endOfToday;
      }
      if (prev >= endOfToday) return prev;
      const diffDays = Math.ceil((endOfToday.getTime() - prev.getTime()) / DAY_MS);
      setDaysWindow((window) => window + diffDays);
      return endOfToday;
    });
  }, []);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !childId) return;
      setIsLoadingMore(true);
      // Une réponse attendue par écouteur (un par type).
      pendingLoadMoreRef.current = typesRef.current.length;
      loadMoreVersionRef.current += 1;

      const { endOfRange, startOfRange } = computeRange(rangeEndDate, daysWindow);
      const beforeDate = new Date(startOfRange.getTime() - 1);

      const exhaustedAuto = auto && autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1;
      if ((!auto && jumpOnManual) || exhaustedAuto) {
        // Clic manuel ou auto qui a épuisé ses tentatives : sauter directement au prochain événement
        let nextEventDate: Date | null;
        try {
          nextEventDate = await getNextEventDateBefore(
            childId,
            typesArg(typesRef.current),
            beforeDate,
          );
        } catch {
          // Échec réseau/Firestore : pas d'écouteur à attendre, on libère le bouton.
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
          setAutoLoadMore(false);
          return;
        }

        if (nextEventDate) {
          if (jumpWindow === "reset") {
            setDaysWindow(DEFAULT_DAYS_WINDOW);
            setRangeEndDate(nextEventDate);
          } else {
            // « extend » : la fin de la fenêtre ne bouge pas (les jours récents
            // restent écoutés) ; seule sa longueur grandit jusqu'au prochain événement.
            const startOfNext = new Date(nextEventDate);
            startOfNext.setHours(0, 0, 0, 0);
            const diffDays =
              Math.floor((endOfRange.getTime() - startOfNext.getTime()) / DAY_MS) + 1;
            setDaysWindow((prev) => Math.max(prev, diffDays));
          }
        } else {
          setHasMore(false);
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
          setAutoLoadMore(false);
        }
      } else {
        setDaysWindow((prev) => prev + DEFAULT_DAYS_WINDOW);
      }

      if (!auto) {
        setAutoLoadMore(true);
        setAutoLoadMoreAttempts(0);
      }
    },
    [hasMore, childId, autoLoadMoreAttempts, daysWindow, rangeEndDate, jumpOnManual, jumpWindow],
  );

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  // Recalculer hasMore uniquement quand la fenêtre change pour éviter les requêtes inutiles.
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    const { startOfRange } = computeRange(rangeEndDate, daysWindow);
    const beforeDate = new Date(startOfRange.getTime() - 1);

    setHasMore(true);
    hasMoreEventsBefore(childId, typesArg(typesRef.current), beforeDate)
      .then((result) => {
        if (!cancelled) setHasMore(result);
      })
      .catch(() => {
        if (!cancelled) setHasMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [childId, daysWindow, rangeEndDate, typesKey]);

  /** Appelé par chaque écouteur à chaque snapshot (garde de version). */
  const notifySnapshot = useCallback((versionAtSubscribe: number) => {
    if (pendingLoadMoreRef.current > 0 && versionAtSubscribe === loadMoreVersionRef.current) {
      pendingLoadMoreRef.current -= 1;
      if (pendingLoadMoreRef.current <= 0) {
        setIsLoadingMore(false);
      }
    }
  }, []);

  return {
    daysWindow,
    rangeEndDate,
    hasMore,
    isLoadingMore,
    autoLoadMore,
    autoLoadMoreAttempts,
    setAutoLoadMore,
    setAutoLoadMoreAttempts,
    loadMoreStep,
    handleLoadMore,
    ensureTodayInRange,
    notifySnapshot,
    loadMoreVersionRef,
    pendingLoadMoreRef,
  };
}

export type EventWindow = ReturnType<typeof useEventWindow>;

/**
 * Chargement automatique : tant que le filtre « passé » (ou aucun filtre) ne
 * montre rien et qu'il reste de l'historique, élargir la fenêtre, au plus
 * MAX_AUTO_LOAD_ATTEMPTS fois (la dernière saute au prochain événement).
 */
export function useAutoLoadMore(
  window: EventWindow,
  {
    loaded,
    groupsCount,
    blocked,
  }: {
    loaded: boolean;
    groupsCount: number;
    /** Filtre « aujourd'hui » ou date choisie : pas de chargement automatique. */
    blocked: boolean;
  },
) {
  const {
    autoLoadMore,
    autoLoadMoreAttempts,
    hasMore,
    isLoadingMore,
    loadMoreStep,
    setAutoLoadMore,
    setAutoLoadMoreAttempts,
  } = window;

  useEffect(() => {
    if (blocked) return;
    if (!autoLoadMore && loaded && groupsCount === 0 && hasMore) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [autoLoadMore, loaded, groupsCount, hasMore, blocked, setAutoLoadMore, setAutoLoadMoreAttempts]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!loaded || isLoadingMore) return;
    if (groupsCount > 0 || !hasMore) {
      setAutoLoadMore(false);
      setAutoLoadMoreAttempts(0);
      return;
    }
    if (autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS) {
      setAutoLoadMore(false);
      return;
    }
    setAutoLoadMoreAttempts((prev) => prev + 1);
    loadMoreStep(true);
  }, [
    autoLoadMore,
    loaded,
    isLoadingMore,
    groupsCount,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
    setAutoLoadMore,
    setAutoLoadMoreAttempts,
  ]);
}
