// Indicateur compact « Tétée en cours » de l'Accueil : visible dès qu'un
// brouillon de chrono tétée existe pour l'enfant actif ; un appui rouvre la
// feuille Repas en Tétée, qui reprend le brouillon. Le brouillon est lu via
// l'API publique de nursingTimer (format inchangé). Le composant porte seul son
// minuteur : l'Accueil ne se re-rend pas pendant la tétée.
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect } from "expo-router";
import React, { memo, useCallback, useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  isNursingDraftStale,
  loadNursingTimer,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";
import {
  getCategoryColors,
  getCategoryTextColors,
  getNeutralColors,
} from "@/constants/dashboardColors";
import { useSheetState } from "@/contexts/SheetContext";
import { useNightMode } from "@/hooks/useNightMode";
import { describeNursingDraft } from "@/utils/nursingDraftDisplay";

/** Rafraîchissement du temps affiché pendant qu'un côté tourne. */
export const NURSING_BANNER_TICK_MS = 15_000;
/** En pause : seule l'échéance d'effacement compte, une minute suffit. */
export const NURSING_BANNER_PAUSED_TICK_MS = 60_000;

interface Props {
  childId: string | undefined;
  onResume: () => void;
  colorScheme: "light" | "dark";
}

export const NursingInProgressBanner = memo(function NursingInProgressBanner({
  childId,
  onResume,
  colorScheme,
}: Props) {
  const [draft, setDraft] = useState<NursingTimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { isOpen: sheetOpen } = useSheetState();
  const { minButtonSize } = useNightMode();

  const reload = useCallback(() => {
    if (!childId) {
      setDraft(null);
      return () => {};
    }
    let cancelled = false;
    void loadNursingTimer(childId).then((state) => {
      if (cancelled) return;
      setDraft(state);
      setNow(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  // Relu au focus de l'Accueil, au changement d'enfant et à la fermeture de la
  // feuille (le chrono a pu démarrer, s'arrêter ou être enregistré).
  useFocusEffect(reload);
  useEffect(() => {
    if (sheetOpen) return;
    return reload();
  }, [sheetOpen, reload]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => sub.remove();
  }, [reload]);

  const running = draft?.runningSide != null;
  const hasDraft = draft != null;
  useEffect(() => {
    if (!hasDraft) return;
    const id = setInterval(
      () => setNow(Date.now()),
      running ? NURSING_BANNER_TICK_MS : NURSING_BANNER_PAUSED_TICK_MS,
    );
    return () => clearInterval(id);
  }, [hasDraft, running]);

  // Brouillon arrivé à échéance pendant que l'Accueil est affiché : relu (et
  // effacé par loadNursingTimer) pour que le bandeau disparaisse.
  const stale = draft != null && isNursingDraftStale(draft, now);
  useEffect(() => {
    if (!stale) return;
    return reload();
  }, [stale, reload]);

  if (!draft) return null;

  const display = describeNursingDraft(draft, now);
  const nc = getNeutralColors(colorScheme);
  const cat = getCategoryColors(colorScheme).alimentation;
  const accentText = getCategoryTextColors(colorScheme).alimentation;

  return (
    <Pressable
      onPress={onResume}
      accessibilityRole="button"
      accessibilityLabel={display.accessibilityLabel}
      accessibilityHint="Ouvre le chrono de la tétée"
      android_ripple={{ color: nc.backgroundPressed }}
      style={({ pressed }) => [
        styles.banner,
        {
          minHeight: minButtonSize,
          // Android : le ripple suffit (pas de double retour au toucher).
          backgroundColor:
            pressed && Platform.OS !== "android" ? nc.backgroundPressed : cat.background,
          borderColor: cat.border,
        },
      ]}
      testID="nursing-in-progress-banner"
    >
      <View style={[styles.dot, { backgroundColor: running ? cat.primary : nc.textMuted }]} />
      <FontAwesome name="person-breastfeeding" size={16} color={accentText} />
      <View style={styles.labelColumn}>
        <Text style={[styles.label, { color: nc.textStrong }]} numberOfLines={2}>
          {display.label}
        </Text>
        {display.expiryLabel && (
          <Text
            style={[styles.expiry, { color: display.expiringSoon ? nc.errorText : nc.textNormal }]}
            numberOfLines={1}
          >
            {display.expiryLabel}
          </Text>
        )}
      </View>
      <Text style={[styles.action, { color: accentText }]}>Reprendre</Text>
      <FontAwesome name="chevron-right" size={12} color={accentText} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    // Borne le ripple Android aux coins arrondis (aucun badge ne déborde).
    overflow: "hidden",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelColumn: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  expiry: {
    fontSize: 13,
    fontWeight: "500",
  },
  action: {
    fontSize: 14,
    fontWeight: "600",
  },
});
