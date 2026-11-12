import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** VoiceOver / TalkBack actif, tenu à jour par l'écouteur système. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      AccessibilityInfo.isScreenReaderEnabled?.()
        ?.then((v) => {
          if (mounted) setEnabled(!!v);
        })
        .catch(() => {});
    } catch {
      // Environnement sans AccessibilityInfo (tests)
    }
    const sub = AccessibilityInfo.addEventListener?.(
      "screenReaderChanged",
      (v: boolean) => setEnabled(!!v),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return enabled;
}
