import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

const HINT_KEY = "swipe_delete_hint_shown";

/**
 * Provides a ref for the first ReanimatedSwipeable in a list.
 * On first-ever mount (per app install), peeks the swipeable open
 * then closes it to hint that swipe-to-delete is available.
 */
export function useSwipeHint() {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const [hintDone, setHintDone] = useState(true); // default true = no hint

  useEffect(() => {
    AsyncStorage.getItem(HINT_KEY).then((val) => {
      if (!val) setHintDone(false);
    });
  }, []);

  const triggerHint = useCallback(() => {
    if (hintDone) return;
    const ref = swipeableRef.current;
    if (!ref) return;

    setHintDone(true);
    AsyncStorage.setItem(HINT_KEY, "1");

    // Peek open after a short delay, then close
    setTimeout(() => {
      ref.openRight();
      setTimeout(() => {
        ref.close();
      }, 800);
    }, 600);
  }, [hintDone]);

  return { swipeableRef, hintDone, triggerHint };
}
