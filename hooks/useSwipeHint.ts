import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { useToast } from "@/contexts/ToastContext";

const HINT_KEY = "swipe_delete_hint_shown";
const LONG_PRESS_HINT_KEY = "long_press_actions_hint_shown";
export const LONG_PRESS_HINT_TOAST = "Astuce : appui long sur une ligne pour la modifier ou la supprimer";

/**
 * Provides a ref for the first ReanimatedSwipeable in a list.
 * On first-ever mount (per app install), peeks the swipeable open
 * then closes it to hint that swipe-to-delete is available.
 * Une seule fois aussi (clé séparée, donc également pour ceux qui ont déjà vu
 * le glissement) : un toast discret signale le menu de l'appui long.
 */
export function useSwipeHint() {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const [hintDone, setHintDone] = useState(true); // default true = no hint
  const [longPressHintDone, setLongPressHintDone] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.multiGet([HINT_KEY, LONG_PRESS_HINT_KEY])
      .then((entries) => {
        if (cancelled) return;
        const values = new Map(entries);
        if (!values.get(HINT_KEY)) setHintDone(false);
        if (!values.get(LONG_PRESS_HINT_KEY)) setLongPressHintDone(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerHint = useCallback(() => {
    const ref = swipeableRef.current;
    if (!ref) return;
    const peek = !hintDone;
    if (peek) {
      setHintDone(true);
      void AsyncStorage.setItem(HINT_KEY, "1");
      // Peek open after a short delay, then close
      setTimeout(() => {
        ref.openRight();
        setTimeout(() => {
          ref.close();
        }, 800);
      }, 600);
    }
    if (!longPressHintDone) {
      setLongPressHintDone(true);
      void AsyncStorage.setItem(LONG_PRESS_HINT_KEY, "1");
      setTimeout(() => showToast(LONG_PRESS_HINT_TOAST, 4000), peek ? 1600 : 800);
    }
  }, [hintDone, longPressHintDone, showToast]);

  return { swipeableRef, hintDone, triggerHint };
}
