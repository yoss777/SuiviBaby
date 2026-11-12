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

type PendingUndo = {
  key: number;
  message: string;
  onUndo: () => void;
  onExpire: (() => void) | null;
  timer: ReturnType<typeof setTimeout>;
};

type InfoToast = {
  message: string;
  action: ToastAction | null;
  position: "top" | "bottom";
};

/** Écart vertical entre le toast d'annulation et un toast affiché au-dessus. */
const STACK_GAP = 56;

/**
 * Deux emplacements indépendants (audit UI/UX V3, N-V3-4) :
 * - les annulations en attente : chacune garde son propre délai (8 s) et reste
 *   annulable jusqu'au bout. « Annuler » porte sur la plus récente ; la
 *   précédente reprend alors sa place. Un autre toast ne valide plus en
 *   silence une suppression en attente ;
 * - le toast d'information ou d'action (« Enregistré », « Réessayer »), posé
 *   au-dessus du toast d'annulation quand les deux sont visibles.
 * Les suppressions en attente partent tout de suite si l'app passe en
 * arrière-plan (minuteur non fiable une fois l'app suspendue).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<InfoToast | null>(null);
  const [undos, setUndos] = useState<{ key: number; message: string }[]>([]);
  const [bottomInset, setBottomInsetState] = useState(0);
  const setBottomInset = useCallback((height: number) => {
    setBottomInsetState(Math.max(0, Math.round(height)));
  }, []);
  const infoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingUndo[]>([]);
  const nextKeyRef = useRef(1);

  const syncUndos = useCallback(() => {
    setUndos(pendingRef.current.map(({ key, message }) => ({ key, message })));
  }, []);

  const clearInfoTimer = useCallback(() => {
    if (infoTimerRef.current) {
      clearTimeout(infoTimerRef.current);
      infoTimerRef.current = null;
    }
  }, []);

  const takePending = useCallback(
    (key: number): PendingUndo | null => {
      const entry = pendingRef.current.find((item) => item.key === key) ?? null;
      if (!entry) return null;
      clearTimeout(entry.timer);
      pendingRef.current = pendingRef.current.filter((item) => item.key !== key);
      syncUndos();
      return entry;
    },
    [syncUndos],
  );

  // Exécute tout de suite toutes les suppressions en attente (arrière-plan,
  // fermeture explicite du toast).
  const flushPendingUndos = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const entries = pendingRef.current;
    pendingRef.current = [];
    entries.forEach((entry) => clearTimeout(entry.timer));
    syncUndos();
    entries.forEach((entry) => entry.onExpire?.());
  }, [syncUndos]);

  const dismiss = useCallback(() => {
    flushPendingUndos();
    clearInfoTimer();
    setInfo(null);
  }, [clearInfoTimer, flushPendingUndos]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") flushPendingUndos();
    });
    return () => subscription.remove();
  }, [flushPendingUndos]);

  // Minuteurs arrêtés au démontage du provider.
  useEffect(
    () => () => {
      pendingRef.current.forEach((entry) => clearTimeout(entry.timer));
      if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
    },
    [],
  );

  const showInfo = useCallback(
    (next: InfoToast, durationMs: number) => {
      setInfo(next);
      clearInfoTimer();
      infoTimerRef.current = setTimeout(() => {
        setInfo(null);
        infoTimerRef.current = null;
      }, durationMs);
    },
    [clearInfoTimer],
  );

  const showToast = useCallback(
    (text: string, durationMs = 2600, toastPosition: "top" | "bottom" = "bottom") => {
      announce(text);
      showInfo({ message: text, action: null, position: toastPosition }, durationMs);
    },
    [showInfo],
  );

  const showUndoToast = useCallback(
    (text: string, onUndo: () => void, onExpire?: () => void, durationMs = ACTION_TOAST_MIN_MS) => {
      const key = nextKeyRef.current++;
      const timer = setTimeout(() => {
        const entry = takePending(key);
        entry?.onExpire?.();
      }, Math.max(durationMs, ACTION_TOAST_MIN_MS));
      pendingRef.current = [
        ...pendingRef.current,
        { key, message: text, onUndo, onExpire: onExpire ?? null, timer },
      ];
      syncUndos();
      announce(text, "Annuler");
    },
    [syncUndos, takePending],
  );

  const undoLatest = useCallback(() => {
    const latest = pendingRef.current[pendingRef.current.length - 1];
    if (!latest) return;
    const entry = takePending(latest.key);
    entry?.onUndo();
  }, [takePending]);

  const showActionToast = useCallback(
    (text: string, actionLabel: string, onAction: () => void, durationMs = ACTION_TOAST_MIN_MS) => {
      announce(text, actionLabel);
      showInfo(
        {
          message: text,
          position: "bottom",
          action: {
            label: actionLabel,
            onPress: () => {
              clearInfoTimer();
              setInfo(null);
              onAction();
            },
          },
        },
        Math.max(durationMs, ACTION_TOAST_MIN_MS),
      );
    },
    [clearInfoTimer, showInfo],
  );

  // Valeur stable : le message affiché reste en état local du provider, les
  // consommateurs (qui n'appellent que des fonctions) ne se re-rendent pas.
  const value = useMemo(
    () => ({ showToast, showUndoToast, showActionToast, dismissToast: dismiss, setBottomInset }),
    [showToast, showUndoToast, showActionToast, dismiss, setBottomInset],
  );

  // Au-dessus de la barre d'onglets et du dock vocal quand ils sont affichés
  // (leur hauteur inclut la zone de sécurité).
  const bottomBase = toastBottomOffset({ chromeInset: bottomInset, safeAreaBottom: insets.bottom });
  const latestUndo = undos[undos.length - 1];
  const undoMessage = latestUndo
    ? undos.length > 1
      ? `${latestUndo.message} (+${undos.length - 1})`
      : latestUndo.message
    : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {(info || undoMessage) && (
        <Portal>
          {undoMessage && (
            <ToastView
              testID="toast-undo"
              message={undoMessage}
              action={{ label: "Annuler", onPress: undoLatest }}
              positionStyle={{ bottom: bottomBase }}
            />
          )}
          {info && (
            <ToastView
              testID="toast-info"
              message={info.message}
              action={info.action}
              positionStyle={
                info.position === "top"
                  ? { top: insets.top + 16 }
                  : { bottom: undoMessage ? bottomBase + STACK_GAP : bottomBase }
              }
            />
          )}
        </Portal>
      )}
    </ToastContext.Provider>
  );
}

function ToastView({
  message,
  action,
  positionStyle,
  testID,
}: {
  message: string;
  action: ToastAction | null;
  positionStyle: { top: number } | { bottom: number };
  testID: string;
}) {
  return (
    <View
      testID={testID}
      pointerEvents={action ? "box-none" : "none"}
      style={[styles.toast, action && styles.toastWithAction, positionStyle]}
    >
      <Text style={[styles.toastText, action && styles.toastTextWithAction]}>{message}</Text>
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
