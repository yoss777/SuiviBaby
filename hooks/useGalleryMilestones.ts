// hooks/useGalleryMilestones.ts
//
// S7.4 : jalons de la galerie paginés par 60. La première page (la plus
// récente) reste en direct (écouteur) ; les pages suivantes sont lues à la
// demande, au défilement. Avant : tout l'historique des jalons était relu et
// écouté à chaque ouverture.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { getEventDoc, getMilestonesPageAfter } from "@/services/eventsRepository";
import { ecouterEvenements, JalonEvent } from "@/services/eventsService";
import { getDateTime } from "@/utils/date";

export type GalleryMilestoneEvent = JalonEvent & { id: string };

/** Nombre de jalons lus par page. */
export const GALLERY_PAGE_SIZE = 60;

const byDateDesc = (a: GalleryMilestoneEvent, b: GalleryMilestoneEvent) =>
  getDateTime(b.date) - getDateTime(a.date);

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
  const oldestInPage = Math.min(...firstPage.map((e) => getDateTime(e.date)));
  const kept = previous.filter(
    (e) => !pageIds.has(e.id) && getDateTime(e.date) <= oldestInPage,
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

const EMPTY_EVENTS: GalleryMilestoneEvent[] = [];

export function useGalleryMilestones(childId: string | undefined) {
  // Les jalons sont rattachés à l'enfant qui les a produits : après un changement
  // d'enfant, ceux du précédent ne sont jamais exposés (même une frame).
  const [eventsState, setEventsState] = useState<{
    childId: string | undefined;
    events: GalleryMilestoneEvent[];
  }>({ childId, events: EMPTY_EVENTS });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);
  const eventsRef = useRef<GalleryMilestoneEvent[]>([]);
  const loadingMoreRef = useRef(false);
  // Jeton par appel de loadMore : seul le dernier appel peut relâcher le drapeau.
  const loadTokenRef = useRef(0);
  // Vrai après « tirer pour rafraîchir » : la prochaine première page remplace tout
  // (les pages suivantes ne sont plus réconciliées, elles sont relues à la demande).
  const resetPagesRef = useRef(false);
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
    setEventsState({ childId: childIdRef.current, events: next });
  }, []);

  /** Première page : reçue de l'écouteur ou d'une relecture serveur. */
  const applyFirstPageResult = useCallback(
    (page: GalleryMilestoneEvent[]) => {
      if (!isMountedRef.current) return;
      const resetPages = resetPagesRef.current;
      resetPagesRef.current = false;
      const next = resetPages
        ? applyFirstPage([], page)
        : applyFirstPage(eventsRef.current, page);
      // Une première page incomplète = tout l'historique est chargé.
      if (page.length < GALLERY_PAGE_SIZE) setHasMore(false);
      else if (resetPages || eventsRef.current.length <= GALLERY_PAGE_SIZE) setHasMore(true);
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
      loadTokenRef.current += 1;
      resetPagesRef.current = false;
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
    if (eventsRef.current.length === 0) return;

    const token = ++loadTokenRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      // Curseur = document du dernier jalon chargé (départage les dates égales).
      // Un jalon supprimé entre-temps est retiré de la liste locale et on prend
      // le précédent comme curseur (sinon la pagination resterait bloquée).
      let cursor: DocumentSnapshot | null = null;
      while (eventsRef.current.length > 0) {
        const oldest = eventsRef.current[eventsRef.current.length - 1];
        const candidate = await getEventDoc(oldest.id);
        if (!isMountedRef.current || childIdRef.current !== cid) return;
        if (candidate.exists()) {
          cursor = candidate;
          break;
        }
        commit(eventsRef.current.filter((e) => e.id !== oldest.id));
      }
      if (!cursor) {
        // Plus aucun curseur valide : on repart de la première page.
        resetPagesRef.current = true;
        setRetryCount((c) => c + 1);
        return;
      }
      const snapshot = await getMilestonesPageAfter(cid, cursor, GALLERY_PAGE_SIZE);
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
      if (loadTokenRef.current === token) {
        loadingMoreRef.current = false;
        if (isMountedRef.current) setLoadingMore(false);
      }
    }
  }, [hasMore, commit]);

  /** Tirer pour rafraîchir : relance l'écouteur, la liste affichée reste en place. */
  const reload = useCallback(() => {
    resetPagesRef.current = true;
    setRetryCount((c) => c + 1);
  }, []);

  /** Après une erreur : repart de zéro avec l'écran de chargement. */
  const retry = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    commit([]);
    setHasMore(false);
    setRetryCount((c) => c + 1);
  }, [commit]);

  const isCurrent = eventsState.childId === childId;
  return {
    events: isCurrent ? eventsState.events : EMPTY_EVENTS,
    loaded: isCurrent && loaded,
    loadError: isCurrent && loadError,
    hasMore: isCurrent && hasMore,
    loadingMore: isCurrent && loadingMore,
    loadMore,
    reload,
    retry,
    applyFirstPageResult,
  };
}
