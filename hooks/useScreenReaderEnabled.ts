import { useEffect, useState } from "react";

import {
  isScreenReaderOnNow,
  refreshScreenReader,
  subscribeScreenReader,
} from "@/services/screenReader";

/** VoiceOver / TalkBack actif ; initialisé depuis le cache partagé (pas de faux « inactif » au 1er rendu). */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(isScreenReaderOnNow);

  useEffect(() => {
    const unsubscribe = subscribeScreenReader(setEnabled);
    setEnabled(isScreenReaderOnNow());
    void refreshScreenReader();
    return unsubscribe;
  }, []);

  return enabled;
}
