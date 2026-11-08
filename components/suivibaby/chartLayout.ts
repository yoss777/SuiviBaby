import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

/** Hauteur de la zone graphique (Canvas) partagée par Repas, Sommeil et Pompages. */
export const CHART_HEIGHT = 210;

/** Marge verticale du conteneur du graphique (styles.chartContainer). */
export const CHART_CONTAINER_MARGIN_VERTICAL = 4;

/**
 * Hauteur minimale réservée à l'état vide (« Aucune donnée cette semaine ») :
 * exactement la place occupée par la zone graphique, marges comprises.
 * Ainsi la carte ne rétrécit pas quand un filtre n'a pas de données.
 */
export const CHART_EMPTY_STATE_HEIGHT =
  CHART_HEIGHT + 2 * CHART_CONTAINER_MARGIN_VERTICAL;

/**
 * Mémorise la hauteur du dernier bloc « avec données » (métriques + légende +
 * graphique + stats) pour que l'état vide occupe la même hauteur : en passant
 * d'un filtre avec données à un filtre vide, la carte garde sa taille et la
 * mise en page ne saute pas. Tant qu'aucun bloc n'a été mesuré, on réserve au
 * minimum la hauteur de la zone graphique.
 */
export function useStableChartBlockHeight() {
  const [contentHeight, setContentHeight] = useState(0);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next <= 0) return;
    setContentHeight((prev) => (prev === next ? prev : next));
  }, []);

  return {
    onContentLayout,
    emptyMinHeight: Math.max(CHART_EMPTY_STATE_HEIGHT, contentHeight),
  };
}
