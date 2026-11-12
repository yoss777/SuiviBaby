import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Annonce au lecteur d'écran le passage actif ↔ inactif d'un minuteur
 * (démarrage / arrêt), jamais au montage ni à chaque minute.
 * Remplace les live regions posées sur le minuteur lui-même (P2-10).
 */
export function useAnnounceActiveChange(
  isActive: boolean,
  startedMessage: string,
  stoppedMessage: string,
): void {
  const previous = useRef(isActive);

  useEffect(() => {
    if (previous.current === isActive) return;
    previous.current = isActive;
    AccessibilityInfo.announceForAccessibility?.(
      isActive ? startedMessage : stoppedMessage,
    );
  }, [isActive, startedMessage, stoppedMessage]);
}
