// components/forms/useRepeatPress.ts
// Boutons +/− des formulaires : un appui = un pas (au relâchement, donc jamais
// déclenché par un doigt posé pour faire défiler la feuille) ; un appui long
// répète le pas, de plus en plus vite. Remplace l'ancien `onPressIn`, qui
// incrémentait dès le contact.
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import type { Insets } from "react-native";

export const REPEAT_LONG_PRESS_DELAY_MS = 350;
export const REPEAT_HIT_SLOP: Insets = { top: 8, bottom: 8, left: 8, right: 8 };

/**
 * Intervalle de répétition après `ticks` répétitions : 150 ms, puis 80 ms
 * après 8 pas, puis 40 ms après 20 pas.
 */
export function repeatIntervalMs(ticks: number): number {
  if (ticks >= 20) return 40;
  if (ticks >= 8) return 80;
  return 150;
}

export function useRepeatPress() {
  // État mutable lu uniquement dans les gestionnaires (jamais au rendu).
  const stateRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    ticks: 0,
  });

  const stop = useCallback(() => {
    const state = stateRef.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.ticks = 0;
  }, []);

  useEffect(() => stop, [stop]);

  return useCallback(
    (action: () => void) => ({
      onPress: () => {
        const state = stateRef.current;
        // Un appui long a déjà appliqué ses pas : pas de pas supplémentaire.
        if (state.ticks > 0) return;
        action();
      },
      onLongPress: () => {
        stop();
        Haptics.selectionAsync().catch(() => {});
        const state = stateRef.current;
        const tick = () => {
          action();
          state.ticks += 1;
          state.timer = setTimeout(tick, repeatIntervalMs(state.ticks));
        };
        tick();
      },
      onPressOut: () => {
        const state = stateRef.current;
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
        // Remis à zéro après le onPress éventuel qui suit onPressOut.
        setTimeout(() => {
          state.ticks = 0;
        }, 0);
      },
      delayLongPress: REPEAT_LONG_PRESS_DELAY_MS,
      hitSlop: REPEAT_HIT_SLOP,
    }),
    [stop],
  );
}
