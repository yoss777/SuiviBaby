import { useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  type AccessibilityActionEvent,
  Platform,
  StyleSheet,
  View,
} from "react-native";

type Props = {
  /** Titre du graphique, lu en premier (ex. « Graphique des repas de la semaine »). */
  title: string;
  /** Une phrase par jour : « Mardi 4 novembre : 6 repas, 720 ml ». */
  entries: string[];
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
export function ChartA11ySummary({ title, entries }: Props) {
  const [index, setIndex] = useState(0);

  // La semaine ou le filtre change : on repart du premier jour.
  useEffect(() => {
    setIndex(0);
  }, [title, entries.length]);

  const safeIndex = Math.min(index, Math.max(entries.length - 1, 0));
  const current = entries[safeIndex] ?? "Aucune donnée";

  const move = useCallback(
    (delta: number) => {
      if (entries.length === 0) return;
      const next = Math.min(Math.max(safeIndex + delta, 0), entries.length - 1);
      if (next === safeIndex) return;
      setIndex(next);
      // iOS relit la valeur d'un élément ajustable ; Android a besoin d'une annonce.
      if (Platform.OS === "android") {
        AccessibilityInfo.announceForAccessibility(entries[next]);
      }
    },
    [entries, safeIndex],
  );

  const onAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") move(1);
      else if (event.nativeEvent.actionName === "decrement") move(-1);
    },
    [move],
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${title}. Jour ${safeIndex + 1} sur ${entries.length}. Balayez vers le haut ou le bas pour changer de jour.`}
      accessibilityValue={{ text: current }}
      accessibilityActions={ACTIONS as unknown as { name: string; label: string }[]}
      onAccessibilityAction={onAction}
    />
  );
}
