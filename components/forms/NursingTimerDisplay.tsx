// components/forms/NursingTimerDisplay.tsx
// Affichages qui « tournent » pendant une tétée. Chacun porte seul son
// intervalle : le formulaire Repas (et son pied collant) ne se re-rend plus à
// chaque seconde, seuls ces petits textes se mettent à jour.
import React, { memo, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import {
  nursingDraftLabel,
  sideSeconds,
  totalNursingSeconds,
  type NursingSide,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";

/**
 * Horloge locale : rafraîchie seulement tant que `active` est vrai. Une valeur
 * un peu ancienne est sans risque : chaque action du chrono fige le temps
 * compté à son propre horodatage, et le segment en cours ne compte jamais
 * moins de zéro.
 */
export function useTickingNow(active: boolean, intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatDurationA11y(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const m = `${minutes} minute${minutes > 1 ? "s" : ""}`;
  return seconds > 0 ? `${m} ${seconds} seconde${seconds > 1 ? "s" : ""}` : m;
}

/** Temps d'un côté (`side`) ou total des deux côtés, au format mm:ss. */
export const NursingElapsedText = memo(function NursingElapsedText({
  timer,
  side,
  style,
  a11yPrefix,
}: {
  timer: NursingTimerState;
  side?: NursingSide;
  style?: StyleProp<TextStyle>;
  /** Préfixe du libellé VoiceOver/TalkBack (ex. « Côté gauche »). */
  a11yPrefix?: string;
}) {
  const ticking = side ? timer.runningSide === side : timer.runningSide !== null;
  // 500 ms : aucune seconde sautée à l'affichage, pour un coût négligeable.
  const now = useTickingNow(ticking, 500);
  const seconds = side ? sideSeconds(timer, side, now) : totalNursingSeconds(timer, now);
  return (
    <Text
      style={style}
      accessibilityLabel={a11yPrefix ? `${a11yPrefix} : ${formatDurationA11y(seconds)}` : undefined}
    >
      {formatDuration(seconds)}
    </Text>
  );
});

export type NursingDraftBannerColors = {
  background: string;
  border: string;
  text: string;
  actionText: string;
  mutedText: string;
};

/**
 * Bandeau non bloquant : une tétée est en cours (ou en pause) alors que la
 * feuille Repas a été ouverte pour autre chose. Rien n'est imposé.
 */
export const NursingDraftBanner = memo(function NursingDraftBanner({
  draft,
  colors,
  onResume,
  onDiscard,
  disabled,
}: {
  draft: NursingTimerState;
  colors: NursingDraftBannerColors;
  onResume: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  // Le libellé est à la minute : un rafraîchissement toutes les 15 s suffit.
  const now = useTickingNow(draft.runningSide !== null, 15_000);
  const label = nursingDraftLabel(draft, now);
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.background, borderColor: colors.border }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.bannerText, { color: colors.text }]} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <View style={styles.bannerActions}>
        <TouchableOpacity
          onPress={onResume}
          disabled={disabled}
          style={styles.bannerButton}
          accessibilityRole="button"
          accessibilityLabel="Reprendre la tétée"
          accessibilityState={{ disabled: !!disabled }}
        >
          <Text style={[styles.bannerButtonText, { color: colors.actionText }]}>Reprendre</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDiscard}
          disabled={disabled}
          style={styles.bannerButton}
          accessibilityRole="button"
          accessibilityLabel="Abandonner la tétée"
          accessibilityHint="Demande une confirmation"
          accessibilityState={{ disabled: !!disabled }}
        >
          <Text style={[styles.bannerButtonText, { color: colors.mutedText }]}>Abandonner</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  bannerText: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
  },
  bannerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  bannerButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
