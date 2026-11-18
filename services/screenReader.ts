// services/screenReader.ts
// État VoiceOver / TalkBack connu tout de suite : lu une fois au chargement du
// module, tenu à jour par l'écouteur système. Source partagée du hook
// useScreenReaderEnabled, des toasts et du retour auto du widget.
import { AccessibilityInfo } from "react-native";

let current = false;
// Version des mises à jour poussées par le système : une lecture fraîche partie
// avant un événement « screenReaderChanged » ne doit pas écraser l'état plus récent.
let eventVersion = 0;
const listeners = new Set<(on: boolean) => void>();

function set(next: boolean) {
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn(next));
}

/** Lecture fraîche de l'état système ; met le cache à jour. */
export async function refreshScreenReader(): Promise<boolean> {
  const startedAt = eventVersion;
  try {
    const value = await AccessibilityInfo.isScreenReaderEnabled?.();
    if (eventVersion === startedAt) set(!!value);
  } catch {
    // Environnement sans AccessibilityInfo (tests) : on garde le cache.
  }
  return current;
}

/** Valeur en cache, lisible de façon synchrone. */
export function isScreenReaderOnNow(): boolean {
  return current;
}

/** Notifie les changements d'état ; retourne la fonction de désabonnement. */
export function subscribeScreenReader(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

try {
  AccessibilityInfo.addEventListener?.("screenReaderChanged", (v: boolean) => {
    eventVersion += 1;
    set(!!v);
  });
} catch {
  // idem
}
void refreshScreenReader();
