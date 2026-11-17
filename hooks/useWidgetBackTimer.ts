// hooks/useWidgetBackTimer.ts
// Android : après une action lancée depuis le widget, retour à l'écran
// d'accueil après la durée minimale du toast « Annuler » + 0,5 s, si l'écran
// n'est pas touché entre-temps. Jamais avec un lecteur d'écran (TalkBack) :
// l'utilisateur n'aurait pas le temps de lire ni d'annuler. Callbacks stables.
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { ACTION_TOAST_MIN_MS } from "@/contexts/ToastContext";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";
import { moveAppToBack } from "@/modules/widget-push";

export const WIDGET_BACK_DELAY_MS = ACTION_TOAST_MIN_MS + 500;

export function useWidgetBackTimer(): { schedule: () => void; cancel: () => void } {
  const screenReaderOn = useScreenReaderEnabled();
  const screenReaderRef = useRef(screenReaderOn);
  screenReaderRef.current = screenReaderOn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const schedule = useCallback(() => {
    if (Platform.OS !== "android") return;
    cancel();
    if (screenReaderRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void moveAppToBack();
    }, WIDGET_BACK_DELAY_MS);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { schedule, cancel };
}
