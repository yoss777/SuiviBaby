// hooks/useGalleryMilestones.ts
//
// S7.4 : jalons de la galerie paginés par 60. La première page (la plus
// récente) reste en direct (écouteur) ; les pages suivantes sont lues à la
// demande, au défilement. Avant : tout l'historique des jalons était relu et
// écouté à chaque ouverture.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { ecouterEvenements, JalonEvent } from "@/services/eventsService";

export type GalleryMilestoneEvent = JalonEvent & { id: string };

/** Nombre de jalons lus par page. */
export const GALLERY_PAGE_SIZE = 60;

const toMillis = (value: unknown): number => {
  const v = value as { seconds?: number; toMillis?: () => number; getTime?: () => number } | null;
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (typeof v.getTime === "function") return v.getTime();
  return new Date(value as string | number).getTime() || 0;
};

const byDateDesc = (a: GalleryMilestoneEvent, b: GalleryMilestoneEvent) =>
  toMillis(b.date) - toMillis(a.date);

/**
 * Applique une nouvelle première page (direct ou relecture serveur) à la liste
 * déjà chargée. Les événements plus anciens que la page, déjà chargés
 * (pages suivantes ou sortis de la fenêtre par un ajout), sont conservés ;
 * ceux de la fenêtre absents de la nouvelle page ont été supprimés.
 */
export function applyFirstPage(
  previous: GalleryMilestoneEvent[],
  firstPage: GalleryMilestoneEvent[],
  pageSize: number = GALLERY_PAGE_SIZE,
): GalleryMilestoneEvent[] {
  if (firstPage.length < pageSize) return [...firstPage].sort(byDateDesc);
  const pageIds = new Set(firstPage.map((e) => e.id));
  const oldestInPage = Math.min(...firstPage.map((e) => toMillis(e.date)));
  const kept = previous.filter(
    (e) => !pageIds.has(e.id) && toMillis(e.date) <= oldestInPage,
  );
  return [...firstPage, ...kept].sort(byDateDesc);
}

/** Ajoute une page plus ancienne (sans doublon). */
export function appendOlderPage(
  previous: GalleryMilestoneEvent[],
  olderPage: GalleryMilestoneEvent[],
): GalleryMilestoneEvent[] {
  const ids = new Set(previous.map((e) => e.id));
  return [...previous, ...olderPage.filter((e) => !ids.has(e.id))].sort(byDateDesc);
}

export function useGalleryMilestones(childId: string | undefined) {
  const [events, setEvents] = useState<GalleryMilestoneEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);
  const eventsRef = useRef<GalleryMilestoneEvent[]>([]);
  const loadingMoreRef = useRef(false);
  const childIdRef = useRef(childId);
  const loadedChildRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const commit = useCallback((next: GalleryMilestoneEvent[]) => {
    eventsRef.current = next;
    setEvents(next);
  }, []);

  /** Première page : reçue de l'écouteur ou d'une relecture serveur. */
  const applyFirstPageResult = useCallback(
    (page: GalleryMilestoneEvent[]) => {
      if (!isMountedRef.current) return;
      const next = applyFirstPage(eventsRef.current, page);
      // Une première page incomplète = tout l'historique est chargé.
      if (page.length < GALLERY_PAGE_SIZE) setHasMore(false);
      else if (eventsRef.current.length <= GALLERY_PAGE_SIZE) setHasMore(true);
      commit(next);
      setLoaded(true);
      setLoadError(false);
    },
    [commit],
  );

  // Première page en direct
  useEffect(() => {
    // Remise à zéro seulement quand l'enfant change (pas au simple rechargement).
    if (loadedChildRef.current !== childId) {
      loadedChildRef.current = childId;
      childIdRef.current = childId;
      commit([]);
      setHasMore(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      setLoaded(false);
      setLoadError(false);
    }
    if (!childId) return;

    const unsubscribe = ecouterEvenements(
      childId,
      (data) => applyFirstPageResult(data as GalleryMilestoneEvent[]),
      { type: "jalon", waitForServer: true, limite: GALLERY_PAGE_SIZE },
      (error) => {
        console.error("[Gallery] Erreur listener jalons:", error);
        if (!isMountedRef.current) return;
        setLoaded(true);
        setLoadError(true);
      },
    );
    return () => unsubscribe();
  }, [childId, retryCount, commit, applyFirstPageResult]);

  /** Page suivante, plus ancienne que le dernier jalon chargé. */
  const loadMore = useCallback(async () => {
    const cid = childIdRef.current;
    if (!cid || loadingMoreRef.current || !hasMore) return;
    const current = eventsRef.current;
    const oldest = current[current.length - 1];
    if (!oldest) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      // Curseur = document du dernier jalon chargé (départage les dates égales).
      const cursor = await getDoc(doc(db, "events", oldest.id));
      if (!isMountedRef.current || childIdRef.current !== cid) return;
      if (!cursor.exists()) {
        // Ce jalon vient d'être supprimé : on repart de la première page.
        setRetryCount((c) => c + 1);
        return;
      }
      const snapshot = await getDocs(
        query(
          collection(db, "events"),
          where("childId", "==", cid),
          where("type", "in", ["jalon"]),
          orderBy("date", "desc"),
          startAfter(cursor),
          limit(GALLERY_PAGE_SIZE),
        ),
      );
      // Enfant changé pendant la lecture : résultat jeté.
      if (!isMountedRef.current || childIdRef.current !== cid) return;
      const page = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as GalleryMilestoneEvent,
      );
      commit(appendOlderPage(eventsRef.current, page));
      setHasMore(page.length >= GALLERY_PAGE_SIZE);
    } catch (error) {
      console.error("[Gallery] Erreur page suivante:", error);
    } finally {
      loadingMoreRef.current = false;
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [hasMore, commit]);

  /** Tirer pour rafraîchir : relance l'écouteur, la liste affichée reste en place. */
  const reload = useCallback(() => setRetryCount((c) => c + 1), []);

  /** Après une erreur : repart de zéro avec l'écran de chargement. */
  const retry = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    commit([]);
    setHasMore(false);
    setRetryCount((c) => c + 1);
  }, [commit]);

  return {
    events,
    loaded,
    loadError,
    hasMore,
    loadingMore,
    loadMore,
    reload,
    retry,
    applyFirstPageResult,
  };
}
