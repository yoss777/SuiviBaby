import { NavigationContext } from "expo-router/react-navigation";
import { createContext, useContext, useEffect, useRef } from "react";
import { AppState } from "react-native";

type UseForegroundServerRefreshParams<T> = {
  enabled?: boolean;
  thresholdMs?: number;
  /**
   * Enfant concerné par la relecture. Si l'enfant change pendant qu'une
   * relecture est en vol, son résultat est jeté (jamais écrit dans l'état
   * d'un autre enfant).
   */
  childId?: string | null;
  refresh: () => Promise<T>;
  apply: (result: T) => void;
};

const DEFAULT_THRESHOLD_MS = 30_000;

// Contexte de repli quand le hook tourne hors d'un navigateur (tests, mocks) :
// `useContext` ne doit jamais recevoir `undefined`.
const NoNavigationContext = createContext<{ isFocused: () => boolean } | undefined>(
  undefined,
);

export function useForegroundServerRefresh<T>({
  enabled = true,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  childId,
  refresh,
  apply,
}: UseForegroundServerRefreshParams<T>) {
  const refreshRef = useRef(refresh);
  const applyRef = useRef(apply);
  const sequenceRef = useRef(0);
  const childIdRef = useRef(childId);
  // Les onglets restent montés quand ils ne sont pas affichés : on lit la
  // navigation au moment de l'événement (pas d'état, donc aucun rendu en plus).
  const navigation = useContext(
    (NavigationContext as typeof NoNavigationContext | undefined) ??
      NoNavigationContext,
  );
  const navigationRef = useRef(navigation);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  // Garde d'enfant : tout changement d'enfant invalide les relectures en vol.
  useEffect(() => {
    if (childIdRef.current !== childId) {
      childIdRef.current = childId;
      sequenceRef.current += 1;
    }
  }, [childId]);

  useEffect(() => {
    if (!enabled) return;

    let lastBackgroundedAt: number | null = null;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        const backgroundedFor =
          lastBackgroundedAt != null ? Date.now() - lastBackgroundedAt : 0;
        lastBackgroundedAt = null;

        if (backgroundedFor < thresholdMs) return;

        // Écran non affiché : son écouteur temps réel reste la source de
        // vérité, une relecture serveur serait une lecture Firestore perdue.
        if (navigationRef.current && !navigationRef.current.isFocused()) return;

        const sequence = ++sequenceRef.current;
        refreshRef.current()
          .then((result) => {
            if (sequenceRef.current !== sequence) return;
            applyRef.current(result);
          })
          .catch(() => {
            // Foreground refresh is opportunistic; listeners remain authoritative.
          });
      } else if (
        nextAppState === "background" ||
        nextAppState === "inactive"
      ) {
        if (lastBackgroundedAt == null) {
          lastBackgroundedAt = Date.now();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, thresholdMs]);
}
