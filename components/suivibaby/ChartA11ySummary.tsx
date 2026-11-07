import { useCallback, useEffect, useState } from "react";
import {
  type AccessibilityActionEvent,
  StyleSheet,
  View,
} from "react-native";

type Props = {
  /** Titre du graphique, lu en premier (ex. « Graphique des repas de la semaine »). */
  title: string;
  /** Une phrase par jour : « Mardi 4 novembre : 6 repas, 720 ml ». */
  entries: string[];
  /**
   * Identifiant de la période affichée (ex. début de semaine en ms, filtre) :
   * quand il change, on repart du premier jour même si le nombre de jours est
   * identique (changer de semaine garde 7 entrées).
   */
  periodKey?: string | number;
};

const ACTIONS = [
  { name: "increment", label: "Jour suivant" },
  { name: "decrement", label: "Jour précédent" },
] as const;

/**
 * Remplace le canevas Skia (muet pour les lecteurs d'écran) par un élément
 * ajustable : glisser vers le haut/bas (VoiceOver) ou utiliser les actions
 * (TalkBack) parcourt les jours, chaque valeur étant lue en toutes lettres.
 * À placer en dernier enfant d'un conteneur `position: relative` ; il ne
 * capte aucun toucher (le geste tactile du graphique reste intact).
 */
export function ChartA11ySummary({ title, entries, periodKey }: Props) {
  const [index, setIndex] = useState(0);

  // La semaine ou le filtre change : on repart du premier jour.
  useEffect(() => {
    setIndex(0);
  }, [title, entries.length, periodKey]);

  const hasEntries = entries.length > 0;
  const safeIndex = Math.min(index, Math.max(entries.length - 1, 0));

  const move = useCallback(
    (delta: number) => {
      if (entries.length === 0) return;
      const next = Math.min(Math.max(safeIndex + delta, 0), entries.length - 1);
      if (next === safeIndex) return;
      // Pas d'annonce explicite : iOS relit la valeur d'un élément ajustable et,
      // sur Android, React Native met à jour la description du nœud focalisé
      // (valeur texte), que TalkBack relit déjà. Une annonce en plus doublait
      // la lecture.
      setIndex(next);
    },
    [entries.length, safeIndex],
  );

  const onAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") move(1);
      else if (event.nativeEvent.actionName === "decrement") move(-1);
    },
    [move],
  );

  // Aucune donnée : simple texte, ni « Jour 1 sur 0 » ni actions inopérantes.
  if (!hasEntries) {
    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}. Aucune donnée pour cette période.`}
      />
    );
  }

  // Le libellé reste stable (titre seul) ; la position et la phrase du jour
  // passent dans la valeur, seule partie relue quand on change de jour. Le
  // mode d'emploi du geste est fourni par le lecteur d'écran (rôle ajustable).
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title}
      accessibilityValue={{
        text: `${entries[safeIndex]}, jour ${safeIndex + 1} sur ${entries.length}`,
      }}
      accessibilityActions={ACTIONS as unknown as { name: string; label: string }[]}
      onAccessibilityAction={onAction}
    />
  );
}
