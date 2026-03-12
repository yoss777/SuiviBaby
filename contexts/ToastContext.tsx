import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@gorhom/portal";

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
  dismissToast: () => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  showUndoToast: () => {},
  dismissToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ToastAction | null>(null);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpireRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    setMessage(null);
    setAction(null);
    clearTimer();
  }, [clearTimer]);

  const showToast = useCallback(
    (text: string, durationMs = 2600, toastPosition: "top" | "bottom" = "bottom") => {
    onExpireRef.current = null;
    setMessage(text);
    setAction(null);
    setPosition(toastPosition);
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      setAction(null);
      timeoutRef.current = null;
    }, durationMs);
  }, [clearTimer]);

  const showUndoToast = useCallback(
    (text: string, onUndo: () => void, onExpire?: () => void, durationMs = 4000) => {
    onExpireRef.current = onExpire ?? null;
    setMessage(text);
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
      onExpireRef.current?.();
      onExpireRef.current = null;
    }, durationMs);
  }, [clearTimer]);

  return (
    <ToastContext.Provider value={{ showToast, showUndoToast, dismissToast: dismiss }}>
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
                : { bottom: insets.bottom + 24 },
            ]}
          >
            <Text style={[styles.toastText, action && styles.toastTextWithAction]}>
              {message}
            </Text>
            {action && (
              <Pressable onPress={action.onPress} hitSlop={8} style={styles.actionButton}>
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
    backgroundColor: "rgba(20, 20, 20, 0.92)",
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
    gap: 12,
    paddingRight: 12,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  toastTextWithAction: {
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    color: "#6CB4EE",
    fontSize: 13,
    fontWeight: "700",
  },
});
