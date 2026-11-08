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
 * Mémorise la plus grande hauteur mesurée du bloc « avec données » (métriques
 * + légendes + graphique + stats). L'état vide et le bloc avec données la
 * reprennent en hauteur minimale : en changeant de filtre (ex. « Tous », qui a
 * une ligne de légende de plus, puis « Bib »), la carte garde sa taille et la
 * mise en page ne saute pas. Tant qu'aucun bloc n'a été mesuré, l'état vide
 * réserve au minimum la hauteur de la zone graphique.
 */
export function useStableChartBlockHeight() {
  const [contentHeight, setContentHeight] = useState(0);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next <= 0) return;
    setContentHeight((prev) => (next > prev ? next : prev));
  }, []);

  return {
    onContentLayout,
    emptyMinHeight: Math.max(CHART_EMPTY_STATE_HEIGHT, contentHeight),
    /** Hauteur minimale du bloc avec données (undefined avant la 1re mesure). */
    dataMinHeight: contentHeight > 0 ? contentHeight : undefined,
  };
}
