import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@gorhom/portal";
import { toastBottomOffset } from "@/utils/toastInset";

type ToastAction = {
  label: string;
  onPress: () => void;
};

type ToastContextValue = {
  showToast: (
    message: string,
    durationMs?: number,
    position?: "top" | "bottom"
  ) => void;
  showUndoToast: (
    message: string,
    onUndo: () => void,
    onExpire?: () => void,
    durationMs?: number
  ) => void;
  showActionToast: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    durationMs?: number
  ) => void;
  dismissToast: () => void;
  /**
   * Hauteur occupée en bas de l'écran (barre d'onglets + dock vocal) : le
   * toast du bas se pose au-dessus. 0 = seulement la zone de sécurité.
   */
  setBottomInset: (height: number) => void;
};

/** Un toast avec action reste au moins 8 s (WCAG 2.2.1, temps suffisant). */
export const ACTION_TOAST_MIN_MS = 8000;

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  showUndoToast: () => {},
  showActionToast: () => {},
  dismissToast: () => {},
  setBottomInset: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// Alias explicite : toutes les fonctions sont stables, le contexte ne porte pas d'état.
export const useToastActions = useToast;

/**
 * Déclare la hauteur du chrome du bas (barre d'onglets, dock vocal) tant que
 * le composant est monté : les toasts s'affichent au-dessus.
 */
export function useToastBottomInset(height: number) {
  const { setBottomInset } = useContext(ToastContext);
  useEffect(() => {
    setBottomInset(height);
  }, [height, setBottomInset]);
  useEffect(() => () => setBottomInset(0), [setBottomInset]);
}

function announce(text: string, actionLabel?: string) {
  AccessibilityInfo.announceForAccessibility(
    actionLabel ? `${text}. Action disponible : ${actionLabel}.` : text,
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ToastAction | null>(null);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [bottomInset, setBottomInsetState] = useState(0);
  const setBottomInset = useCallback((height: number) => {
    setBottomInsetState(Math.max(0, Math.round(height)));
  }, []);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpireRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Exécute tout de suite la suppression qui attendait la fin du délai
  // d'annulation. Appelé quand un autre toast prend la place du toast
  // d'annulation (sinon la suppression serait perdue : l'élément resterait
  // masqué puis réapparaîtrait) et quand l'app passe en arrière-plan (le
  // minuteur ne tourne plus de façon fiable une fois l'app suspendue).
  const flushPendingUndo = useCallback(() => {
    const pending = onExpireRef.current;
    if (!pending) return;
    onExpireRef.current = null;
    clearTimer();
    setMessage(null);
    setAction(null);
    pending();
  }, [clearTimer]);

  // Fermer le toast pendant un délai d'annulation : la suppression part (flush)
  // plutôt que de laisser un rappel périmé qui se déclencherait au toast suivant.
  const dismiss = useCallback(() => {
    flushPendingUndo();
    setMessage(null);
    setAction(null);
    clearTimer();
  }, [clearTimer, flushPendingUndo]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") flushPendingUndo();
    });
    return () => subscription.remove();
  }, [flushPendingUndo]);

  const showToast = useCallback(
    (text: string, durationMs = 2600, toastPosition: "top" | "bottom" = "bottom") => {
    flushPendingUndo();
    setMessage(text);
    setAction(null);
    setPosition(toastPosition);
    announce(text);
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      setAction(null);
      timeoutRef.current = null;
    }, durationMs);
  }, [clearTimer, flushPendingUndo]);

  const showUndoToast = useCallback(
    (text: string, onUndo: () => void, onExpire?: () => void, durationMs = ACTION_TOAST_MIN_MS) => {
    flushPendingUndo();
    onExpireRef.current = onExpire ?? null;
    setMessage(text);
    announce(text, "Annuler");
    setAction({
      label: "Annuler",
      onPress: () => {
        clearTimer();
        onExpireRef.current = null;
        onUndo();
        setMessage(null);
        setAction(null);
      },
    });
    setPosition("bottom");
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      setAction(null);
      timeoutRef.current = null;
      const expire = onExpireRef.current;
      onExpireRef.current = null;
      expire?.();
    }, Math.max(durationMs, ACTION_TOAST_MIN_MS));
  }, [clearTimer, flushPendingUndo]);

  const showActionToast = useCallback(
    (text: string, actionLabel: string, onAction: () => void, durationMs = ACTION_TOAST_MIN_MS) => {
    flushPendingUndo();
    setMessage(text);
    announce(text, actionLabel);
    setAction({
      label: actionLabel,
      onPress: () => {
        clearTimer();
        onAction();
        setMessage(null);
        setAction(null);
      },
    });
    setPosition("bottom");
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      setAction(null);
      timeoutRef.current = null;
    }, Math.max(durationMs, ACTION_TOAST_MIN_MS));
  }, [clearTimer, flushPendingUndo]);

  // Valeur stable : le message affiché reste en état local du provider, les
  // consommateurs (qui n'appellent que des fonctions) ne se re-rendent pas.
  const value = useMemo(
    () => ({ showToast, showUndoToast, showActionToast, dismissToast: dismiss, setBottomInset }),
    [showToast, showUndoToast, showActionToast, dismiss, setBottomInset],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && (
        <Portal>
          <View
            pointerEvents={action ? "box-none" : "none"}
            style={[
              styles.toast,
              action && styles.toastWithAction,
              position === "top"
                ? { top: insets.top + 16 }
                : {
                    // Au-dessus de la barre d'onglets et du dock vocal quand
                    // ils sont affichés (leur hauteur inclut la zone de sécurité).
                    bottom: toastBottomOffset({ chromeInset: bottomInset, safeAreaBottom: insets.bottom }),
                  },
            ]}
          >
            <Text style={[styles.toastText, action && styles.toastTextWithAction]}>
              {message}
            </Text>
            {action && (
              <Pressable
                onPress={action.onPress}
                hitSlop={4}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={styles.actionText}>{action.label}</Text>
              </Pressable>
            )}
          </View>
        </Portal>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    // Gris-700 + liseré : visible sur le fond clair ET sur le fond sombre
    // #111827 (l'ancien rgba(20,20,20,.92) s'y fondait). Le provider est
    // monté hors du thème de l'app : couleurs indépendantes du schéma.
    backgroundColor: "#374151",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: "90%",
    zIndex: 99999,
    elevation: 99999,
  },
  toastWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 0,
    paddingRight: 4,
    minHeight: 48,
  },
  toastText: {
    color: "#ffffff", // 10.3:1 sur #374151
    fontSize: 13,
    fontWeight: "600",
  },
  toastTextWithAction: {
    flex: 1,
  },
  // Cible ≥ 44 pt (l'ancienne faisait ~33 pt)
  actionButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  actionButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  actionText: {
    color: "#93c5fd", // 5.6:1 sur #374151
    fontSize: 13,
    fontWeight: "700",
  },
});
