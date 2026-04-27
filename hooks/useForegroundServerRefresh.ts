import { useEffect, useRef } from "react";
import { AppState } from "react-native";

type UseForegroundServerRefreshParams<T> = {
  enabled?: boolean;
  thresholdMs?: number;
  refresh: () => Promise<T>;
  apply: (result: T) => void;
};

const DEFAULT_THRESHOLD_MS = 30_000;

export function useForegroundServerRefresh<T>({
  enabled = true,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  refresh,
  apply,
}: UseForegroundServerRefreshParams<T>) {
  const refreshRef = useRef(refresh);
  const applyRef = useRef(apply);
  const sequenceRef = useRef(0);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;

    let lastBackgroundedAt: number | null = null;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        const backgroundedFor =
          lastBackgroundedAt != null ? Date.now() - lastBackgroundedAt : 0;
        lastBackgroundedAt = null;

        if (backgroundedFor < thresholdMs) return;

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
